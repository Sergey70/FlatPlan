import { baseNode } from './editor-seed.ts';
import type { PlanItem } from './plan-data.ts';
import type {
  MaterialKind,
  SceneNode,
  StyleRole,
  Vec3,
} from './editor-model.ts';

const names: Record<string, string> = {
  rectangular_shower_cabin_true: 'Душевая кабина',
  toilet_with_frame: 'Унитаз',
  sink_box: 'Подвесная тумба с раковиной',
  washing_machine: 'Стиральная машина',
  floor_standing_sink_cabinet: 'Тумба с раковиной',
  chair: 'Стул',
  bed_double: 'Двуспальная кровать',
  office_chair: 'Рабочее кресло',
  bedside_table: 'Прикроватная тумба',
  kitchen_sink: 'Кухонная мойка',
  dishwashing_machine: 'Посудомоечная машина',
  built_in_fridge: 'Встроенный холодильник',
  cooktop_2k_electro: 'Варочная панель',
  kitchen_box: 'Кухонный шкаф',
  pencil_case_oven_microwave: 'Пенал с духовкой и СВЧ',
  tv: 'Телевизор',
  work_table: 'Рабочий стол',
  conference_chair: 'Кресло',
  sofa: 'Диван',
  sofa_triple: 'Трёхместный диван',
  table_round: 'Круглый стол',
  kitchen_box_penal: 'Кухонный пенал',
  ward_double: 'Шкаф',
  floor_hanger_shelf: 'Прихожая',
  ceiling_chandelier_shades: 'Потолочный светильник',
  chandelier: 'Светильник',
  socket_group: 'Розетки',
  bed_single: 'Односпальная кровать',
  hanging_chandelier_shades: 'Подвесной светильник',
  towel_dryer_shelf: 'Полотенцесушитель',
  sofa_corner: 'Угловой диван',
  table_oval: 'Овальный стол',
  kitchen_box_door: 'Кухонный шкаф',
  hanging_light: 'Подвесной светильник',
  kitchen_box_wall_solid: 'Навесной кухонный шкаф',
  threedoor_ward: 'Трёхдверный шкаф',
  ward_single: 'Однодверный шкаф',
  kitchen_sink_large: 'Кухонная мойка',
  bathtub_acryl: 'Ванна',
  hygienic_shower: 'Гигиенический душ',
  sink_box_floor: 'Тумба с раковиной',
  floor_pencil_cabinet: 'Пенал',
  lightspot: 'Точечный светильник',
  installation_сabinet: 'Шкаф над инсталляцией',
};
export function itemHeight(item: PlanItem): number {
  if (item.height > 0) return item.height / 100;
  if (item.type.includes('chair')) return 0.8;
  if (/light|chandelier/.test(item.type)) return 0.16;
  return 0.03;
}
export function itemBottom(item: PlanItem, ceiling: number): number {
  if (!item.hasBottom && /light|chandelier/.test(item.type))
    return ceiling - itemHeight(item);
  return item.bottom / 100;
}
/** Semantic primitives fill the recorded plan footprint; no catalog mesh is embedded in .plan. */
export function planFurniture(item: PlanItem, ceiling: number): SceneNode {
  const w = item.width / 100,
    h = itemHeight(item),
    d = item.depth / 100,
    type = item.type;
  const root = baseNode(`plan-${item.id}`, names[type] ?? type, {
    kind: 'group',
    size: [w, h, d],
  });
  root.position = [
    item.center[0] / 100,
    itemBottom(item, ceiling),
    item.center[1] / 100,
  ];
  root.rotation = [0, -item.angle, 0];
  root.cutaway = /light|chandelier/.test(type);
  let count = 0;
  const materials: Record<string, [string, MaterialKind, StyleRole?]> = {
    wood: ['#c8a779', 'wood', 'wood'],
    fabric: ['#d5d5c9', 'fabric', 'fabric'],
    white: ['#f3f1ec', 'paint'],
    wall: ['#e9e4d9', 'paint', 'wall'],
    stone: ['#d4d0c7', 'stone', 'stone'],
    black: ['#263238', 'metal'],
    metal: ['#8c9293', 'metal'],
    glass: ['#b9dce4', 'glass'],
    light: ['#fff0cf', 'light'],
    accent: ['#738170', 'paint', 'accent'],
    dark: ['#26323a', 'paint'],
  };
  function add(
    name: string,
    size: Vec3,
    position: Vec3,
    material = 'wood',
    kind: 'box' | 'cylinder' | 'sphere' = 'box',
  ) {
    const node = baseNode(`${root.id}-part-${++count}`, name, {
      kind,
      size: size.map((v, i) => Math.max(0.001, v * [w, h, d][i])) as Vec3,
    });
    node.position = position.map(
      (v, i) =>
        v *
        [w, h, d][i] *
        (i === 0
          ? Math.sign(item.mirrorX) || 1
          : i === 2
            ? Math.sign(item.mirrorZ) || 1
            : 1),
    ) as Vec3;
    node.position = node.position.map((p, i) => {
      const half = node.geometry.size[i] / 2,
        extent = [w, h, d][i],
        min = i === 1 ? 0 : -extent / 2,
        max = i === 1 ? extent : extent / 2;
      return Math.max(min + half, Math.min(max - half, p));
    }) as Vec3;
    const [color, mat, role] = materials[material];
    node.color = color;
    node.material = mat;
    if (role) node.role = role;
    if (kind === 'box')
      node.geometry.radius = Math.min(0.018, w * 0.015, h * 0.015, d * 0.015);
    root.children.push(node);
    return node;
  }
  function legs(top = 0.85) {
    for (const x of [-0.42, 0.42])
      for (const z of [-0.4, 0.4])
        add('Ножка', [0.06, top, 0.06], [x, top / 2, z], 'metal');
  }
  function cabinet(top = 1) {
    add('Корпус', [1, top, 0.95], [0, top / 2, -0.025], 'wood');
    const doors = /three/.test(type) ? 3 : /single|bedside/.test(type) ? 1 : 2;
    for (let i = 0; i < doors; i++) {
      const x = -0.5 + (i + 0.5) / doors;
      add(
        'Фасад',
        [0.96 / doors, 0.92 * top, 0.025],
        [x, 0.51 * top, 0.4675],
        type.startsWith('kitchen') ? 'accent' : 'wood',
      );
      add(
        'Ручка',
        [0.018, 0.18 * top, 0.02],
        [x + 0.28 / doors, 0.56 * top, 0.49],
        'metal',
      );
    }
  }
  if (/^bed_(single|double)$/.test(type)) {
    function bedPart(
      name: string,
      size: Vec3,
      position: Vec3,
      material = 'wood',
    ) {
      position[2] *= -1;
      if (type === 'bed_single') {
        [position[0], position[2]] = [position[2], position[0]];
        [size[0], size[2]] = [size[2], size[0]];
      }
      add(name, size, position, material);
    }
    bedPart('Основание кровати', [1, 0.28, 1], [0, 0.18, 0]);
    bedPart('Матрас', [0.96, 0.24, 0.92], [0, 0.44, 0.025], 'white');
    bedPart('Покрывало', [0.98, 0.06, 0.7], [0, 0.59, 0.12], 'fabric');
    bedPart('Изголовье', [1, 1, 0.045], [0, 0.5, -0.4775], 'fabric');
    const pillows = type === 'bed_double' ? 2 : 1;
    for (let i = 0; i < pillows; i++)
      bedPart(
        'Подушка',
        [0.8 / pillows, 0.12, 0.19],
        [-0.4 + ((i + 0.5) * 0.8) / pillows, 0.62, -0.3],
        'white',
      );
  } else if (type.startsWith('sofa')) {
    add('Основание', [1, 0.35, 1], [0, 0.18, 0], 'fabric');
    add('Спинка', [1, 1, 0.17], [0, 0.5, -0.415], 'fabric');
    for (const x of [-0.46, 0.46])
      add('Подлокотник', [0.08, 0.72, 1], [x, 0.37, 0], 'fabric');
    const seats = type === 'sofa' ? 1 : 3;
    for (let i = 0; i < seats; i++)
      add(
        'Подушка сиденья',
        [0.82 / seats, 0.23, 0.68],
        [-0.41 + ((i + 0.5) * 0.82) / seats, 0.47, 0.08],
        'fabric',
      );
    if (type === 'sofa_corner')
      add('Секция шезлонга', [0.35, 0.27, 0.7], [0.23, 0.5, 0.1], 'fabric');
  } else if (type.includes('chair')) {
    legs(0.48);
    add('Сиденье', [1, 0.13, 1], [0, 0.5, 0], 'fabric');
    add('Спинка', [1, 0.48, 0.14], [0, 0.76, -0.43], 'fabric');
  } else if (type.startsWith('table_') || type === 'work_table') {
    legs(0.92);
    add(
      'Столешница',
      [1, 0.08, 1],
      [0, 0.96, 0],
      'wood',
      type === 'work_table' ? 'box' : 'cylinder',
    );
  } else if (type === 'bathtub_acryl') {
    add('Дно ванны', [0.96, 0.12, 0.9], [0, 0.12, 0], 'white');
    for (const x of [-0.465, 0.465])
      add('Борт ванны', [0.07, 1, 1], [x, 0.5, 0], 'white');
    for (const z of [-0.455, 0.455])
      add('Борт ванны', [0.86, 1, 0.09], [0, 0.5, z], 'white');
    add('Внутренняя чаша', [0.86, 0.05, 0.82], [0, 0.3, 0], 'stone');
    add('Слив', [0.045, 0.008, 0.07], [0.3, 0.33, 0], 'metal', 'cylinder');
  } else if (type === 'rectangular_shower_cabin_true') {
    add('Поддон', [1, 0.055, 1], [0, 0.0275, 0], 'white');
    for (const x of [-0.49, 0.49])
      add('Стеклянная створка', [0.02, 0.945, 1], [x, 0.5275, 0], 'glass');
    add('Стеклянная стенка', [0.96, 0.945, 0.02], [0, 0.5275, -0.49], 'glass');
    add('Дверь душевой', [0.96, 0.945, 0.02], [0, 0.5275, 0.49], 'glass');
  } else if (type === 'toilet_with_frame') {
    add('Корпус унитаза', [1, 0.9, 1], [0, 0.45, 0], 'white', 'sphere');
    add('Сиденье', [1, 0.1, 1], [0, 0.95, 0], 'white', 'cylinder');
    add('Чаша', [0.63, 0.03, 0.6], [0, 0.97, 0.1], 'dark', 'cylinder');
  } else if (type.includes('sink')) {
    if (item.height > 0) {
      cabinet(0.88);
      add('Столешница', [1, 0.04, 1], [0, 0.9, 0], 'white');
    } else add('Столешница', [1, 0.92, 1], [0, 0.46, 0], 'stone');
    add('Раковина', [0.65, 0.03, 0.65], [0, 0.94, 0], 'metal', 'cylinder');
    add(
      'Внутренняя чаша',
      [0.5, 0.015, 0.48],
      [0, 0.9675, 0],
      'dark',
      'cylinder',
    );
    add('Смеситель', [0.06, 0.04, 0.08], [0, 0.98, -0.38], 'metal');
  } else if (type === 'washing_machine') {
    add('Корпус', [1, 1, 0.95], [0, 0.5, -0.025], 'white');
    add('Панель управления', [0.92, 0.1, 0.02], [0, 0.88, 0.49], 'metal');
    add('Люк', [0.67, 0.67, 0.04], [0, 0.43, 0.47], 'dark', 'sphere');
    add('Стекло люка', [0.51, 0.51, 0.01], [0, 0.43, 0.495], 'glass', 'sphere');
  } else if (type === 'cooktop_2k_electro') {
    add('Панель', [1, 0.86, 1], [0, 0.43, 0], 'dark');
    for (const z of [-0.24, 0.24])
      add('Конфорка', [0.73, 0.1, 0.35], [0, 0.95, z], 'metal', 'cylinder');
  } else if (type === 'tv') {
    add('Рамка телевизора', [1, 1, 0.95], [0, 0.5, -0.025], 'black');
    add('Экран', [0.95, 0.91, 0.04], [0, 0.5, 0.48], 'dark');
  } else if (/light|chandelier/.test(type)) {
    add('Корпус светильника', [1, 1, 1], [0, 0.5, 0], 'metal', 'cylinder');
    add('Рассеиватель', [0.95, 0.05, 0.95], [0, 0.026, 0], 'light', 'cylinder');
  } else if (type === 'socket_group') {
    add('Панель розеток', [1, 0.8, 1], [0, 0.4, 0], 'white');
    add('Разъёмы', [0.55, 0.15, 0.5], [0, 0.925, 0], 'dark', 'cylinder');
  } else if (type === 'hygienic_shower') {
    add('Держатель', [0.35, 1, 0.3], [0, 0.5, -0.35], 'metal');
    add('Лейка', [1, 0.3, 0.35], [0, 0.85, -0.325], 'metal', 'sphere');
    add('Шланг', [0.08, 0.9, 1], [0.15, 0.45, 0], 'metal');
  } else if (type === 'towel_dryer_shelf') {
    for (const x of [-0.47, 0.47])
      add('Стойка', [0.06, 1, 0.06], [x, 0.5, -0.47], 'metal');
    for (let i = 0; i < 5; i++)
      add('Перекладина', [1, 0.045, 1], [0, 0.1 + i * 0.2, 0], 'metal');
  } else {
    cabinet();
    if (type === 'pencil_case_oven_microwave')
      for (const y of [0.34, 0.66]) {
        add('Дверца техники', [0.83, 0.19, 0.012], [0, y, 0.486], 'dark');
        add(
          'Ручка техники',
          [0.66, 0.012, 0.006],
          [0, y + 0.07, 0.497],
          'metal',
        );
      }
    if (type === 'dishwashing_machine')
      add(
        'Панель посудомоечной машины',
        [0.86, 0.07, 0.025],
        [0, 0.88, 0.4875],
        'metal',
      );
    if (type === 'built_in_fridge')
      add('Разделение дверей', [0.98, 0.01, 0.025], [0, 0.35, 0.4875], 'dark');
  }
  return root;
}
