import { Vector3 } from 'three';
import type { CameraState, SceneNode, Vec3 } from './editor-model.ts';
import {
  nodeMatrix,
  roomLabelPosition,
  sceneBounds,
} from './editor-geometry.ts';
import {
  analysisFootprints,
  polygonsOverlap,
  type Footprint,
} from './plan-analysis.ts';
import { polygonContains, type Point } from './apartment.ts';
export function viewAngles(camera: CameraState) {
  const d = new Vector3(...camera.target)
    .sub(new Vector3(...camera.position))
    .normalize();
  return { yaw: Math.atan2(d.x, -d.z), pitch: Math.asin(d.y) };
}
export function lookCamera(
  position: Vec3,
  yaw: number,
  pitch = 0,
): CameraState {
  const p = Math.max(-1.35, Math.min(1.35, pitch));
  return {
    position: [...position],
    target: [
      position[0] + Math.sin(yaw) * Math.cos(p),
      position[1] + Math.sin(p),
      position[2] - Math.cos(yaw) * Math.cos(p),
    ],
  };
}
export function walkStep(
  camera: CameraState,
  forward: number,
  side: number,
  distance: number,
) {
  const { yaw, pitch } = viewAngles(camera),
    norm = Math.max(1, Math.hypot(forward, side));
  return lookCamera(
    [
      camera.position[0] +
        ((Math.sin(yaw) * forward + Math.cos(yaw) * side) * distance) / norm,
      camera.position[1],
      camera.position[2] +
        ((-Math.cos(yaw) * forward + Math.sin(yaw) * side) * distance) / norm,
    ],
    yaw,
    pitch,
  );
}
export function walkShapes(nodes: SceneNode[], eyeHeight = 1.6) {
  // Analysis uses door sweep zones; walking instead collides with the rendered
  // leaves/frames at their actual angle, without filling the wall's opening.
  function openingParts(node: SceneNode, inside = false): SceneNode | null {
    if (!node.visible) return null;
    const opening = node.geometry.kind === 'opening';
    if (inside && !opening) return node;
    const children = node.children
      .map((n) => openingParts(n, inside || opening))
      .filter((n): n is SceneNode => !!n);
    return children.length
      ? { ...node, geometry: { kind: 'group', size: [1, 1, 1] }, children }
      : null;
  }
  const frames = nodes
    .map((n) => openingParts(n))
    .filter((n): n is SceneNode => !!n);
  return [...analysisFootprints(nodes), ...analysisFootprints(frames)].filter(
    (s) =>
      (s.kind === 'wall' || s.kind === 'furniture') &&
      s.maxY > 0.15 &&
      s.minY < eyeHeight + 0.15,
  );
}
export function canStand(shapes: Footprint[], point: Point, radius = 0.16) {
  const circle = Array.from(
    { length: 12 },
    (_, i) =>
      [
        point[0] + Math.cos((i * Math.PI) / 6) * radius,
        point[1] + Math.sin((i * Math.PI) / 6) * radius,
      ] as Point,
  );
  return !shapes.some((s) => polygonsOverlap(circle, s.points, 0));
}
export function insideRooms(nodes: SceneNode[], point: Point, padding = 0) {
  const floors = nodes.filter((n) => n.visible && n.geometry.kind === 'floor');
  if (!floors.length) return true;
  return floors.some((n) => {
    const p = new Vector3(point[0], 0, point[1]).applyMatrix4(
        nodeMatrix(n).invert(),
      ),
      q: Point = [p.x, p.z];
    return (
      (polygonContains(n.geometry.polygon!, q) ||
        (padding > 0 &&
          n.geometry.polygon!.some((a, i, all) => {
            const b = all[(i + 1) % all.length],
              dx = b[0] - a[0],
              dz = b[1] - a[1];
            const t = Math.max(
              0,
              Math.min(
                1,
                ((q[0] - a[0]) * dx + (q[1] - a[1]) * dz) / (dx * dx + dz * dz),
              ),
            );
            return (
              Math.hypot(q[0] - a[0] - t * dx, q[1] - a[1] - t * dz) <= padding
            );
          }))) &&
      !n.geometry.holes?.some((h) => polygonContains(h, q))
    );
  });
}
export function startWalk(
  nodes: SceneNode[],
  height: number,
  preferred?: Point,
): CameraState {
  const shapes = walkShapes(nodes, height),
    floor =
      nodes.find(
        (n) => n.geometry.kind === 'floor' && /Кухня|Гостиная/i.test(n.name),
      ) ?? nodes.find((n) => n.geometry.kind === 'floor');
  const centre = floor
    ? roomLabelPosition(floor)
    : (sceneBounds(nodes)
        .getCenter(new Vector3())
        .toArray()
        .filter((_, i) => i !== 1) as Point);
  const b = sceneBounds(nodes),
    candidates: Point[] = [];
  for (let z = b.min.z; z <= b.max.z; z += 0.25)
    for (let x = b.min.x; x <= b.max.x; x += 0.25) candidates.push([x, z]);
  candidates.sort(
    (a, b) =>
      Math.hypot(a[0] - centre[0], a[1] - centre[1]) -
      Math.hypot(b[0] - centre[0], b[1] - centre[1]),
  );
  const point = [...(preferred ? [preferred] : []), centre, ...candidates].find(
    (p) => insideRooms(nodes, p) && canStand(shapes, p),
  );
  if (!point)
    throw new Error(
      'Не найдено свободное место для прогулки. Освободите проход или выберите другой вариант.',
    );
  const subject = nodes
    .filter(
      (n) =>
        n.category === 'furniture' &&
        n.visible &&
        /стол|диван|кровать/i.test(n.name),
    )
    .map((n) => ({
      name: n.name,
      p: sceneBounds([n]).getCenter(new Vector3()),
    }))
    .filter(
      ({ p }) =>
        floor &&
        insideRooms([floor], [p.x, p.z]) &&
        Math.hypot(p.x - point[0], p.z - point[1]) > 1,
    )
    .sort(
      (a, b) => Number(!/стол/i.test(a.name)) - Number(!/стол/i.test(b.name)),
    )[0];
  return lookCamera(
    [point[0], height, point[1]],
    subject
      ? Math.atan2(subject.p.x - point[0], point[1] - subject.p.z)
      : -Math.PI / 2,
    subject ? -0.1 : 0,
  );
}
/** Small substeps prevent tunnelling through thin walls; slide along a free axis. */
export function constrainedWalk(
  nodes: SceneNode[],
  shapes: Footprint[],
  camera: CameraState,
  forward: number,
  side: number,
  distance: number,
) {
  let current = camera;
  const steps = Math.max(1, Math.ceil(distance / 0.04));
  for (let i = 0; i < steps; i++) {
    const next = walkStep(current, forward, side, distance / steps),
      p = next.position;
    const free = (x: number, z: number) =>
      canStand(shapes, [x, z]) && insideRooms(nodes, [x, z], 0.15);
    const { yaw, pitch } = viewAngles(current);
    if (free(p[0], p[2])) current = next;
    else if (free(p[0], current.position[2]))
      current = lookCamera([p[0], p[1], current.position[2]], yaw, pitch);
    else if (free(current.position[0], p[2]))
      current = lookCamera([current.position[0], p[1], p[2]], yaw, pitch);
  }
  return current;
}
