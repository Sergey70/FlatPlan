import { Matrix4, Vector2, Vector3, ShapeUtils } from 'three';
import { polygonContains, type Point } from './apartment.ts';
import { findNode, flattenNodes, type SceneNode } from './editor-model.ts';
import {
  createNodeGeometry,
  doorSwingArcs,
  hull,
  localBounds,
  nodeMatrix,
  nodeWorldMatrix,
  wallBlocks,
} from './editor-geometry.ts';

const EPS = 0.005; // Ignore contact and round-off below 5 mm.
export interface Footprint {
  points: Point[];
  minY: number;
  maxY: number;
  owner: string;
  nodeId: string;
  kind: 'furniture' | 'wall' | 'door' | 'clearance';
}
export interface PlanIssue {
  id: string;
  kind: 'collision' | 'door' | 'clearance' | 'gap';
  ids: [string, string];
  distance?: number;
  from?: Point;
  to?: Point;
  zone?: Point[];
}
export interface DistanceLine {
  from: Point;
  to: Point;
  distance: number;
  label: string;
  arrow?: boolean;
}
export const centimetres = (m: number) =>
  `${Number((m * 100).toFixed(1)).toLocaleString('ru-RU')} см`;
const dot = (a: Point, b: Point) => a[0] * b[0] + a[1] * b[1];
const edges = (p: Point[]) =>
  p.map((a, i) => [a, p[(i + 1) % p.length]] as [Point, Point]);

