import { Object3D, Group } from 'three';
import * as THREE from 'three';
import { rooms, walls, solidOutlines, wallLength } from './apartment.ts';
import {
  clone,
  defaultView,
  newId,
  validateProject,
  type SceneNode,
  type Geometry,
  type MaterialKind,
  type StyleRole,
  type EditorProject,
} from './editor-model.ts';

type Mat = { color: string; kind: MaterialKind; role?: StyleRole };
const mat = (color: string, roughness = 0.75, metalness = 0): Mat => ({
  color,
  kind: metalness > 0.3 ? 'metal' : roughness > 0.9 ? 'fabric' : 'paint',
});
const wood: Mat = { color: '#c8a779', kind: 'wood', role: 'wood' },
  stone: Mat = { color: '#d4d0c7', kind: 'stone', role: 'stone' },
  fabric: Mat = { color: '#d5d5c9', kind: 'fabric', role: 'fabric' },
  accent: Mat = { color: '#738170', kind: 'paint', role: 'accent' };
const porcelain: Mat = { color: '#f4f2ed', kind: 'paint' },
  black: Mat = { color: '#252d30', kind: 'metal' },
  brass: Mat = { color: '#b49560', kind: 'metal' },
  white: Mat = { color: '#f6f3ed', kind: 'paint' },
  plantMat: Mat = { color: '#52644b', kind: 'paint' },
  soil: Mat = { color: '#514332', kind: 'paint' },
  mattressMat: Mat = { color: '#e9e5db', kind: 'fabric' },
  screenMat: Mat = { color: '#17232c', kind: 'glass' },
  glowMat: Mat = { color: '#ffe5b4', kind: 'light' };
