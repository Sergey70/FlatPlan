import { Matrix4 } from 'three';
import {
  clone,
  findNode,
  type Arrangement,
  type SceneNode,
} from './editor-model.ts';
import { nodeMatrix, nodeColor, sceneBounds } from './editor-geometry.ts';
import { estimateScene } from './estimate.ts';
import { analysisFootprints, analyzePlan } from './plan-analysis.ts';
export type ChangeKind = 'added' | 'removed' | 'changed';
export interface ArrangementChange {
  id: string;
  name: string;
  kind: ChangeKind;
  category: 'wall' | 'floor' | 'furniture';
}
export const comparisonColors: Record<ChangeKind, string> = {
  added: '#279981',
  removed: '#d16b66',
  changed: '#d79832',
};
interface Entry {
  node: SceneNode;
  matrix: Matrix4;
  visible: boolean;
  parent: SceneNode | null;
}
function indexScene(scene: Arrangement) {
  const index = new Map<string, Entry>();
  const visit = (
    node: SceneNode,
    matrix: Matrix4,
    visible: boolean,
    parent: SceneNode | null,
  ) => {
    const world = matrix.clone().multiply(nodeMatrix(node));
    index.set(node.id, {
      node,
      matrix: world,
      visible: visible && node.visible,
      parent,
    });
    node.children.forEach((n) =>
      visit(n, world, visible && node.visible, node),
    );
  };
  scene.objects.forEach((n) => visit(n, new Matrix4(), true, null));
  return index;
}
const representative = (e: Entry) =>
  ['wall', 'floor'].includes(e.node.geometry.kind) ||
  (e.node.category === 'furniture' &&
    !e.node.assembly &&
    (!e.parent || e.parent.category !== 'furniture' || e.parent.assembly));
function signature(id: string, index: Map<string, Entry>, scene: Arrangement) {
  const e = index.get(id);
  if (!e?.visible) return null;
  const rows: unknown[] = [];
  const visit = (node: SceneNode) => {
    const entry = index.get(node.id)!;
    if (!entry.visible) return;
    const usesBase =
      !node.finish &&
      ['front', 'back', 'top', 'edge'].some(
        (face) =>
          !node.surfaces?.[face as keyof NonNullable<SceneNode['surfaces']>],
      );
    if (node.geometry.kind !== 'group' || node.electrical?.fixture)
      rows.push([
        node.id,
        node.geometry,
        entry.matrix.elements,
        usesBase ? node.material : null,
        usesBase ? nodeColor(node, scene.view) : null,
        node.finish,
        node.surfaces,
        node.electrical?.fixture,
      ]);
    [...node.children].sort((a, b) => a.id.localeCompare(b.id)).forEach(visit);
  };
  visit(e.node);
  return rows.length
    ? JSON.stringify(rows, (_k, v) =>
        typeof v === 'number' ? Math.round(v * 1e7) / 1e7 : v,
      )
    : null;
}
/** Compare meaningful wall/floor/furniture subtrees in world space. Grouping alone is not a geometry edit. */
export function compareArrangements(
  a: Arrangement,
  b: Arrangement,
): ArrangementChange[] {
  const aa = indexScene(a),
    bb = indexScene(b);
  const candidates = new Set(
    [...aa, ...bb].filter(([, e]) => representative(e)).map(([id]) => id),
  );
  // A new organizational wrapper must not duplicate an existing furniture entity's report.
  const containsCandidate = (n: SceneNode): boolean =>
    n.children.some((c) => candidates.has(c.id) || containsCandidate(c));
  const changes: ArrangementChange[] = [];
  for (const id of candidates) {
    const left = aa.get(id),
      right = bb.get(id),
      node = right?.node ?? left!.node;
    if (
      node.geometry.kind === 'group' &&
      ((left && containsCandidate(left.node)) ||
        (right && containsCandidate(right.node)))
    )
      continue;
    const before = signature(id, aa, a),
      after = signature(id, bb, b);
    if (before === after) continue;
    changes.push({
      id,
      name: node.name,
      kind: !before ? 'added' : !after ? 'removed' : 'changed',
      category:
        node.geometry.kind === 'wall'
          ? 'wall'
          : node.geometry.kind === 'floor'
            ? 'floor'
            : 'furniture',
    });
  }
  return changes.sort(
    (a, b) =>
      a.category.localeCompare(b.category) ||
      a.name.localeCompare(b.name) ||
      a.id.localeCompare(b.id),
  );
}
/** Tint a private display copy; preserve shape, glass transparency, finish pattern and roughness. */
export function comparisonObjects(
  scene: Arrangement,
  changes: ArrangementChange[],
  side: 'a' | 'b',
  highlight: boolean,
) {
  if (!highlight) return scene.objects;
  const nodes = clone(scene.objects),
    colors = new Map(
      changes
        .filter((c) => c.kind !== (side === 'a' ? 'added' : 'removed'))
        .map((c) => [c.id, comparisonColors[c.kind]]),
    );
  const visit = (node: SceneNode, inherited?: string) => {
    const color = colors.get(node.id) ?? inherited;
    if (color) {
      node.color = color;
      delete node.role;
      if (node.finish) node.finish.color = color;
      for (const finish of Object.values(node.surfaces ?? {}))
        if (finish) finish.color = color;
    }
    node.children.forEach((n) => visit(n, color));
  };
  nodes.forEach((n) => visit(n));
  return nodes;
}
export function comparisonBounds(a: Arrangement, b: Arrangement) {
  const box = sceneBounds(a.objects).union(sceneBounds(b.objects));
  if (box.isEmpty())
    return {
      min: [-1, 0, -1] as [number, number, number],
      max: [1, 2.7, 1] as [number, number, number],
    };
  return { min: box.min.toArray(), max: box.max.toArray() };
}
export function arrangementMetrics(scene: Arrangement, gap: number) {
  const estimate = estimateScene(scene),
    issues = analyzePlan(analysisFootprints(scene.objects), gap);
  const sum = (key: 'floorArea' | 'wallArea' | 'skirting') =>
    estimate.measured.rooms.reduce((v, r) => v + r[key], 0);
  return {
    floor: sum('floorArea'),
    walls: sum('wallArea'),
    skirting: sum('skirting'),
    total: estimate.total,
    currency: estimate.currency,
    unpriced: estimate.unpriced,
    issues: issues.map((i) => ({
      ...i,
      names: i.ids.map((id) => findNode(scene.objects, id)?.name ?? 'Объект'),
    })),
    rooms: estimate.measured.rooms.map((r) => ({
      id: r.id,
      name: r.name,
      floor: r.floorArea,
      walls: r.wallArea,
      skirting: r.skirting,
    })),
  };
}
