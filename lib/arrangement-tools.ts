import { Matrix4, Vector3, Quaternion, Euler } from 'three';
import {
  clone,
  newId,
  validateProject,
  flattenNodes,
  type EditorProject,
  type SceneNode,
  type Vec3,
} from './editor-model.ts';
import { baseNode } from './editor-seed.ts';
import {
  nodeMatrix,
  sceneBounds,
  planDrawing,
  hull,
  wallProfile,
} from './editor-geometry.ts';
import type { Point } from './apartment.ts';
import type { SnapSettings } from './design-types.ts';
export interface Guide {
  from: Point;
  to: Point;
  label: string;
}
export interface SnapTarget {
  id: string;
  wall: boolean;
  points: Point[];
}
export function selectedRoots(nodes: SceneNode[], ids: string[]) {
  const set = new Set(ids);
  const result = nodes.filter((n) => set.has(n.id));
  if (
    result.length !== set.size ||
    result.some((n) => n.category !== 'furniture' || n.locked)
  )
    throw new Error('Выберите незакреплённые предметы целиком.');
  return result;
}
function pose(node: SceneNode, matrix: Matrix4) {
  const p = new Vector3(),
    q = new Quaternion(),
    s = new Vector3();
  matrix.decompose(p, q, s);
  const rebuilt = new Matrix4().compose(p, q, s);
  if (rebuilt.elements.some((v, i) => Math.abs(v - matrix.elements[i]) > 1e-7))
    return false;
  node.position = p.toArray();
  node.scale = s.toArray();
  node.rotation = new Euler()
    .setFromQuaternion(q)
    .toArray()
    .slice(0, 3)
    .map((v) => (Number(v) * 180) / Math.PI) as Vec3;
  return true;
}
export function translateMany(
  project: EditorProject,
  ids: string[],
  delta: Point,
) {
  const next = clone(project);
  for (const n of selectedRoots(next.scene.objects, ids)) {
    n.position[0] += delta[0];
    n.position[2] += delta[1];
  }
  return validateProject(next);
}
export function rotateMany(
  project: EditorProject,
  ids: string[],
  degrees: number,
) {
  const next = clone(project),
    nodes = selectedRoots(next.scene.objects, ids);
  const c = sceneBounds(nodes).getCenter(new Vector3());
  const transform = new Matrix4()
    .makeTranslation(c.x, 0, c.z)
    .multiply(new Matrix4().makeRotationY((degrees * Math.PI) / 180))
    .multiply(new Matrix4().makeTranslation(-c.x, 0, -c.z));
  for (const n of nodes)
    if (!pose(n, transform.clone().multiply(nodeMatrix(n))))
      throw new Error('Не удалось сохранить преобразование группы.');
  return validateProject(next);
}
export function copyMany(project: EditorProject, ids: string[]) {
  const next = clone(project),
    roots = selectedRoots(next.scene.objects, ids),
    created: string[] = [];
  for (const root of roots) {
    const n = clone(root);
    for (const { node } of flattenNodes([n])) node.id = newId();
    n.name += ' — копия';
    n.position[0] += 0.25;
    n.position[2] += 0.25;
    created.push(n.id);
    next.scene.objects.push(n);
  }
  next.scene.view.selected = created[0] ?? null;
  return { project: validateProject(next), ids: created };
}
export function groupMany(
  project: EditorProject,
  ids: string[],
  name = 'Группа мебели',
) {
  const next = clone(project),
    roots = selectedRoots(next.scene.objects, ids);
  if (roots.length < 2)
    throw new Error('Для группы нужны минимум два предмета.');
  const c = sceneBounds(roots).getCenter(new Vector3());
  const group = baseNode(newId('group'), name, {
    kind: 'group',
    size: [1, 1, 1],
  });
  group.assembly = true;
  group.position = [c.x, 0, c.z];
  group.children = roots.map((n) => ({
    ...n,
    position: [n.position[0] - c.x, n.position[1], n.position[2] - c.z],
  }));
  next.scene.objects = next.scene.objects.filter((n) => !ids.includes(n.id));
  next.scene.objects.push(group);
  next.scene.view.selected = group.id;
  return validateProject(next);
}
export function ungroup(project: EditorProject, id: string) {
  const next = clone(project),
    [group] = selectedRoots(next.scene.objects, [id]);
  if (!group?.assembly) throw new Error('Выберите созданную группу мебели.');
  const children = group.children.map((child) => {
    const n = clone(child),
      matrix = nodeMatrix(group).multiply(nodeMatrix(child));
    if (pose(n, matrix)) return n;
    // Non-uniform scale plus rotation can produce shear. Preserve it as two TRS levels.
    const wrapper = baseNode(newId('object'), child.name, {
      kind: 'group',
      size: [1, 1, 1],
    });
    wrapper.position = [...group.position];
    wrapper.rotation = [...group.rotation];
    wrapper.scale = [...group.scale];
    wrapper.children = [child];
    return wrapper;
  });
  next.scene.objects = next.scene.objects.flatMap((n) =>
    n.id === id ? children : [n],
  );
  next.scene.view.selected = children[0]?.id ?? null;
  return validateProject(next);
}
export function alignMany(
  project: EditorProject,
  ids: string[],
  axis: 'x' | 'z',
  anchor: 'min' | 'center' | 'max',
) {
  const next = clone(project),
    roots = selectedRoots(next.scene.objects, ids);
  if (roots.length < 2)
    throw new Error('Выберите минимум два предмета. Первый — ориентир.');
  const at = (n: SceneNode) => {
    const b = sceneBounds([n]);
    return anchor === 'center'
      ? (b.min[axis] + b.max[axis]) / 2
      : b[anchor][axis];
  };
  const target = at(roots.find((n) => n.id === ids[0])!);
  for (const n of roots) n.position[axis === 'x' ? 0 : 2] += target - at(n);
  return validateProject(next);
}
export function snapTargets(nodes: SceneNode[]): SnapTarget[] {
  const parts = planDrawing(nodes, { palette: 'natural', furniture: true });
  return nodes
    .filter(
      (n) =>
        n.visible && (n.category === 'furniture' || n.geometry.kind === 'wall'),
    )
    .map((n) => ({
      id: n.id,
      wall: n.geometry.kind === 'wall',
      points:
        n.geometry.kind === 'wall'
          ? hull(
              wallProfile(n).map(([x, z]) => {
                const p = new Vector3(x, 0, z).applyMatrix4(nodeMatrix(n));
                return [p.x, p.z] as Point;
              }),
            )
          : hull(
              parts
                .filter(
                  (p) =>
                    p.rootId === n.id && !p.strokeOnly && p.kind !== 'opening',
                )
                .flatMap((p) => p.points),
            ),
    }))
    .filter((n) => n.points.length > 2);
}
const dot = (p: Point, n: Point) => p[0] * n[0] + p[1] * n[1];
const bounds = (p: Point[]) => ({
  min: [Math.min(...p.map((p) => p[0])), Math.min(...p.map((p) => p[1]))],
  max: [Math.max(...p.map((p) => p[0])), Math.max(...p.map((p) => p[1]))],
});
function wallCandidates(points: Point[], target: SnapTarget, gap: number) {
  const b = bounds(points),
    center: Point = [(b.min[0] + b.max[0]) / 2, (b.min[1] + b.max[1]) / 2];
  return target.points.flatMap((a, i) => {
    const b = target.points[(i + 1) % target.points.length],
      length = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (length < 0.3) return [];
    const tangent: Point = [(b[0] - a[0]) / length, (b[1] - a[1]) / length],
      normal: Point = [tangent[1], -tangent[0]],
      plane = dot(a, normal);
    if (dot(center, normal) < plane) return [];
    const span = points.map((p) => dot(p, tangent)),
      lo = dot(a, tangent),
      hi = dot(b, tangent);
    if (
      Math.max(...span) < Math.min(lo, hi) ||
      Math.min(...span) > Math.max(lo, hi)
    )
      return [];
    const nearest = points.reduce((a, b) =>
      dot(a, normal) < dot(b, normal) ? a : b,
    );
    const distance = dot(nearest, normal) - plane;
    const delta: Point = [
      normal[0] * (gap - distance),
      normal[1] * (gap - distance),
    ];
    const from: Point = [
      nearest[0] - normal[0] * distance,
      nearest[1] - normal[1] * distance,
    ];
    return [
      {
        delta,
        distance: Math.abs(gap - distance),
        guide: {
          from,
          to: [from[0] + normal[0] * gap, from[1] + normal[1] * gap] as Point,
          label: `Отступ ${Math.round(gap * 1000) / 10} см`,
        },
      },
    ];
  });
}
export function snapTranslation(
  targets: SnapTarget[],
  ids: string[],
  delta: Point,
  settings: SnapSettings,
  tolerance = 0.08,
  bypass = false,
): { delta: Point; guides: Guide[] } {
  const points = targets
    .filter((n) => ids.includes(n.id))
    .flatMap((n) =>
      n.points.map((p) => [p[0] + delta[0], p[1] + delta[1]] as Point),
    );
  if (!settings.enabled || bypass || !points.length)
    return { delta, guides: [] };
  const others = targets.filter((n) => !ids.includes(n.id));
  if (settings.objects) {
    const wall = others
      .filter((n) => n.wall)
      .flatMap((t) => wallCandidates(points, t, settings.gap))
      .filter((c) => c.distance < tolerance)
      .sort((a, b) => a.distance - b.distance)[0];
    if (wall)
      return {
        delta: [delta[0] + wall.delta[0], delta[1] + wall.delta[1]],
        guides: [wall.guide],
      };
  }
  const b = bounds(points),
    result: Point = [...delta],
    guides: Guide[] = [];
  for (const axis of [0, 1]) {
    const center = (b.min[axis] + b.max[axis]) / 2;
    let best: { offset: number; line: number; label: string } | undefined;
    if (settings.grid) {
      const offset =
        Math.round(center / settings.step) * settings.step - center;
      if (Math.abs(offset) < tolerance)
        best = { offset, line: center + offset, label: 'Сетка' };
    }
    if (settings.objects)
      for (const target of others.filter((n) => !n.wall)) {
        const t = bounds(target.points),
          other = 1 - axis;
        if (
          Math.max(
            0,
            b.min[other] - t.max[other],
            t.min[other] - b.max[other],
          ) > 2
        )
          continue;
        const candidates = [
          {
            offset: t.min[axis] - settings.gap - b.max[axis],
            line: t.min[axis] - settings.gap,
            label: 'Отступ',
          },
          {
            offset: t.max[axis] + settings.gap - b.min[axis],
            line: t.max[axis] + settings.gap,
            label: 'Отступ',
          },
          ...[
            t.min[axis],
            (t.min[axis] + t.max[axis]) / 2,
            t.max[axis],
          ].flatMap((line) =>
            [b.min[axis], center, b.max[axis]].map((v) => ({
              offset: line - v,
              line,
              label: 'Выравнивание',
            })),
          ),
        ];
        for (const c of candidates)
          if (
            Math.abs(c.offset) < tolerance &&
            (!best || Math.abs(c.offset) < Math.abs(best.offset))
          )
            best = c;
      }
    if (best) {
      result[axis] += best.offset;
      const from: Point = [b.min[0] - 0.4, b.min[1] - 0.4],
        to: Point = [b.max[0] + 0.4, b.max[1] + 0.4];
      from[axis] = to[axis] = best.line;
      guides.push({ from, to, label: best.label });
    }
  }
  return { delta: result, guides };
}
export function offsetFromWall(
  project: EditorProject,
  ids: string[],
  wallId: string,
  gap: number,
) {
  if (!Number.isFinite(gap) || gap < 0 || gap > 2)
    throw new Error('Отступ: от 0 до 200 см.');
  selectedRoots(project.scene.objects, ids);
  const targets = snapTargets(project.scene.objects),
    wall = targets.find((t) => t.id === wallId && t.wall);
  if (!wall) throw new Error('Выберите стену для отступа.');
  const points = targets
    .filter((n) => ids.includes(n.id))
    .flatMap((n) => n.points);
  const best = wallCandidates(points, wall, gap).sort(
    (a, b) => a.distance - b.distance,
  )[0];
  if (!best) throw new Error('Расположите предмет напротив выбранной стены.');
  return translateMany(project, ids, best.delta);
}
