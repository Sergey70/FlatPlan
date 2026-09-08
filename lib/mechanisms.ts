import { Euler, MathUtils, Quaternion, Vector3 } from 'three';
import {
  clone,
  findNode,
  findParent,
  flattenNodes,
  newId,
  validateProject,
  type EditorProject,
  type SceneNode,
  type Vec3,
} from './editor-model.ts';
import { baseNode } from './editor-seed.ts';
import { localBounds, nodeMatrix, sceneBounds } from './editor-geometry.ts';
import {
  analysisFootprints,
  polygonsOverlap,
  type Footprint,
} from './plan-analysis.ts';
import type { Mechanism, MechanismPreset } from './renovation-types.ts';

const axes = {
  x: new Vector3(1, 0, 0),
  y: new Vector3(0, 1, 0),
  z: new Vector3(0, 0, 1),
};
const radians = (r: Vec3) => r.map(MathUtils.degToRad) as Vec3;
export function assertOperable(nodes: SceneNode[], id: string) {
  let node = findNode(nodes, id);
  if (!node) throw new Error('Объект не найден.');
  while (node) {
    if (node.locked)
      throw new Error('Сначала разблокируйте объект и его родителей.');
    node = findParent(nodes, node.id) ?? undefined;
  }
}
/** Incremental pose avoids a second source of truth for the editor's transforms. */
export function poseMechanism(node: SceneNode, progress: number) {
  const m = node.mechanism;
  if (!m) throw new Error('Сначала настройте механизм.');
  if (!Number.isFinite(progress) || progress < 0 || progress > 1)
    throw new Error('Открывание: от 0 до 100%.');
  const delta = (progress - m.progress) * m.extent;
  const before = new Quaternion().setFromEuler(
    new Euler(...radians(node.rotation)),
  );
  const position = new Vector3(...node.position);
  if (m.kind === 'slide') {
    position.add(
      axes[m.axis]
        .clone()
        .multiplyScalar(delta)
        .multiply(new Vector3(...node.scale))
        .applyQuaternion(before),
    );
  } else {
    const pivot = new Vector3(...m.pivot).multiply(new Vector3(...node.scale));
    const after = before
      .clone()
      .multiply(
        new Quaternion().setFromAxisAngle(
          axes[m.axis],
          MathUtils.degToRad(delta),
        ),
      );
    position
      .add(pivot.clone().applyQuaternion(before))
      .sub(pivot.clone().applyQuaternion(after));
    const e = new Euler().setFromQuaternion(after);
    node.rotation = [e.x, e.y, e.z].map(MathUtils.radToDeg) as Vec3;
  }
  node.position = position.toArray();
  m.progress = progress;
}
export function operateMechanisms(
  project: EditorProject,
  id: string,
  progress: number,
): EditorProject {
  const next = clone(project),
    root = findNode(next.scene.objects, id);
  assertOperable(next.scene.objects, id);
  if (!root) throw new Error('Объект не найден.');
  const moving = flattenNodes([root]).filter(({ node }) => node.mechanism);
  if (!moving.length) throw new Error('В объекте нет настроенных механизмов.');
  for (const { node } of moving) {
    assertOperable(next.scene.objects, node.id);
    poseMechanism(node, progress);
  }
  return validateProject(next);
}
/** Reconfiguring an axis/pivot keeps the explicitly shown pose; progress is reset to closed. */
export function configurePart(
  project: EditorProject,
  id: string,
  mechanism: Mechanism,
): EditorProject {
  const next = clone(project);
  assertOperable(next.scene.objects, id);
  findNode(next.scene.objects, id)!.mechanism = clone(mechanism);
  return validateProject(next);
}
export function removeMechanisms(
  project: EditorProject,
  id: string,
): EditorProject {
  const next = clone(project);
  assertOperable(next.scene.objects, id);
  for (const { node } of flattenNodes([findNode(next.scene.objects, id)!])) {
    assertOperable(next.scene.objects, node.id);
    delete node.mechanism;
    delete node.mechanismPreset;
  }
  return validateProject(next);
}
function groupParts(
  root: SceneNode,
  parts: SceneNode[],
  name: string,
): SceneNode {
  if (!parts.length)
    throw new Error(
      'В модели нет подходящих подвижных деталей. Выберите деталь и настройте ось вручную.',
    );
  const group = baseNode(
    newId('mechanism'),
    name,
    { kind: 'group', size: [1, 1, 1] },
    root.category,
  );
  const centre = sceneBounds(parts).getCenter(new Vector3());
  group.position = centre.toArray();
  for (const node of parts) {
    node.position = node.position.map((v, i) => v - group.position[i]) as Vec3;
    group.children.push(node);
  }
  root.children = root.children.filter((n) => !parts.includes(n));
  root.children.push(group);
  return group;
}
function hollowBody(root: SceneNode, front: number) {
  for (const body of root.children.filter(
    (n) =>
      n.name === 'Корпус' && n.geometry.kind === 'box' && !n.children.length,
  )) {
    const [w, h, d] = body.geometry.size,
      t = Math.min(0.018, w / 10, h / 10, d / 10);
    const panel = (name: string, size: Vec3, position: Vec3) => {
      const child = clone(body);
      child.id = newId('cabinet-panel');
      child.name = name;
      child.position = position;
      child.rotation = [0, 0, 0];
      child.scale = [1, 1, 1];
      child.children = [];
      child.geometry = { kind: 'box', size };
      body.children.push(child);
    };
    panel('Левая стенка корпуса', [t, h, d], [-(w - t) / 2, 0, 0]);
    panel('Правая стенка корпуса', [t, h, d], [(w - t) / 2, 0, 0]);
    panel('Верх корпуса', [w - 2 * t, t, d], [0, (h - t) / 2, 0]);
    panel('Дно корпуса', [w - 2 * t, t, d], [0, -(h - t) / 2, 0]);
    panel(
      'Задняя стенка корпуса',
      [w - 2 * t, h - 2 * t, t],
      [0, 0, (-front * (d - t)) / 2],
    );
    body.geometry = { kind: 'group', size: [w, h, d] };
  }
}
const hinge = (
  axis: Mechanism['axis'],
  pivot: Vec3,
  extent: number,
  progress = 0,
): Mechanism => ({ kind: 'hinge', axis, pivot, extent, progress });
export function configureMechanism(
  project: EditorProject,
  id: string,
  preset: MechanismPreset,
): EditorProject {
  const next = clone(project),
    root = findNode(next.scene.objects, id);
  assertOperable(next.scene.objects, id);
  if (!root) throw new Error('Объект не найден.');
  if (
    flattenNodes([root]).some(
      ({ node }) => node.mechanism || node.mechanismPreset,
    )
  )
    throw new Error(
      'Механизмы уже настроены. Измените их параметры или отмените настройку через историю.',
    );
  for (const { node } of flattenNodes([root]))
    assertOperable(next.scene.objects, node.id);
  if (preset === 'door') {
    const openings = flattenNodes([root])
      .map((x) => x.node)
      .filter((n) => n.geometry.doorSwing);
    if (!openings.length)
      throw new Error('Выберите дверь или стену с дверью из плана.');
    for (const opening of openings) {
      const swing = opening.geometry.doorSwing!;
      const leaves = opening.children.filter(
        (n) => n.name === 'Дверное полотно',
      );
      if (!leaves.length) throw new Error('В проёме нет дверного полотна.');
      for (const leaf of leaves) {
        const end = leaf.position[0] < 0 ? -1 : 1;
        const pivotInParent = new Vector3(
          (end * opening.geometry.size[0]) / 2,
          leaf.position[1],
          swing.offset,
        );
        const pivot = pivotInParent
          .applyMatrix4(nodeMatrix(leaf).invert())
          .toArray();
        const extent = swing.side * end * 90;
        const progress = leaf.rotation[1] / extent;
        if (
          Math.abs(leaf.rotation[0]) > 1e-6 ||
          Math.abs(leaf.rotation[2]) > 1e-6 ||
          progress < 0 ||
          progress > 1
        )
          throw new Error(
            'Полотно повёрнуто вне стандартного сектора. Выберите его и задайте механизм вручную.',
          );
        leaf.mechanism = hinge('y', pivot, extent, progress);
      }
      opening.mechanismPreset = 'door';
    }
  } else if (preset === 'sofa') {
    const back = root.children.find((n) => /Спинка/.test(n.name));
    const seats = root.children.filter((n) =>
      /Подушка сиденья|Сиденье/.test(n.name),
    );
    if (!back || !seats.length)
      throw new Error('Для выкатной схемы нужны спинка и подушки сиденья.');
    const front = -Math.sign(back.position[2] || -1),
      seat = groupParts(root, seats, 'Выкатная секция дивана');
    const seatBox = localBounds(seat),
      seatY = seat.position[1];
    if (back.geometry.kind !== 'box' || back.children.length)
      throw new Error('Для этой спинки задайте движение вручную.');
    const originalBack = clone(back),
      [bw, bh, bd] = back.geometry.size;
    const splitY = Math.max(
      -bh / 2 + 0.01,
      Math.min(
        bh / 2 - 0.01,
        (seatY + seatBox.max.y - bd / 2 - back.position[1]) / back.scale[1],
      ),
    );
    const upperHeight = bh / 2 - splitY;
    // Preserve the exact closed exterior; the lower frame stays fixed, the upper cushion folds forward.
    back.geometry = { kind: 'group', size: [bw, bh, bd] };
    back.children = [];
    const lower = clone(originalBack);
    lower.id = newId('sofa-back-frame');
    lower.name = 'Неподвижная часть спинки';
    lower.geometry = {
      ...originalBack.geometry,
      size: [bw, splitY + bh / 2, bd],
    };
    lower.position = [0, (splitY - bh / 2) / 2, 0];
    lower.rotation = [0, 0, 0];
    lower.scale = [1, 1, 1];
    const upper = clone(originalBack);
    upper.id = newId('sofa-back-cushion');
    upper.name = 'Откидная спинка';
    upper.geometry = { ...originalBack.geometry, size: [bw, upperHeight, bd] };
    upper.position = [0, splitY + upperHeight / 2, 0];
    upper.rotation = [0, 0, 0];
    upper.scale = [1, 1, 1];
    upper.mechanism = hinge('x', [0, -upperHeight / 2, 0], front * 90);
    back.children.push(lower, upper);
    seat.mechanism = {
      kind: 'slide',
      axis: 'z',
      pivot: [0, 0, 0],
      extent: front * Math.max(0.2, upperHeight * back.scale[1] - bd / 2),
      progress: 0,
    };
    const support = baseNode(newId('sofa-support'), 'Опора выкатной секции', {
      kind: 'box',
      size: [seatBox.max.x - seatBox.min.x, Math.max(0.01, seatY - 0.1), 0.035],
    });
    support.position = [
      0,
      -(seatY + 0.1) / 2,
      front * Math.max(0, seatBox.max.z - 0.05),
    ];
    support.color = back.color;
    support.material = back.material;
    seat.children.push(support);
  } else {
    if (root.geometry.kind !== 'group' || root.category !== 'furniture')
      throw new Error('Выберите шкаф или технику целиком.');
    const facades = root.children.filter(
      (n) => n.name === 'Фасад' || n.name === 'Дверца',
    );
    const appliance = root.children.filter((n) => n.name === 'Дверца техники');
    if (!facades.length && !(preset === 'oven' && appliance.length))
      throw new Error(
        'У предмета нет фасадов. Можно настроить выбранную деталь вручную.',
      );
    const front = Math.sign((facades[0] ?? appliance[0]).position[2] || 1);
    hollowBody(root, front);
    if (preset === 'dishwasher' || preset === 'fridge' || preset === 'oven') {
      const parts = root.children.filter((n) =>
        preset === 'oven'
          ? n.name === 'Дверца техники' || n.name === 'Ручка техники'
          : facades.includes(n) ||
            /Ручка|Разделение дверей|Панель посудомоечной/.test(n.name),
      );
      if (preset === 'oven') {
        // The lower appliance is the oven; the upper microwave retains its current geometry.
        const door = appliance
          .slice()
          .sort((a, b) => a.position[1] - b.position[1])[0];
        if (!door) throw new Error('В пенале нет дверцы духовки.');
        // Remove the generic cabinet frontage behind the oven opening.
        for (const facade of facades) {
          const inv = nodeMatrix(facade).invert(),
            doorBox = localBounds(door)
              .applyMatrix4(nodeMatrix(door))
              .applyMatrix4(inv);
          const [w, h, d] = facade.geometry.size;
          const x0 = Math.max(-w / 2, doorBox.min.x),
            x1 = Math.min(w / 2, doorBox.max.x);
          const y0 = Math.max(-h / 2, doorBox.min.y),
            y1 = Math.min(h / 2, doorBox.max.y);
          if (x1 <= x0 || y1 <= y0) continue;
          const regions = [
            [-w / 2, -h / 2, x0, h / 2],
            [x1, -h / 2, w / 2, h / 2],
            [x0, -h / 2, x1, y0],
            [x0, y1, x1, h / 2],
          ];
          const template = clone(facade);
          facade.geometry = { kind: 'group', size: [w, h, d] };
          facade.children = [];
          for (const [a, b, c, e] of regions)
            if (c - a > 0.001 && e - b > 0.001) {
              const piece = clone(template);
              piece.id = newId('oven-frontage');
              piece.name = 'Обрамление духовки';
              piece.geometry = { kind: 'box', size: [c - a, e - b, d] };
              piece.position = [(a + c) / 2, (b + e) / 2, 0];
              piece.rotation = [0, 0, 0];
              piece.scale = [1, 1, 1];
              facade.children.push(piece);
            }
        }
        const handle = parts
          .filter((n) => n.name === 'Ручка техники')
          .sort(
            (a, b) =>
              Math.abs(a.position[1] - door.position[1]) -
              Math.abs(b.position[1] - door.position[1]),
          )[0];
        parts.splice(0, parts.length, door, ...(handle ? [handle] : []));
      }
      const moving = groupParts(
        root,
        parts,
        preset === 'fridge'
          ? 'Дверца холодильника'
          : preset === 'oven'
            ? 'Дверца духовки'
            : 'Дверца посудомойки',
      );
      const b = localBounds(moving);
      moving.mechanism =
        preset === 'fridge'
          ? hinge('y', [b.min.x, 0, 0], -front * 110)
          : hinge('x', [0, b.min.y, 0], front * 90);
    } else {
      for (const facade of facades) {
        const handles = root.children.filter((n) => n.name === 'Ручка');
        const handle = handles.sort(
          (a, b) =>
            Math.abs(a.position[0] - facade.position[0]) -
            Math.abs(b.position[0] - facade.position[0]),
        )[0];
        const moving = groupParts(
          root,
          [facade, ...(handle ? [handle] : [])],
          preset === 'drawer' ? 'Выдвижной ящик' : 'Распашная дверца',
        );
        const b = localBounds(moving),
          side = moving.position[0] > 0 ? 1 : -1;
        if (preset === 'cabinet')
          moving.mechanism = hinge(
            'y',
            [side < 0 ? b.min.x : b.max.x, 0, 0],
            front * side * 100,
          );
        else {
          const depth = Math.max(0.1, root.geometry.size[2] * 0.78),
            width = b.max.x - b.min.x;
          const tray = baseNode(newId('drawer-tray'), 'Дно выдвижного ящика', {
            kind: 'box',
            size: [width * 0.92, 0.018, depth],
          });
          tray.position = [0, b.min.y + 0.03, (-front * depth) / 2];
          tray.color = facade.color;
          tray.material = 'wood';
          moving.children.push(tray);
          for (const side of [-1, 1]) {
            const rail = clone(tray);
            rail.id = newId('drawer-side');
            rail.name = 'Боковина ящика';
            rail.geometry.size = [
              0.018,
              Math.min(0.18, (b.max.y - b.min.y) * 0.6),
              depth,
            ];
            rail.position = [
              side * width * 0.44,
              b.min.y + rail.geometry.size[1] / 2 + 0.04,
              (-front * depth) / 2,
            ];
            moving.children.push(rail);
          }
          moving.mechanism = {
            kind: 'slide',
            axis: 'z',
            pivot: [0, 0, 0],
            extent: front * depth,
            progress: 0,
          };
        }
      }
    }
  }
  root.mechanismPreset = preset;
  return validateProject(next);
}
export interface MechanismCollision {
  movingId: string;
  obstacleId: string;
}
/** Current operating pose, excluding intentional contacts within the same furniture assembly. */
export function mechanismCollisions(
  nodes: SceneNode[],
  rootId: string,
): MechanismCollision[] {
  const root = findNode(nodes, rootId);
  if (!root) return [];
  const parts = new Set(
    flattenNodes([root]).flatMap(({ node }) =>
      node.mechanism ? flattenNodes([node]).map((x) => x.node.id) : [],
    ),
  );
  const ownerIds = new Set(flattenNodes([root]).map((x) => x.node.id));
  const shapes = analysisFootprints(nodes, 'solids').filter(
    (s) => s.kind === 'furniture' || s.kind === 'wall',
  );
  const moving = shapes.filter((s) => parts.has(s.nodeId)),
    obstacles = shapes.filter((s) => !ownerIds.has(s.nodeId));
  const result: MechanismCollision[] = [],
    seen = new Set<string>();
  const overlaps = (a: Footprint, b: Footprint) =>
    Math.min(a.maxY, b.maxY) - Math.max(a.minY, b.minY) > 0.005 &&
    polygonsOverlap(a.points, b.points);
  for (const a of moving)
    for (const b of obstacles) {
      const key = `${a.nodeId}:${b.owner}`;
      if (!seen.has(key) && overlaps(a, b)) {
        seen.add(key);
        result.push({
          movingId: a.nodeId,
          obstacleId: findNode(nodes, b.owner) ? b.owner : b.nodeId,
        });
      }
    }
  return result;
}
