import { Matrix3, Vector3 } from 'three';
import { polygonContains, type Point } from './apartment.ts';
import { type Arrangement, type SceneNode, type Vec3 } from './editor-model.ts';
import { nodeWorldMatrix, wallBlocks } from './editor-geometry.ts';
import type { WallFace } from './design-types.ts';

export interface MeasuredRoom {
  id: string;
  name: string;
  floor: SceneNode;
  polygon: Point[];
  holes: Point[][];
  elevation: number;
  floorArea: number;
  wallArea: number;
  skirting: number;
}
export interface WallSurface {
  wallId: string;
  face: WallFace;
  roomId: string | null;
  from: Vec3;
  to: Vec3;
  up: Vec3;
  area: number;
  length: number;
}
export const signedArea = (points: Point[]) =>
  points.reduce((sum, a, i) => {
    const b = points[(i + 1) % points.length];
    return sum + a[0] * b[1] - b[0] * a[1];
  }, 0) / 2;
function spatialArea(points: Vector3[]) {
  const sum = new Vector3();
  points.forEach((a, i) =>
    sum.add(a.clone().cross(points[(i + 1) % points.length])),
  );
  return sum.length() / 2;
}
function visibleNodes(nodes: SceneNode[]) {
  const result: SceneNode[] = [];
  const visit = (node: SceneNode) => {
    if (!node.visible) return;
    result.push(node);
    node.children.forEach(visit);
  };
  nodes.forEach(visit);
  return result;
}
export function measuredRooms(nodes: SceneNode[]): MeasuredRoom[] {
  return visibleNodes(nodes)
    .filter((n) => n.geometry.kind === 'floor' && n.geometry.polygon)
    .map((floor) => {
      const matrix = nodeWorldMatrix(nodes, floor.id)!;
      const transform = (points: Point[]) =>
        points.map(([x, z]) =>
          new Vector3(x, floor.geometry.size[1], z).applyMatrix4(matrix),
        );
      const polygon = transform(floor.geometry.polygon!),
        holes = (floor.geometry.holes ?? []).map(transform);
      return {
        id: floor.id,
        name: floor.name.replace(/^Пол — /, ''),
        floor,
        polygon: polygon.map((p) => [p.x, p.z]),
        holes: holes.map((h) => h.map((p) => [p.x, p.z])),
        elevation: polygon.reduce((sum, p) => sum + p.y / polygon.length, 0),
        floorArea: Math.max(
          0,
          spatialArea(polygon) -
            holes.reduce((sum, h) => sum + spatialArea(h), 0),
        ),
        wallArea: 0,
        skirting: 0,
      };
    });
}
export function roomContains(
  room: Pick<MeasuredRoom, 'polygon' | 'holes'>,
  point: Point,
) {
  return (
    polygonContains(room.polygon, point) &&
    !room.holes.some((h) => polygonContains(h, point))
  );
}
/** Split a surface exactly where its outward offset crosses any room boundary. */
function surfaceIntervals(a: Point, b: Point, rooms: MeasuredRoom[]) {
  const dx = b[0] - a[0],
    dz = b[1] - a[1],
    cuts = [0, 1];
  for (const room of rooms)
    for (const points of [room.polygon, ...room.holes])
      points.forEach((p, i) => {
        const q = points[(i + 1) % points.length],
          ex = q[0] - p[0],
          ez = q[1] - p[1],
          determinant = dx * ez - dz * ex;
        if (Math.abs(determinant) < 1e-12) return;
        const px = p[0] - a[0],
          pz = p[1] - a[1];
        const t = (px * ez - pz * ex) / determinant,
          u = (px * dz - pz * dx) / determinant;
        if (t > 1e-9 && t < 1 - 1e-9 && u >= -1e-9 && u <= 1 + 1e-9)
          cuts.push(t);
      });
  cuts.sort((a, b) => a - b);
  return cuts.slice(0, -1).flatMap((from, i) => {
    const to = cuts[i + 1];
    if (to - from < 1e-8) return [];
    const mid = (from + to) / 2,
      point: Point = [a[0] + dx * mid, a[1] + dz * mid];
    // Overlapping room contours are an editor possibility. Prefer the smaller defined room deterministically.
    const room = rooms
      .filter((r) => roomContains(r, point))
      .sort((a, b) => a.floorArea - b.floorArea || a.id.localeCompare(b.id))[0];
    return [{ from, to, roomId: room?.id ?? null }];
  });
}
export function measureSurfaces(scene: Pick<Arrangement, 'objects'>) {
  const nodes = scene.objects,
    rooms = measuredRooms(nodes),
    surfaces: WallSurface[] = [];
  for (const wall of visibleNodes(nodes).filter(
    (n) => n.geometry.kind === 'wall',
  )) {
    const matrix = nodeWorldMatrix(nodes, wall.id)!,
      normalMatrix = new Matrix3().getNormalMatrix(matrix);
    for (const block of wallBlocks(wall)) {
      const [x, y, z] = block.position,
        [w, h, d] = block.size;
      const polygon: Point[] = block.profile ?? [
        [x - w / 2, z - d / 2],
        [x + w / 2, z - d / 2],
        [x + w / 2, z + d / 2],
        [x - w / 2, z + d / 2],
      ];
      const bottom = block.profile ? y : y - h / 2,
        winding = Math.sign(signedArea(polygon));
      polygon.forEach((p, i) => {
        const q = polygon[(i + 1) % polygon.length],
          nx = winding * (q[1] - p[1]),
          nz = -winding * (q[0] - p[0]);
        // Match the renderer's A/B faces. Ends, tops and opening reveals are separate finish work.
        if (Math.abs(nz) < Math.abs(nx) || Math.hypot(nx, nz) < 1e-9) return;
        const face: WallFace = nz > 0 ? 'front' : 'back';
        const a = new Vector3(p[0], bottom, p[1]).applyMatrix4(matrix),
          b = new Vector3(q[0], bottom, q[1]).applyMatrix4(matrix);
        const up = new Vector3(p[0], bottom + h, p[1])
          .applyMatrix4(matrix)
          .sub(a);
        const normal = new Vector3(nx, 0, nz)
          .applyMatrix3(normalMatrix)
          .normalize();
        const totalArea = b.clone().sub(a).cross(up).length(),
          length = a.distanceTo(b);
        const offset = 0.01;
        const aa: Point = [a.x + normal.x * offset, a.z + normal.z * offset],
          bb: Point = [b.x + normal.x * offset, b.z + normal.z * offset];
        for (const interval of surfaceIntervals(aa, bb, rooms)) {
          const from = a.clone().lerp(b, interval.from),
            to = a.clone().lerp(b, interval.to);
          const surface: WallSurface = {
            wallId: wall.id,
            face,
            roomId: interval.roomId,
            from: from.toArray(),
            to: to.toArray(),
            up: up.toArray(),
            area: totalArea * (interval.to - interval.from),
            length: length * (interval.to - interval.from),
          };
          surfaces.push(surface);
          const room = rooms.find((r) => r.id === interval.roomId);
          if (room) {
            room.wallArea += surface.area;
            if (
              Math.abs(from.y - room.elevation) < 0.05 &&
              Math.abs(to.y - room.elevation) < 0.05
            )
              room.skirting += surface.length;
          }
        }
      });
    }
  }
  const unassignedWallArea = surfaces
    .filter((s) => s.roomId === null)
    .reduce((sum, s) => sum + s.area, 0);
  return { rooms, surfaces, unassignedWallArea };
}