function part(
  parent: Object3D,
  geometry: Geometry,
  x: number,
  y: number,
  z: number,
  material: Mat,
) {
  const object = new Object3D();
  object.position.set(x, y, z);
  object.userData = { geometry, material };
  parent.add(object);
  return object;
}
function box(
  parent: Object3D,
  w: number,
  h: number,
  d: number,
  x: number,
  y: number,
  z: number,
  material: Mat,
  radius = 0,
) {
  return part(
    parent,
    { kind: 'box', size: [w, h, d], radius },
    x,
    y,
    z,
    material,
  );
}
function cylinder(
  parent: Object3D,
  r1: number,
  r2: number,
  h: number,
  x: number,
  y: number,
  z: number,
  material: Mat,
) {
  const r = Math.max(r1, r2);
  return part(
    parent,
    {
      kind: 'cylinder',
      size: [2 * r, h, 2 * r],
      topRadius: r1 / r,
      bottomRadius: r2 / r,
    },
    x,
    y,
    z,
    material,
  );
}
function sphere(
  parent: Object3D,
  x: number,
  y: number,
  z: number,
  radius: number,
  material: Mat,
) {
  return part(
    parent,
    { kind: 'sphere', size: [2 * radius, 2 * radius, 2 * radius] },
    x,
    y,
    z,
    material,
  );
}
function group(parent: Object3D, x = 0, z = 0, angle = 0) {
  const object = new Group();
  object.position.set(x, 0, z);
  object.rotation.y = angle;
  parent.add(object);
  return object;
}
export function baseNode(
  id: string,
  name: string,
  geometry: Geometry,
  category: SceneNode['category'] = 'furniture',
): SceneNode {
  return {
    id,
    name,
    geometry,
    category,
    position: [0, 0, 0],
    rotation: [0, 0, 0],
    scale: [1, 1, 1],
    color: '#d4d0c7',
    material: 'paint',
    visible: true,
    locked: false,
    cutaway: false,
    children: [],
  };
}
function furnitureNodes(): SceneNode[] {
  const furniture = new THREE.Group();
  furniture.name = 'Мебель';
  function plant(
    parent: THREE.Object3D,
    x: number,
    z: number,
    scale = 1,
    y = 0,
  ) {
    const p = group(parent, x, z);
    p.name = 'Растение';
    p.position.y = y;
    p.scale.setScalar(scale);
    cylinder(p, 0.18, 0.135, 0.32, 0, 0.16, 0, mat('#b8a08a'));
    cylinder(p, 0.165, 0.165, 0.018, 0, 0.33, 0, soil);
    cylinder(p, 0.012, 0.019, 0.65, 0, 0.6, 0, plantMat);
    for (let i = 0; i < 8; i++) {
      const a = i * 2.4;
      const leaf = sphere(
        p,
        Math.sin(a) * 0.17,
        0.53 + i * 0.052,
        Math.cos(a) * 0.17,
        0.17,
        plantMat,
      );
      leaf.scale.set(0.55, 1.7, 0.55);
      leaf.rotation.z = Math.sin(a) * 0.65;
      leaf.rotation.x = Math.cos(a) * 0.65;
    }
  }
  function vase(parent: THREE.Object3D, x: number, y: number, z: number) {
    cylinder(parent, 0.055, 0.085, 0.2, x, y + 0.1, z, porcelain);
    for (let i = 0; i < 3; i++) {
      const stem = cylinder(
        parent,
        0.004,
        0.004,
        0.3,
        x + i * 0.018,
        y + 0.34,
        z,
        plantMat,
      );
      stem.rotation.z = (i - 1) * 0.18;
      sphere(parent, x + i * 0.025, y + 0.49, z, 0.032, white);
    }
  }
  // Kitchen: cabinetry, countertop, sink, hob, oven and upper storage.
  const kitchen = group(furniture, 0.25, 2.88);
  kitchen.name = 'Кухня';
  for (let i = 0; i < 7; i++) {
    const x = 0.36 + i * 0.67;
    box(kitchen, 0.65, 0.82, 0.61, x, 0.47, 0.31, i < 2 ? wood : accent, 0.018);
    box(kitchen, 0.42, 0.022, 0.033, x, 0.79, 0.64, brass);
    box(kitchen, 0.64, 0.69, 0.32, x, 1.94, 0.17, i < 2 ? wood : white, 0.012);
  }
  box(kitchen, 4.7, 0.055, 0.69, 2.37, 0.91, 0.35, stone, 0.018);
  box(kitchen, 4.72, 0.46, 0.04, 2.37, 1.17, -0.1, stone);
  box(kitchen, 4.5, 0.018, 0.028, 2.37, 1.575, 0.28, glowMat);
  box(kitchen, 0.68, 0.03, 0.47, 1.9, 0.955, 0.36, black, 0.012);
  for (const x of [1.72, 2.08])
    for (const z of [0.24, 0.49])
      cylinder(
        kitchen,
        0.085,
        0.085,
        0.008,
        x,
        0.977,
        z,
        mat('#465055', 0.22, 0.5),
      );
  box(kitchen, 0.52, 0.44, 0.025, 1.9, 0.44, 0.633, black, 0.02);
  box(kitchen, 0.48, 0.055, 0.035, 1.9, 0.69, 0.655, black);
  box(
    kitchen,
    0.56,
    0.015,
    0.41,
    3.23,
    0.95,
    0.34,
    mat('#8b9390', 0.25, 0.7),
    0.05,
  );
  box(
    kitchen,
    0.44,
    0.018,
    0.3,
    3.23,
    0.957,
    0.34,
    mat('#67716e', 0.4, 0.7),
    0.05,
  );
  cylinder(kitchen, 0.018, 0.018, 0.31, 3.23, 1.09, 0.1, brass);
  box(kitchen, 0.033, 0.033, 0.19, 3.23, 1.24, 0.18, brass, 0.012);
  box(kitchen, 0.63, 1.57, 0.64, 0.37, 0.91, 1.18, white, 0.025);
  box(kitchen, 0.035, 0.5, 0.04, 0.6, 1.04, 1.52, black);
  vase(kitchen, 4.2, 0.95, 0.33);
  // Round dining table, four curved chairs and a pendant.
  const dining = group(furniture, 2.5, 4.9);
  dining.name = 'Обеденная группа';
  cylinder(dining, 0.72, 0.72, 0.065, 0, 0.77, 0, wood);
  cylinder(dining, 0.15, 0.29, 0.72, 0, 0.37, 0, wood);
  for (let i = 0; i < 4; i++) {
    const a = (i * Math.PI) / 2;
    const chair = group(dining, Math.sin(a) * 1.0, Math.cos(a) * 1.0, a);
    box(chair, 0.47, 0.11, 0.45, 0, 0.46, 0, fabric, 0.07);
    box(chair, 0.48, 0.35, 0.075, 0, 0.69, 0.19, wood, 0.035);
    for (const x of [-0.18, 0.18])
      for (const z of [-0.17, 0.17])
        cylinder(chair, 0.018, 0.025, 0.43, x, 0.22, z, wood);
  }
  cylinder(dining, 0.21, 0.21, 0.013, -0.2, 0.816, 0.07, porcelain);
  vase(dining, 0.13, 0.81, -0.12);
  const pendant = group(furniture, 2.5, 4.9);
  pendant.name = 'Подвесной светильник';
  cylinder(pendant, 0.009, 0.009, 0.45, 0, 2.42, 0, black);
  cylinder(pendant, 0.18, 0.43, 0.23, 0, 2.09, 0, mat('#c5a47c', 0.93));
  cylinder(pendant, 0.37, 0.37, 0.025, 0, 1.97, 0, glowMat);
  // Living area: sectional sofa, woven rug, tables, sideboard and TV.
  const rug = box(
    furniture,
    3.4,
    0.025,
    2.9,
    2.3,
    0.035,
    7.52,
    mat('#ddd9cf', 1),
    0.09,
  );
  rug.name = 'Ковёр';
  const sofa = group(furniture, 0.8, 7.5, -Math.PI / 2);
  sofa.name = 'Диван';
  box(sofa, 2.6, 0.31, 0.93, 0, 0.25, 0, fabric, 0.09);
  box(sofa, 2.6, 0.49, 0.2, 0, 0.62, 0.4, fabric, 0.065);
  for (const x of [-1.23, 1.23])
    box(sofa, 0.18, 0.42, 1.04, x, 0.47, -0.015, fabric, 0.06);
  for (const x of [-0.79, 0, 0.79]) {
    box(sofa, 0.74, 0.17, 0.75, x, 0.48, -0.07, fabric, 0.07);
    box(sofa, 0.68, 0.42, 0.17, x, 0.68, 0.25, mattressMat, 0.06).rotation.x =
      -0.13;
  }
  box(sofa, 0.43, 0.39, 0.16, -0.82, 0.72, 0.07, accent, 0.075).rotation.z =
    0.22;
  box(
    sofa,
    0.42,
    0.34,
    0.17,
    0.69,
    0.72,
    0.07,
    mat('#b88f74'),
    0.075,
  ).rotation.z = -0.25;
  box(sofa, 0.82, 0.44, 1.15, 0.78, 0.29, -0.69, fabric, 0.08);
  const coffee = group(furniture, 2.65, 7.45);
  coffee.name = 'Журнальный столик';
  cylinder(coffee, 0.5, 0.5, 0.055, 0, 0.41, 0, wood);
  cylinder(coffee, 0.36, 0.41, 0.35, 0, 0.2, 0, wood);
  box(coffee, 0.27, 0.055, 0.36, -0.06, 0.468, 0, white, 0.01).rotation.y =
    0.25;
  cylinder(coffee, 0.07, 0.058, 0.1, 0.22, 0.49, 0.04, porcelain);
  const media = group(furniture, 3.85, 7.85, -Math.PI / 2);
  media.name = 'Тумба и телевизор';
  box(media, 2.17, 0.43, 0.4, 0, 0.31, 0, wood, 0.026);
  for (const x of [-0.9, 0.9]) box(media, 0.04, 0.1, 0.31, x, 0.05, 0, black);
  box(media, 1.56, 0.88, 0.055, 0, 1.11, 0, black, 0.015);
  box(media, 1.46, 0.78, 0.008, 0, 1.12, 0.031, screenMat, 0.01);
  box(media, 0.035, 0.22, 0.03, 0, 0.61, 0, black);
  box(media, 0.37, 0.025, 0.21, 0, 0.51, 0, black);
  plant(furniture, 0.35, 4.7, 0.75);
  plant(furniture, 0.35, 0.2, 0.7);
  const lamp = group(furniture, 0.4, 8.72);
  lamp.name = 'Торшер';
  cylinder(lamp, 0.19, 0.19, 0.025, 0, 0.025, 0, black);
  cylinder(lamp, 0.013, 0.013, 1.49, 0, 0.78, 0, brass);
  cylinder(lamp, 0.16, 0.25, 0.35, 0, 1.53, 0, white);
  // Optional furnishing suggestion; no furniture placement is established by the passport.
  const bed = group(furniture, 3.75, 1.3, Math.PI / 2);
  bed.name = 'Кровать';
  box(bed, 1.66, 0.3, 2.12, 0, 0.22, 0, wood, 0.04);
  box(bed, 1.6, 0.25, 2.02, 0, 0.47, 0, mattressMat, 0.09);
  box(bed, 1.76, 1.04, 0.12, 0, 0.59, -1.03, accent, 0.035);
  box(bed, 1.62, 0.12, 1.3, 0, 0.625, 0.33, white, 0.08);
  box(bed, 1.65, 0.05, 0.42, 0, 0.712, 0.73, accent, 0.02);
  for (const x of [-0.39, 0.39])
    box(bed, 0.65, 0.16, 0.45, x, 0.65, -0.65, white, 0.07);
  for (const x of [-0.99, 0.99]) {
    box(bed, 0.34, 0.46, 0.35, x, 0.26, -0.83, wood, 0.02);
    cylinder(bed, 0.07, 0.1, 0.16, x, 0.59, -0.83, porcelain);
    cylinder(bed, 0.1, 0.14, 0.17, x, 0.75, -0.83, white);
  }
  const wardrobe = box(
    furniture,
    0.46,
    2.25,
    1.6,
    6.88,
    1.13,
    1.08,
    white,
    0.012,
  );
  wardrobe.name = 'Шкаф';
  const bathroom = group(furniture, 0, 0);
  bathroom.name = 'Санузел — оборудование';
  const tub = group(bathroom, 6.72, 8.09);
  tub.name = 'Ванна 170 × 75';
  box(tub, 0.75, 0.12, 1.7, 0, 0.09, 0, porcelain, 0.04);
  box(tub, 0.09, 0.49, 1.7, -0.33, 0.36, 0, porcelain, 0.035);
  box(tub, 0.09, 0.49, 1.7, 0.33, 0.36, 0, porcelain, 0.035);
  box(tub, 0.62, 0.49, 0.1, 0, 0.36, -0.8, porcelain, 0.035);
  box(tub, 0.62, 0.49, 0.1, 0, 0.36, 0.8, porcelain, 0.035);
  box(tub, 0.55, 0.015, 1.4, 0, 0.18, 0, mat('#d3e4e6'), 0.08);
  cylinder(tub, 0.023, 0.023, 0.2, 0.21, 0.72, -0.66, brass);
  box(tub, 0.03, 0.03, 0.19, 0.21, 0.82, -0.6, brass, 0.01);
  box(bathroom, 0.88, 0.44, 0.43, 5.62, 0.56, 8.7, wood, 0.018);
  box(bathroom, 0.91, 0.04, 0.46, 5.62, 0.8, 8.7, stone, 0.015);
  cylinder(bathroom, 0.18, 0.15, 0.12, 5.62, 0.88, 8.7, porcelain);
  cylinder(bathroom, 0.012, 0.012, 0.22, 5.62, 0.99, 8.88, brass);
  box(bathroom, 0.4, 0.36, 0.2, 4.98, 0.42, 8.65, porcelain, 0.07);
  const toilet = sphere(bathroom, 4.98, 0.31, 8.36, 0.24, porcelain);
  toilet.scale.set(0.86, 1, 1.2);
  box(bathroom, 0.38, 0.05, 0.48, 4.98, 0.51, 8.36, white, 0.075);

  let counter = 0;
  function serialize(object: Object3D): SceneNode {
    const m = object.userData.material as Mat | undefined;
    const node = baseNode(
      `furniture-${++counter}`,
      object.name ||
        (m?.kind === 'fabric'
          ? 'Текстиль'
          : m?.kind === 'metal'
            ? 'Фурнитура'
            : 'Деталь') + ` ${counter}`,
      object.userData.geometry ?? { kind: 'group', size: [1, 1, 1] },
    );
    node.position = object.position.toArray();
    node.rotation = [
      object.rotation.x,
      object.rotation.y,
      object.rotation.z,
    ].map((value) => (value * 180) / Math.PI) as SceneNode['rotation'];
    node.scale = object.scale.toArray();
    if (m) {
      node.color = m.color;
      node.material = m.kind;
      if (m.role) node.role = m.role;
    }
    node.children = object.children.map(serialize);
    return node;
  }
  return furniture.children.map(serialize);
}
const wallNames: Record<string, string> = {
  'bedroom-back': 'Фасад жилой комнаты',
  east: 'Правая наружная стена',
  south: 'Нижняя наружная стена',
  'living-west': 'Фасад кухни-гостиной',
  'bedroom-divider': 'Перегородка жилой комнаты',
  'balcony-door': 'Перегородка лоджии',
  'balcony-bottom': 'Нижняя стена лоджии',
  'balcony-west': 'Остекление лоджии сбоку',
  'balcony-back': 'Остекление лоджии сверху',
  'bathroom-top': 'Санузел — стена с дверью',
  'bathroom-left': 'Санузел — левая стена',
  'bathroom-south-finish': 'Санузел — полоса замыкания',
};
export function makeOpening(
  width = 0.9,
  height = 2.1,
  depth = 0.15,
  type: 'door' | 'window' = 'door',
): SceneNode {
  const node = baseNode(
    newId('opening'),
    type === 'door' ? 'Дверной проём' : 'Оконный проём',
    { kind: 'opening', size: [width, height, depth], openingType: type },
    'structure',
  );
  const add = (
    name: string,
    size: SceneNode['position'],
    position: SceneNode['position'],
    color: string,
    material: MaterialKind,
  ) => {
    const p = baseNode(newId('part'), name, { kind: 'box', size }, 'structure');
    p.position = position;
    p.color = color;
    p.material = material;
    node.children.push(p);
  };
  if (type === 'window') {
    add(
      'Стекло',
      [width - 0.06, height - 0.06, 0.012],
      [0, height / 2, 0],
      '#dbe7e9',
      'glass',
    );
    for (const x of [-width / 2, 0, width / 2])
      add(
        'Вертикальная рама',
        [0.04, height, depth],
        [x, height / 2, 0],
        '#f6f3ed',
        'paint',
      );
    for (const y of [0, height])
      add(
        'Горизонтальная рама',
        [width, 0.04, depth],
        [0, y, 0],
        '#f6f3ed',
        'paint',
      );
  } else add('Порог', [width, 0.015, depth], [0, 0.008, 0], '#d4d0c7', 'stone');
  return node;
}
export function createInitialObjects(): SceneNode[] {
  const result: SceneNode[] = [];
  for (const room of rooms) {
    const node = baseNode(
      `floor-${room.id}`,
      `Пол — ${room.name}`,
      {
        kind: 'floor',
        size: [room.width, 0.04, room.depth],
        polygon: clone(room.polygon),
        holes: clone(room.holes),
      },
      'structure',
    );
    node.position[1] = 0.012;
    node.role =
      room.id === 'bathroom' || room.id === 'balcony' ? 'stone' : 'wood';
    node.material = node.role;
    node.color = node.role === 'wood' ? '#c8a779' : '#d4d0c7';
    result.push(node);
  }
  for (const wall of walls) {
    const length = wallLength(wall);
    const node = baseNode(
      `wall-${wall.id}`,
      wallNames[wall.id] ?? wall.id,
      { kind: 'wall', size: [length, 2.8, wall.thickness] },
      'structure',
    );
    node.position = [
      (wall.from[0] + wall.to[0]) / 2,
      0,
      (wall.from[1] + wall.to[1]) / 2,
    ];
    node.rotation[1] =
      (-Math.atan2(wall.to[1] - wall.from[1], wall.to[0] - wall.from[0]) *
        180) /
      Math.PI;
    node.color = '#f2efe8';
    node.role = 'wall';
    node.cutaway = wall.cutaway;
    node.children = wall.openings.map((o, i) => {
      const opening = makeOpening(
        o.to - o.from,
        o.top - o.bottom,
        wall.thickness + 0.03,
        o.kind,
      );
      opening.id = `${node.id}-opening-${i}`;
      opening.children.forEach((part, j) => {
        part.id = `${opening.id}-part-${j}`;
      });
      opening.position = [(o.from + o.to) / 2 - length / 2, o.bottom, 0];
      return opening;
    });
    result.push(node);
  }
  for (const solid of solidOutlines) {
    const node = baseNode(
      `solid-${solid.id}`,
      solid.name,
      {
        kind: 'solid',
        size: [1, solid.height, 1],
        polygon: clone(solid.polygon),
        holes: [],
      },
      'structure',
    );
    node.color = solid.id === 'service' ? '#a9aaa2' : '#f2efe8';
    node.role = solid.id === 'service' ? undefined : 'wall';
    result.push(node);
  }
  return [...result, ...furnitureNodes()];
}
export function createInitialProject(): EditorProject {
  const scene = { objects: createInitialObjects(), view: defaultView() };
  const alternative = clone(scene);
  const move = (name: string, x: number, z: number, yaw: number) => {
    const node = alternative.objects.find((node) => node.name === name);
    if (node) {
      node.position[0] = x;
      node.position[2] = z;
      node.rotation[1] = yaw;
    }
  };
  move('Диван', 2.15, 8.25, 0);
  move('Тумба и телевизор', 2.25, 6.2, 0);
  move('Журнальный столик', 1.65, 7, 0);
  move('Обеденная группа', 5.3, 4.5, 0);
  move('Подвесной светильник', 5.3, 4.5, 0);
  alternative.view.palette = 'warm';
  return validateProject({
    format: 'flatplan-project',
    version: 1,
    name: 'Моя квартира',
    scene,
    arrangements: [
      { id: 'alternative', name: 'Диван у нижней стены', scene: alternative },
      {
        id: 'initial',
        name: 'Исходная расстановка с ванной',
        scene: clone(scene),
      },
    ],
    activeArrangement: 'initial',
  });
}
export const catalog = [
  { id: 'sofa', name: 'Диван' },
  { id: 'bed', name: 'Кровать' },
  { id: 'dining', name: 'Стол и стулья' },
  { id: 'cabinet', name: 'Шкаф' },
  { id: 'bathtub', name: 'Ванна' },
  { id: 'kitchen', name: 'Кухня' },
  { id: 'lamp', name: 'Торшер' },
  { id: 'plant', name: 'Растение' },
  { id: 'box', name: 'Свободный объект' },
  { id: 'wall', name: 'Стена' },
] as const;
export type CatalogId = (typeof catalog)[number]['id'];
export function catalogObject(kind: CatalogId): SceneNode {
  if (kind === 'wall') {
    const wall = baseNode(
      newId('wall'),
      'Новая стена',
      { kind: 'wall', size: [2, 2.8, 0.12] },
      'structure',
    );
    wall.position = [3, 0, 4];
    wall.color = '#f2efe8';
    wall.role = 'wall';
    wall.cutaway = true;
    return wall;
  }
  const names: Record<string, string> = {
    sofa: 'Диван',
    bed: 'Кровать',
    dining: 'Обеденная группа',
    cabinet: 'Шкаф',
    bathtub: 'Ванна 170 × 75',
    kitchen: 'Кухня',
    lamp: 'Торшер',
    plant: 'Растение',
  };
  function search(nodes: SceneNode[]): SceneNode | undefined {
    for (const node of nodes) {
      if (node.name === names[kind]) return node;
      const match = search(node.children);
      if (match) return match;
    }
  }
  const node =
    kind === 'box'
      ? baseNode(newId(), 'Новый объект', {
          kind: 'box',
          size: [1, 1, 1],
          radius: 0.02,
        })
      : clone(search(furnitureNodes())!);
  function renew(node: SceneNode) {
    node.id = newId();
    node.children.forEach(renew);
  }
  renew(node);
  node.position = [3, kind === 'box' ? 0.5 : 0, 4];
  node.rotation = [0, 0, 0];
  return node;
}
