import {
  catalog as originalCatalog,
  catalogObject,
  baseNode,
} from './editor-seed.ts';
import { newId, type SceneNode, type Vec3 } from './editor-model.ts';
import {
  objectDimensions,
  resizeObject,
  sceneBounds,
} from './editor-geometry.ts';
import { planFurniture } from './plan-furniture.ts';

export const furnitureCatalog = [
  ...originalCatalog,
  { id: 'desk', name: 'Рабочий стол' },
  { id: 'office-chair', name: 'Рабочее кресло' },
  { id: 'monitor', name: 'Монитор' },
  { id: 'computer', name: 'Компьютер' },
] as const;
export type FurnitureId = (typeof furnitureCatalog)[number]['id'];
export const furniturePresets: Partial<
  Record<FurnitureId, { name: string; size: Vec3 }[]>
> = {
  desk: [140, 160, 180].map((w) => ({
    name: `${w} × 70`,
    size: [w / 100, 0.75, 0.7],
  })),
  bed: [90, 140, 160, 180].map((w) => ({
    name: `${w} × 200`,
    size: [w / 100, 0.95, 2],
  })),
  cabinet: [80, 120, 160].map((w) => ({
    name: `${w} × 60`,
    size: [w / 100, 2.2, 0.6],
  })),
  sofa: [180, 220, 260].map((w) => ({
    name: `${w} × 90`,
    size: [w / 100, 0.85, 0.9],
  })),
  monitor: [
    { name: '24″', size: [0.54, 0.48, 0.22] },
    { name: '27″', size: [0.61, 0.53, 0.22] },
    { name: '32″', size: [0.72, 0.59, 0.24] },
  ],
};

export function createFurniture(id: FurnitureId, dimensions?: Vec3): SceneNode {
  let node: SceneNode;
  if (originalCatalog.some((c) => c.id === id)) {
    node = catalogObject(id as (typeof originalCatalog)[number]['id']);
  } else if (id === 'desk' || id === 'office-chair') {
    const size = id === 'desk' ? [160, 75, 70] : [62, 115, 64];
    node = planFurniture(
      {
        id: newId('catalog'),
        type: id === 'desk' ? 'work_table' : 'office_chair',
        width: size[0],
        height: size[1],
        depth: size[2],
        center: [300, 400],
        angle: 0,
        bottom: 0,
        hasBottom: true,
        mirrorX: 1,
        mirrorZ: 1,
      },
      2.7,
    );
  } else if (id === 'computer') {
    node = baseNode(newId('computer'), 'Компьютер', {
      kind: 'box',
      size: [0.22, 0.46, 0.42],
      radius: 0.01,
    });
    node.color = '#252d30';
    node.material = 'metal';
    node.position = [3, 0.23, 4];
  } else if (id === 'monitor') {
    node = baseNode(newId('monitor'), 'Монитор', {
      kind: 'group',
      size: [0.61, 0.53, 0.22],
    });
    node.position = [3, 0, 4];
    for (const [name, size, position, color] of [
      ['Подставка', [0.22, 0.02, 0.22], [0, 0.01, 0], '#252d30'],
      ['Стойка', [0.035, 0.23, 0.035], [0, 0.125, -0.05], '#252d30'],
      ['Корпус экрана', [0.61, 0.35, 0.035], [0, 0.355, -0.05], '#252d30'],
      ['Экран', [0.585, 0.325, 0.005], [0, 0.355, -0.03], '#394850'],
    ] as [string, Vec3, Vec3, string][]) {
      const child = baseNode(newId('monitor-part'), name, {
        kind: 'box',
        size,
      });
      child.position = position;
      child.color = color;
      child.material = 'metal';
      node.children.push(child);
    }
  } else throw new Error('Неизвестный предмет каталога.');
  if (id === 'office-chair') node.clearance = { front: 0, back: 0.6 };
  node.rotation = node.rotation.map((n) => (n === 0 ? 0 : n)) as Vec3;
  if (id === 'cabinet') node.clearance = { front: 0.6, back: 0 };
  if (dimensions) {
    if (
      dimensions.length !== 3 ||
      dimensions.some((v) => !Number.isFinite(v) || v < 0.01 || v > 20)
    )
      throw new Error('Габариты должны быть от 1 до 2000 см.');
    resizeObject([node], node, dimensions);
  }
  return node;
}
/** Align the footprint centre and bottom; nested geometry need not be centred at the root. */
export function placeFurniture(
  node: SceneNode,
  centre: [number, number],
  bottom = 0,
) {
  const bounds = sceneBounds([node]);
  node.position[0] += centre[0] - (bounds.min.x + bounds.max.x) / 2;
  node.position[2] += centre[1] - (bounds.min.z + bounds.max.z) / 2;
  node.position[1] += bottom - bounds.min.y;
  return node;
}
export function furnitureSize(id: FurnitureId): Vec3 {
  const node = createFurniture(id);
  return objectDimensions([node], node);
}
