import { Matrix4, Vector3 } from 'three';
import { baseNode, makeOpening } from './editor-seed.ts';
import {
  planLayouts,
  planSource,
  PLAN_REVISION,
  DEFAULT_PLAN_ID,
  type PlanLayout,
} from './plan-data.ts';
import { planFurniture } from './plan-furniture.ts';
import {
  clone,
  defaultView,
  validateProject,
  type EditorProject,
  type SceneNode,
  type Arrangement,
} from './editor-model.ts';
import type { Point } from './apartment.ts';
export { planLayouts, PLAN_REVISION, DEFAULT_PLAN_ID } from './plan-data.ts';
const metres = (p: Point): Point => [p[0] / 100, p[1] / 100];

export function createPlanScene(layout: PlanLayout): Arrangement {
  const objects: SceneNode[] = [];
  for (const room of layout.rooms) {
    const points = room.polygon.map(metres);
    const minX = Math.min(...points.map((p) => p[0])),
      maxX = Math.max(...points.map((p) => p[0]));
    const minZ = Math.min(...points.map((p) => p[1])),
      maxZ = Math.max(...points.map((p) => p[1]));
    // Tiny service contours remain geometry, without adding dozens of room labels.
    const floor = baseNode(
      `plan-floor-${room.id}`,
      `Пол — ${room.name}`,
      {
        kind: room.micro ? 'solid' : 'floor',
        size: [maxX - minX, 0.04, maxZ - minZ],
        polygon: points,
        holes: [],
      },
      'structure',
    );
    floor.position[1] = -0.04;
    floor.material = /Санузел|Лоджия|ниша/.test(room.name) ? 'stone' : 'wood';
    floor.role = floor.material === 'wood' ? 'wood' : 'stone';
    objects.push(floor);
  }
  for (const wall of layout.walls) {
    const start = metres(wall.start),
      end = metres(wall.end);
    const dx = end[0] - start[0],
      dz = end[1] - start[1],
      length = Math.hypot(dx, dz);
    const angle = Math.atan2(dz, dx),
      cx = (start[0] + end[0]) / 2,
      cz = (start[1] + end[1]) / 2,
      depth = wall.thickness / 100;
    const inverse = new Matrix4()
      .makeRotationY(angle)
      .multiply(new Matrix4().makeTranslation(-cx, 0, -cz));
    const node = baseNode(
      `plan-${wall.id}`,
      `Стена ${wall.id.slice(-3)}`,
      {
        kind: 'wall',
        size: [length, wall.height / 100, depth],
        wallProfile: wall.profile.map((point) => {
          const p = new Vector3(point[0] / 100, 0, point[1] / 100).applyMatrix4(
            inverse,
          );
          return [p.x / length, p.z / depth];
        }),
      },
      'structure',
    );
    node.position = [cx, 0, cz];
    node.rotation = [0, (-angle * 180) / Math.PI, 0];
    node.color = '#eeeae2';
    node.role = 'wall';
    node.cutaway = true;
    for (const hole of wall.holes) {
      const type = hole.group === 'windows' ? 'window' : 'door';
      const opening = makeOpening(
        hole.width / 100,
        hole.height / 100,
        hole.frameDepth / 100,
        type,
      );
      opening.geometry.size[2] = depth;
      if (type === 'window')
        for (const child of opening.children) {
          if (child.name === 'Вертикальная рама' && child.position[0] !== 0)
            child.position[0] =
              (Math.sign(child.position[0]) *
                (hole.width / 100 - child.geometry.size[0])) /
              2;
          if (child.name === 'Горизонтальная рама')
            child.position[1] =
              child.position[1] === 0
                ? child.geometry.size[1] / 2
                : hole.height / 100 - child.geometry.size[1] / 2;
        }
      opening.id = `plan-${hole.id}`;
      opening.name =
        type === 'door'
          ? 'Дверной проём'
          : hole.type === 'window'
            ? 'Окно'
            : 'Французский проём';
      const p = new Vector3(
        hole.center[0] / 100,
        0,
        hole.center[1] / 100,
      ).applyMatrix4(inverse);
      opening.position = [p.x, hole.bottom / 100, 0];
      opening.children.forEach((child, i) => {
        child.id = `${opening.id}-part-${i + 1}`;
      });
      node.children.push(opening);
    }
    objects.push(node);
  }
  objects.push(
    ...layout.items.map((item) => planFurniture(item, layout.height / 100)),
  );
  return { objects, view: defaultView() };
}
export function createPlanProject(): EditorProject {
  const arrangements = planLayouts.map((layout) => ({
    id: `${PLAN_REVISION}-${layout.id}`,
    name: layout.name,
    scene: createPlanScene(layout),
  }));
  const initial = arrangements.find((a) => a.id === DEFAULT_PLAN_ID)!;
  return validateProject({
    format: 'flatplan-project',
    version: 1,
    name: 'Квартира — план из файла .plan',
    scene: clone(initial.scene),
    arrangements,
    activeArrangement: initial.id,
    sourceRevision: PLAN_REVISION,
  });
}
export function hasPlanSource(project: EditorProject): boolean {
  return project.sourceRevision === PLAN_REVISION;
}
export function applyPlanSource(project: EditorProject): EditorProject {
  const seed = createPlanProject();
  const reserved = new Set(seed.arrangements.map((a) => a.id));
  const ids = new Set(reserved);
  const old = project.arrangements.map((a) => {
    let id = a.id;
    while (ids.has(id)) id = `previous-${id}`;
    ids.add(id);
    return { ...a, id };
  });
  if (old.length + seed.arrangements.length + 1 > 30)
    throw new Error(
      'Для нового плана и резервной копии освободите место: максимум 30 вариантов. Скачайте JSON перед удалением вариантов.',
    );
  const next = clone(project);
  let backupId = 'before-plan-008';
  while (old.some((a) => a.id === backupId)) backupId += '-copy';
  next.arrangements = [
    ...seed.arrangements,
    ...old,
    {
      id: backupId,
      name: 'До обновления по файлу .plan',
      scene: clone(project.scene),
    },
  ];
  next.scene = seed.scene;
  next.activeArrangement = seed.activeArrangement;
  next.sourceRevision = PLAN_REVISION;
  return validateProject(next);
}
export function sourceLayout(project: EditorProject): PlanLayout | undefined {
  return planLayouts.find(
    (l) => project.activeArrangement === `${PLAN_REVISION}-${l.id}`,
  );
}
export function defaultPlanName() {
  return planLayouts.find((l) => l.id === planSource.defaultLayout)!.name;
}