/** Convex projected solids, with contact tolerance. No axis-aligned-box collision shortcut. */
export function polygonsOverlap(a: Point[], b: Point[], tolerance = EPS) {
  for (const [p, q] of [...edges(a), ...edges(b)]) {
    const length = Math.hypot(q[0] - p[0], q[1] - p[1]);
    if (length < 1e-9) continue;
    const axis: Point = [-(q[1] - p[1]) / length, (q[0] - p[0]) / length];
    const aa = a.map((v) => dot(v, axis)),
      bb = b.map((v) => dot(v, axis));
    if (
      Math.min(Math.max(...aa), Math.max(...bb)) -
        Math.max(Math.min(...aa), Math.min(...bb)) <=
      tolerance
    )
      return false;
  }
  return a.length >= 3 && b.length >= 3;
}
function closest(p: Point, a: Point, b: Point): Point {
  const dx = b[0] - a[0],
    dz = b[1] - a[1];
  const t = Math.max(
    0,
    Math.min(
      1,
      ((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) /
        Math.max(1e-20, dx * dx + dz * dz),
    ),
  );
  return [a[0] + dx * t, a[1] + dz * t];
}
function blocksLine(points: Point[], from: Point, to: Point) {
  if (polygonContains(points, from) || polygonContains(points, to)) return true;
  const cross = (a: Point, b: Point, c: Point) =>
    (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
  return edges(points).some(
    ([a, b]) =>
      cross(from, to, a) * cross(from, to, b) < 0 &&
      cross(a, b, from) * cross(a, b, to) < 0,
  );
}
const length = (a: Point, b: Point) => Math.hypot(a[0] - b[0], a[1] - b[1]);
export function polygonDistance(a: Point[], b: Point[]) {
  let best = { distance: Infinity, from: a[0], to: b[0] };
  for (const [p, q] of edges(a))
    for (const [r, s] of edges(b)) {
      for (const [from, to] of [
        [p, closest(p, r, s)],
        [q, closest(q, r, s)],
        [closest(r, p, q), r],
        [closest(s, p, q), s],
      ]) {
        const distance = length(from, to);
        if (distance < best.distance) best = { distance, from, to };
      }
    }
  if (polygonsOverlap(a, b, 0)) return { ...best, distance: 0, to: best.from };
  return best;
}
function bounds(p: Point[]) {
  return {
    x0: Math.min(...p.map((p) => p[0])),
    x1: Math.max(...p.map((p) => p[0])),
    z0: Math.min(...p.map((p) => p[1])),
    z1: Math.max(...p.map((p) => p[1])),
  };
}
function lowerDistance(a: Point[], b: Point[]) {
  const aa = bounds(a),
    bb = bounds(b);
  return Math.hypot(
    Math.max(0, aa.x0 - bb.x1, bb.x0 - aa.x1),
    Math.max(0, aa.z0 - bb.z1, bb.z0 - aa.z1),
  );
}
const sameLevel = (a: Footprint, b: Footprint) =>
  Math.min(a.maxY, b.maxY) - Math.max(a.minY, b.minY) > EPS;
function intersection(a: Footprint, b: Footprint) {
  return (
    sameLevel(a, b) &&
    lowerDistance(a.points, b.points) < EPS &&
    polygonsOverlap(a.points, b.points)
  );
}
function projectPrism(
  points: Point[],
  low: number,
  high: number,
  matrix: Matrix4,
) {
  const vertices = points.flatMap(([x, z]) =>
    [low, high].map((y) => new Vector3(x, y, z).applyMatrix4(matrix)),
  );
  return {
    points: hull(vertices.map((p) => [p.x, p.z])),
    minY: Math.min(...vertices.map((p) => p.y)),
    maxY: Math.max(...vertices.map((p) => p.y)),
  };
}
function triangulate(points: Point[], holes: Point[][] = []) {
  const all = [...points, ...holes.flat()];
  return ShapeUtils.triangulateShape(
    points.map((p) => new Vector2(...p)),
    holes.map((h) => h.map((p) => new Vector2(...p))),
  ).map((tri) => tri.map((i) => all[i]));
}

export function analysisFootprints(nodes: SceneNode[]): Footprint[] {
  const result: Footprint[] = [];
  function walk(node: SceneNode, parent: Matrix4, owner: string) {
    if (!node.visible) return;
    const matrix = parent.clone().multiply(nodeMatrix(node));
    function add(
      points: Point[],
      low: number,
      high: number,
      kind: Footprint['kind'],
    ) {
      const shape = projectPrism(points, low, high, matrix);
      if (shape.points.length >= 3)
        result.push({ ...shape, owner, nodeId: node.id, kind });
    }
    const g = node.geometry;
    if (g.kind === 'wall') {
      for (const b of wallBlocks(node)) {
        const [x, y, z] = b.position,
          [w, h, d] = b.size;
        for (const tri of triangulate(
          b.profile ?? [
            [x - w / 2, z - d / 2],
            [x + w / 2, z - d / 2],
            [x + w / 2, z + d / 2],
            [x - w / 2, z + d / 2],
          ],
        ))
          add(tri, y - h / 2, y + h / 2, 'wall');
      }
    } else if (g.kind === 'opening') {
      if (g.openingType === 'door' || g.doorSwing) {
        const [w, h, d] = g.size;
        add(
          [
            [-w / 2, -d / 2],
            [w / 2, -d / 2],
            [w / 2, d / 2],
            [-w / 2, d / 2],
          ],
          0,
          h,
          'door',
        );
        const arcs = doorSwingArcs(node),
          swing = g.doorSwing;
        arcs.forEach((arc, i) => {
          const end =
            swing!.hinge === 'both'
              ? i === 0
                ? -1
                : 1
              : swing!.hinge === 'start'
                ? -1
                : 1;
          add([[(end * w) / 2, swing!.offset], ...arc], 0, h, 'door');
        });
      }
      return; // Frames/door leaves are represented by wall voids and swept zones.
    } else if (g.kind !== 'floor' && g.kind !== 'group') {
      if (g.polygon) {
        for (const tri of triangulate(g.polygon, g.holes))
          add(
            tri,
            0,
            g.size[1],
            node.category === 'furniture' ? 'furniture' : 'wall',
          );
      } else {
        const geometry = createNodeGeometry(node);
        if (geometry) {
          const attr = geometry.getAttribute('position'),
            points: Point[] = [];
          let minY = Infinity,
            maxY = -Infinity;
          for (let i = 0; i < attr.count; i++) {
            const p = new Vector3(
              attr.getX(i),
              attr.getY(i),
              attr.getZ(i),
            ).applyMatrix4(matrix);
            points.push([p.x, p.z]);
            minY = Math.min(minY, p.y);
            maxY = Math.max(maxY, p.y);
          }
          result.push({
            points: hull(points),
            minY,
            maxY,
            owner,
            nodeId: node.id,
            kind: node.category === 'furniture' ? 'furniture' : 'wall',
          });
          geometry.dispose();
        }
      }
    }
    if (node.clearance && node.category === 'furniture') {
      const box = localBounds(node),
        scaleZ = new Vector3().setFromMatrixColumn(matrix, 2).length();
      for (const [side, amount] of [
        [1, node.clearance.front],
        [-1, node.clearance.back],
      ]) {
        if (!amount) continue;
        const z = side === 1 ? box.max.z : box.min.z;
        add(
          [
            [box.min.x, z],
            [box.max.x, z],
            [box.max.x, z + (side * amount) / scaleZ],
            [box.min.x, z + (side * amount) / scaleZ],
          ],
          box.min.y,
          box.min.y +
            1.9 / new Vector3().setFromMatrixColumn(matrix, 1).length(),
          'clearance',
        );
      }
    }
    for (const child of node.children) walk(child, matrix, owner);
  }
  for (const node of nodes) walk(node, new Matrix4(), node.id);
  return result;
}

export function analyzePlan(
  shapes: Footprint[],
  gapThreshold: number | null = null,
): PlanIssue[] {
  const solids = shapes.filter(
      (s) => s.kind === 'furniture' || s.kind === 'wall',
    ),
    issues: PlanIssue[] = [];
  const seen = new Set<string>();
  function record(
    kind: PlanIssue['kind'],
    a: Footprint,
    b: Footprint,
    extra: Partial<PlanIssue> = {},
  ) {
    const first = a.kind === 'furniture' ? a.owner : a.nodeId,
      second = b.kind === 'furniture' ? b.owner : b.nodeId;
    const id = `${kind}:${[first, second].sort().join(':')}`;
    if (seen.has(id)) return;
    seen.add(id);
    issues.push({ id, kind, ids: [first, second], ...extra });
  }
  for (let i = 0; i < solids.length; i++)
    for (let j = i + 1; j < solids.length; j++) {
      const a = solids[i],
        b = solids[j];
      if (a.owner === b.owner || (a.kind === 'wall' && b.kind === 'wall'))
        continue;
      if (intersection(a, b))
        record(
          'collision',
          a.kind === 'furniture' ? a : b,
          a.kind === 'furniture' ? b : a,
        );
    }
  for (const zone of shapes.filter(
    (s) => s.kind === 'door' || s.kind === 'clearance',
  ))
    for (const solid of solids) {
      if (
        solid.owner === zone.owner ||
        (zone.kind === 'door' && solid.kind === 'wall')
      )
        continue;
      if (intersection(zone, solid))
        record(zone.kind === 'door' ? 'door' : 'clearance', solid, zone, {
          zone: zone.points,
        });
    }
  if (gapThreshold !== null) {
    const owners = [...new Set(solids.map((s) => s.owner))];
    for (let i = 0; i < owners.length; i++)
      for (let j = i + 1; j < owners.length; j++) {
        const aa = solids.filter((s) => s.owner === owners[i]),
          bb = solids.filter((s) => s.owner === owners[j]);
        if (aa[0].kind === 'wall' && bb[0].kind === 'wall') continue;
        const d = nearestBetween(aa, bb, gapThreshold);
        if (!d || d.distance <= 0.05 || d.distance >= gapThreshold) continue; // Abutments aren't passages.
        // A gap through another wall or object is not a free aisle.
        if (
          solids.some(
            (s) =>
              ![owners[i], owners[j]].includes(s.owner) &&
              sameLevel(d.a, s) &&
              blocksLine(s.points, d.from, d.to),
          )
        )
          continue;
        record(
          'gap',
          d.a.kind === 'furniture' ? d.a : d.b,
          d.a.kind === 'furniture' ? d.b : d.a,
          { distance: d.distance, from: d.from, to: d.to },
        );
      }
  }
  return issues;
}
function nearestBetween(aa: Footprint[], bb: Footprint[], limit = Infinity) {
  let best:
    | { distance: number; from: Point; to: Point; a: Footprint; b: Footprint }
    | undefined;
  for (const a of aa)
    for (const b of bb) {
      if (
        !sameLevel(a, b) ||
        lowerDistance(a.points, b.points) > (best?.distance ?? limit)
      )
        continue;
      const d = polygonDistance(a.points, b.points);
      if (d.distance < (best?.distance ?? limit)) best = { ...d, a, b };
    }
  return best;
}
export function selectedDistances(
  nodes: SceneNode[],
  shapes: Footprint[],
  id: string | null,
): DistanceLine[] {
  const node = findNode(nodes, id);
  if (!node || !node.visible || node.geometry.kind === 'floor') return [];
  const ids = new Set(flattenNodes([node]).map((n) => n.node.id));
  const own = shapes.filter(
    (s) => ids.has(s.nodeId) && ['furniture', 'wall'].includes(s.kind),
  );
  if (!own.length) return [];
  const ownerIds = new Set(own.map((s) => s.owner));
  return (['wall', 'furniture'] as const).flatMap((kind) => {
    const d = nearestBetween(
      own,
      shapes.filter((s) => s.kind === kind && !ownerIds.has(s.owner)),
    );
    return d
      ? [
          {
            from: d.from,
            to: d.to,
            distance: d.distance,
            label: `${kind === 'wall' ? 'До стены' : 'До мебели'}: ${centimetres(d.distance)}`,
          },
        ]
      : [];
  });
}
export function dimensionOutline(
  nodes: SceneNode[],
  id: string | null,
): DistanceLine[] {
  const node = findNode(nodes, id);
  if (
    !node ||
    !node.visible ||
    ['floor', 'opening'].includes(node.geometry.kind)
  )
    return [];
  const b = localBounds(node),
    m = nodeWorldMatrix(nodes, node.id)!;
  function p(x: number, z: number): Point {
    const v = new Vector3(x, b.min.y, z).applyMatrix4(m);
    return [v.x, v.z];
  }
  const a = p(b.min.x, b.min.z),
    c = p(b.max.x, b.min.z),
    d = p(b.max.x, b.max.z);
  return [
    [a, c],
    [c, d],
  ].map(([from, to]) => ({
    from,
    to,
    distance: length(from, to),
    label: centimetres(length(from, to)),
  }));
}
export function frontDirection(
  nodes: SceneNode[],
  id: string | null,
): DistanceLine[] {
  const node = findNode(nodes, id);
  if (!node || !node.visible || node.category !== 'furniture') return [];
  const b = localBounds(node),
    m = nodeWorldMatrix(nodes, node.id)!;
  const from = new Vector3(
    (b.min.x + b.max.x) / 2,
    b.min.y,
    b.max.z,
  ).applyMatrix4(m);
  const direction = new Vector3(0, 0, 1)
      .transformDirection(m)
      .multiplyScalar(0.4),
    to = from.clone().add(direction);
  return [
    {
      from: [from.x, from.z],
      to: [to.x, to.z],
      distance: 0.4,
      label: 'Передняя сторона',
      arrow: true,
    },
  ];
}
