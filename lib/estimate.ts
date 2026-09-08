import { findNode, type Arrangement, type SceneNode } from './editor-model.ts';
import { nodeColor } from './editor-geometry.ts';
import { measureSurfaces } from './room-surfaces.ts';
import {
  defaultEstimate,
  type EstimateRate,
  type EstimateSettings,
} from './renovation-types.ts';
import type { WallFace } from './design-types.ts';
export interface EstimateRow {
  key: string;
  label: string;
  category: 'floor' | 'wall' | 'skirting';
  baseUnit: 'м²' | 'м';
  net: number;
  required: number;
  purchased: number;
  cost: number;
  rate: EstimateRate;
  rooms: { id: string; name: string; net: number }[];
}
const materialNames: Record<string, string> = {
  paint: 'Краска',
  wood: 'Дерево',
  oak: 'Доска / дуб',
  tile: 'Плитка',
  fabric: 'Ткань',
  stone: 'Камень',
  metal: 'Металл',
  glass: 'Стекло',
  light: 'Отделка',
};
function finishKey(scene: Arrangement, node: SceneNode, face?: WallFace) {
  const finish = (face ? node.surfaces?.[face] : undefined) ?? node.finish;
  const kind = finish?.kind ?? node.material,
    color = finish?.color ?? nodeColor(node, scene.view);
  return {
    key: `${kind}:${color}${finish && ['tile', 'oak'].includes(kind) ? `:${finish.width}:${finish.height}` : ''}`,
    label: `${materialNames[kind] ?? kind} · ${color}`,
  };
}
export function estimateScene(
  scene: Arrangement,
  roomId: string | null = null,
  settings: EstimateSettings = scene.estimate ?? defaultEstimate(),
) {
  const measured = measureSurfaces(scene),
    rows = new Map<string, EstimateRow>();
  const rates = new Map(settings.rates.map((r) => [r.key, r]));
  const names = { floor: 'Пол', wall: 'Стены', skirting: 'Плинтус' };
  const add = (
    category: EstimateRow['category'],
    room: (typeof measured.rooms)[number],
    amount: number,
    node: SceneNode,
    face?: WallFace,
  ) => {
    if ((roomId && room.id !== roomId) || amount <= 1e-8) return;
    const finish = finishKey(scene, node, face),
      key = category === 'skirting' ? 'skirting' : `${category}:${finish.key}`;
    let row = rows.get(key);
    if (!row) {
      const baseUnit = category === 'skirting' ? 'м' : 'м²';
      row = {
        key,
        label:
          category === 'skirting'
            ? 'Плинтус'
            : `${names[category]} · ${finish.label}`,
        category,
        baseUnit,
        net: 0,
        required: 0,
        purchased: 0,
        cost: 0,
        rooms: [],
        rate: rates.get(key) ?? {
          key,
          unit: baseUnit,
          price: 0,
          coverage: 1,
          pack: 0,
        },
      };
      rows.set(key, row);
    }
    row.net += amount;
    const allocation = row.rooms.find((r) => r.id === room.id);
    if (allocation) allocation.net += amount;
    else row.rooms.push({ id: room.id, name: room.name, net: amount });
  };
  for (const room of measured.rooms) {
    add('floor', room, room.floorArea, room.floor);
    add('skirting', room, room.skirting, room.floor);
  }
  for (const surface of measured.surfaces) {
    const room = measured.rooms.find((r) => r.id === surface.roomId),
      wall = findNode(scene.objects, surface.wallId);
    if (room && wall) add('wall', room, surface.area, wall, surface.face);
  }
  for (const row of rows.values()) {
    row.required = row.net * (1 + settings.waste / 100);
    const units = row.required / row.rate.coverage;
    row.purchased =
      row.rate.pack > 0
        ? Math.ceil(units / row.rate.pack - 1e-10) * row.rate.pack
        : units;
    row.cost = row.purchased * row.rate.price;
  }
  const items = [...rows.values()].sort(
    (a, b) =>
      a.category.localeCompare(b.category) || a.label.localeCompare(b.label),
  );
  return {
    rows: items,
    total: items.reduce((s, r) => s + r.cost, 0),
    currency: settings.currency,
    waste: settings.waste,
    measured,
    unpriced: items.filter((r) => r.rate.price === 0).length,
  };
}
export function estimateCsv(scene: Arrangement, roomId: string | null = null) {
  const result = estimateScene(scene, roomId);
  const text = (value: unknown) => {
    let s = String(value);
    if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
    return '"' + s.replaceAll('"', '""') + '"';
  };
  const rows = [
    [
      'Материал',
      'Чистое количество',
      'Ед. расчёта',
      'Запас, %',
      'Количество к покупке',
      'Ед. покупки',
      'Цена за единицу',
      `Стоимость, ${result.currency}`,
    ],
    ...result.rows.map((r) => [
      r.label,
      r.net.toFixed(3),
      r.baseUnit,
      result.waste,
      r.purchased.toFixed(3),
      r.rate.unit,
      r.rate.price.toFixed(2),
      r.cost.toFixed(2),
    ]),
    ['Итого', '', '', '', '', '', '', result.total.toFixed(2)],
  ];
  return '\ufeff' + rows.map((row) => row.map(text).join(';')).join('\r\n');
}
