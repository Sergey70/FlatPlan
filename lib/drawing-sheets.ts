import { Matrix4, Vector3 } from 'three';
import { type Point } from './apartment.ts';
import { type Arrangement, type SceneNode } from './editor-model.ts';
import {
  createNodeGeometry,
  hull,
  nodeColor,
  nodeMatrix,
  planDrawing,
} from './editor-geometry.ts';
import { electricalNodes, electricalPosition } from './electrical.ts';
import {
  measureSurfaces,
  roomContains,
  type MeasuredRoom,
  type WallSurface,
} from './room-surfaces.ts';
import type { Finish } from './design-types.ts';
import { electricalKinds } from './renovation-types.ts';

export interface DrawingSheet {
  id: string;
  title: string;
  kind: 'plan' | 'furniture' | 'electrical' | 'elevation' | 'schedule';
  roomId?: string;
  scale: number | null;
  widthMm: number;
  heightMm: number;
  svg: string;
}
export interface ElevationPart {
  id: string;
  name: string;
  points: Point[];
  color: string;
  finish?: Finish;
  kind: 'wall' | 'opening' | 'furniture';
  depth: number;
}
export interface Elevation {
  id: string;
  name: string;
  roomId: string;
  roomName: string;
  roomPolygon: Point[];
  roomHoles: Point[][];
  origin: Vector3;
  u: Vector3;
  v: Vector3;
  normal: Vector3;
  min: Point;
  max: Point;
  parts: ElevationPart[];
  points: {
    id: string;
    name: string;
    number: number;
    position: Point;
    height: number;
    group: string;
  }[];
}
const f = (v: number, n = 2) => Number(v.toFixed(n)).toString();
const cm = (v: number) => f(v * 100, 1).replace('.', ',');
const xml = (value: string) =>
  value.replace(
    /[<>&"']/g,
    (c) =>
      ({
        '<': '&lt;',
        '>': '&gt;',
        '&': '&amp;',
        '"': '&quot;',
        "'": '&apos;',
      })[c]!,
  );
const label = (
  x: number,
  y: number,
  value: string,
  size = 2.8,
  anchor = 'start',
  extra = '',
) =>
  `<text x="${f(x)}" y="${f(y)}" font-size="${size}" text-anchor="${anchor}" ${extra}>${xml(value)}</text>`;
const line = (a: Point, b: Point, extra = '') =>
  `<path d="M${a.map((n) => f(n)).join(' ')}L${b.map((n) => f(n)).join(' ')}" fill="none" stroke="#66777a" stroke-width="0.18" ${extra}/>`;
const path = (points: Point[], close = true) =>
  points.length
    ? `M${points.map((p) => p.map((n) => f(n, 4)).join(' ')).join('L')}${close ? 'Z' : ''}`
    : '';
function bounds(points: Point[]) {
  return {
    min: [
      Math.min(...points.map((p) => p[0])),
      Math.min(...points.map((p) => p[1])),
    ] as Point,
    max: [
      Math.max(...points.map((p) => p[0])),
      Math.max(...points.map((p) => p[1])),
    ] as Point,
  };
}
function dimension(a: Point, b: Point, value: number, offset: number) {
  const dx = b[0] - a[0],
    dy = b[1] - a[1],
    length = Math.hypot(dx, dy);
  if (length < 0.2) return '';
  const normal: Point = [-dy / length, dx / length];
  const c: Point = [a[0] + normal[0] * offset, a[1] + normal[1] * offset],
    d: Point = [b[0] + normal[0] * offset, b[1] + normal[1] * offset];
  const middle: Point = [(c[0] + d[0]) / 2, (c[1] + d[1]) / 2];
  return (
    line(a, [
      c[0] + normal[0] * 1.5 * Math.sign(offset),
      c[1] + normal[1] * 1.5 * Math.sign(offset),
    ]) +
    line(b, [
      d[0] + normal[0] * 1.5 * Math.sign(offset),
      d[1] + normal[1] * 1.5 * Math.sign(offset),
    ]) +
    line(c, d) +
    [c, d]
      .map((p) => line([p[0] - 0.7, p[1] + 0.7], [p[0] + 0.7, p[1] - 0.7]))
      .join('') +
    `<g transform="translate(${f(middle[0])} ${f(middle[1])}) rotate(${f((Math.atan2(dy, dx) * 180) / Math.PI)})">${label(0, -1, cm(value), 2.7, 'middle', 'paint-order="stroke" stroke="white" stroke-width="1" stroke-linejoin="round"')}</g>`
  );
}
function textLines(value: string, max = 37) {
  const words = value.trim().split(/\s+/),
    lines: string[] = [];
  let current = '';
  for (const word of words) {
    for (let i = 0; i < word.length; i += max) {
      const part = word.slice(i, i + max);
      if (current && current.length + part.length + 1 > max) {
        lines.push(current);
        current = '';
      }
      current += (current ? ' ' : '') + part;
    }
  }
  if (current) lines.push(current);
  return lines;
}
function note(x: number, y: number, value: string, width = 37, size = 2.5) {
  return textLines(value, width)
    .map((s, i) => label(x, y + i * 4, s, size))
    .join('');
}
function scaleFor(w: number, h: number, mmWidth = 188, mmHeight = 128) {
  const required = Math.max((w * 1000) / mmWidth, (h * 1000) / mmHeight);
  return (
    [10, 20, 25, 50, 75, 100, 150, 200, 250, 500, 1000].find(
      (s) => s >= required,
    ) ?? Math.ceil(required / 100) * 100
  );
}
function frame(
  title: string,
  subtitle: string,
  body: string,
  scale: number | null,
  sheetNumber: number,
  projectName: string,
) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="297mm" height="210mm" viewBox="0 0 297 210"><rect width="297" height="210" fill="white"/><g font-family="Arial, sans-serif" fill="#22383e"><rect x="8" y="8" width="281" height="194" fill="none" stroke="#7c8a8d" stroke-width="0.2"/>${label(14, 18, title, 4.6)}${label(14, 25, subtitle, 2.6)}${line([14, 29], [283, 29])}${body}${line([14, 188], [283, 188])}${label(14, 194, `FlatPlan · ${projectName.slice(0, 60)}`, 2.6)}${label(14, 199, 'Размеры в см. Модель требует проверки обмерами. Печать: 100%, без подгонки.', 2.3)}${label(282, 194, scale ? `A4 · 1:${scale} · Лист ${sheetNumber}` : `A4 · Лист ${sheetNumber}`, 2.6, 'end')}${label(282, 199, 'Чертёж по текущей сцене', 2.3, 'end')}</g></svg>`;
}
function worldNodes(nodes: SceneNode[]) {
  const out: { node: SceneNode; matrix: Matrix4; root: SceneNode }[] = [];
  const visit = (node: SceneNode, parent: Matrix4, root: SceneNode) => {
    if (!node.visible) return;
    const matrix = parent.clone().multiply(nodeMatrix(node));
    const itemRoot =
      node.category === 'furniture' &&
      (root.category !== 'furniture' || root.assembly)
        ? node
        : root;
    out.push({ node, matrix, root: itemRoot });
    node.children.forEach((n) => visit(n, matrix, itemRoot));
  };
  nodes.forEach((n) => visit(n, new Matrix4(), n));
  return out;
}
function surfaceCorners(s: WallSurface) {
  const a = new Vector3(...s.from),
    b = new Vector3(...s.to),
    up = new Vector3(...s.up);
  return [a, b, b.clone().add(up), a.clone().add(up)];
}
/** Front orthographic views: observer is in the room, right is horizontal on the sheet. */
export function buildElevations(
  scene: Arrangement,
  roomIds?: string[],
  nearDepth = 1.1,
): Elevation[] {
  const { rooms, surfaces } = measureSurfaces(scene),
    entries = worldNodes(scene.objects);
  const index = new Map(entries.map((e) => [e.node.id, e]));
  const groups = new Map<string, WallSurface[]>();
  for (const surface of surfaces) {
    if (!surface.roomId || (roomIds && !roomIds.includes(surface.roomId)))
      continue;
    const a = new Vector3(...surface.from),
      tangent = new Vector3(...surface.to).sub(a),
      up = new Vector3(...surface.up);
    const normal = up.clone().cross(tangent).normalize();
    const key = [
      surface.roomId,
      ...normal.toArray().map((n) => f(n, 4)),
      f(normal.dot(a), 4),
    ].join(':');
    groups.set(key, [...(groups.get(key) ?? []), surface]);
  }
  const numbers = new Map(
    electricalNodes(scene.objects, true).map((n, i) => [n.id, i + 1]),
  );
  const result: Elevation[] = [];
  for (const [id, patches] of groups) {
    const first = patches[0],
      room = rooms.find((r) => r.id === first.roomId)!;
    const origin = new Vector3(...first.from),
      u = new Vector3(...first.from).sub(new Vector3(...first.to)).normalize();
    const normal = new Vector3(...first.up)
        .cross(u.clone().negate())
        .normalize(),
      v = normal.clone().cross(u).normalize();
    const project = (p: Vector3): Point => {
      const q = p.clone().sub(origin);
      return [q.dot(u), q.dot(v)];
    };
    const parts: ElevationPart[] = patches.map((s) => {
      const wall = index.get(s.wallId)!.node,
        finish = wall.surfaces?.[s.face] ?? wall.finish;
      return {
        id: wall.id,
        name: wall.name,
        points: surfaceCorners(s).map(project),
        color: finish?.color ?? nodeColor(wall, scene.view),
        finish,
        kind: 'wall',
        depth: 0,
      };
    });
    const extent = bounds(parts.flatMap((p) => p.points));
    // Opening voids follow wallBlocks semantics, including inherited transforms.
    for (const wallId of new Set(patches.map((s) => s.wallId))) {
      const { node: wall, matrix } = index.get(wallId)!;
      for (const opening of wall.children.filter(
        (n) => n.visible && n.geometry.kind === 'opening',
      )) {
        const left =
            opening.position[0] -
            (opening.geometry.size[0] * opening.scale[0]) / 2,
          right = left + opening.geometry.size[0] * opening.scale[0],
          bottom = opening.position[1],
          top = bottom + opening.geometry.size[1] * opening.scale[1];
        // Project onto this face rather than the wall centre plane (also valid for sheared parents).
        const world = [
          [left, bottom],
          [right, bottom],
          [right, top],
          [left, top],
        ].map(([x, y]) => {
          const p = new Vector3(x, y, 0).applyMatrix4(matrix);
          return p.addScaledVector(normal, -p.clone().sub(origin).dot(normal));
        });
        const points = world.map(project),
          b = bounds(points);
        if (
          b.max[0] > extent.min[0] + 0.001 &&
          b.min[0] < extent.max[0] - 0.001
        )
          parts.push({
            id: opening.id,
            name:
              opening.geometry.openingType === 'window'
                ? 'Окно'
                : 'Дверной проём',
            points,
            color: '#edf7fa',
            kind: 'opening',
            depth: 0,
          });
      }
    }
    // Project real mesh vertices; only nearby furniture on the room side is shown.
    for (const { node, matrix, root } of entries) {
      if (node.category !== 'furniture' || node.electrical || root.electrical)
        continue;
      const geo = createNodeGeometry(node);
      if (!geo) continue;
      const attribute = geo.getAttribute('position'),
        points: Point[] = [];
      let minDepth = Infinity,
        maxDepth = -Infinity;
      for (let i = 0; i < attribute.count; i++) {
        const p = new Vector3(
          attribute.getX(i),
          attribute.getY(i),
          attribute.getZ(i),
        ).applyMatrix4(matrix);
        const depth = p.clone().sub(origin).dot(normal);
        minDepth = Math.min(minDepth, depth);
        maxDepth = Math.max(maxDepth, depth);
        points.push(project(p));
      }
      geo.dispose();
      const b = bounds(points);
      if (
        minDepth < -0.12 ||
        minDepth > nearDepth ||
        maxDepth < -0.01 ||
        b.max[0] <= extent.min[0] ||
        b.min[0] >= extent.max[0] ||
        b.max[1] < extent.min[1] ||
        b.min[1] > extent.max[1]
      )
        continue;
      // Shared collinear room faces must not collect furniture from another room.
      const center = new Vector3().setFromMatrixPosition(matrix);
      const inward = center.clone().addScaledVector(normal, 0.02);
      if (!roomContains(room, [inward.x, inward.z])) continue;
      parts.push({
        id: root.id,
        name: root.name,
        points: hull(points),
        color: node.finish?.color ?? nodeColor(node, scene.view),
        finish: node.finish,
        kind: 'furniture',
        depth: maxDepth,
      });
    }
    const points: Elevation['points'] = [];
    for (const node of electricalNodes(scene.objects, true)) {
      const world = new Vector3(...electricalPosition(scene.objects, node.id)),
        d = world.clone().sub(origin).dot(normal),
        p = project(world);
      if (
        d < -0.12 ||
        d > 0.25 ||
        p[0] < extent.min[0] - 0.01 ||
        p[0] > extent.max[0] + 0.01 ||
        p[1] < extent.min[1] - 0.05 ||
        p[1] > extent.max[1] + 0.1
      )
        continue;
      points.push({
        id: node.id,
        name: node.name,
        number: numbers.get(node.id)!,
        position: p,
        height: world.y - room.elevation,
        group: node.electrical!.group,
      });
    }
    result.push({
      id,
      name: '',
      roomId: room.id,
      roomName: room.name,
      roomPolygon: room.polygon,
      roomHoles: room.holes,
      origin,
      u,
      v,
      normal,
      ...extent,
      parts,
      points,
    });
  }
  result.sort(
    (a, b) =>
      a.roomId.localeCompare(b.roomId) ||
      Math.atan2(a.normal.z, a.normal.x) - Math.atan2(b.normal.z, b.normal.x) ||
      a.id.localeCompare(b.id),
  );
  const counts = new Map<string, number>();
  result.forEach((e) => {
    const n = (counts.get(e.roomId) ?? 0) + 1;
    counts.set(e.roomId, n);
    e.name = `${e.roomName} · стена ${n}`;
  });
  return result;
}
function roomAnchor(room: MeasuredRoom): Point {
  const b = bounds(room.polygon),
    target: Point = [(b.min[0] + b.max[0]) / 2, (b.min[1] + b.max[1]) / 2];
  if (roomContains(room, target)) return target;
  const candidates: Point[] = [];
  for (let x = 1; x < 20; x++)
    for (let z = 1; z < 20; z++) {
      const p: Point = [
        b.min[0] + ((b.max[0] - b.min[0]) * x) / 20,
        b.min[1] + ((b.max[1] - b.min[1]) * z) / 20,
      ];
      if (roomContains(room, p)) candidates.push(p);
    }
  return (
    candidates.sort(
      (a, b) =>
        Math.hypot(a[0] - target[0], a[1] - target[1]) -
        Math.hypot(b[0] - target[0], b[1] - target[1]),
    )[0] ?? room.polygon[0]
  );
}
function planSheet(
  scene: Arrangement,
  kind: 'plan' | 'furniture' | 'electrical',
  rooms: MeasuredRoom[],
  number: number,
  name: string,
): DrawingSheet {
  const titles = {
    plan: 'План помещений',
    furniture: 'План мебели',
    electrical: 'План электрических точек',
  };
  const parts = planDrawing(scene.objects, {
    ...scene.view,
    furniture: kind !== 'plan',
  });
  if (!parts.length)
    throw new Error('В текущей сцене нет видимых объектов для чертежа.');
  const b = bounds(parts.flatMap((p) => p.points)),
    w = b.max[0] - b.min[0],
    h = b.max[1] - b.min[1],
    scale = scaleFor(w, h),
    k = 1000 / scale;
  const ox = 118 - ((b.min[0] + b.max[0]) * k) / 2,
    oy = 106 - ((b.min[1] + b.max[1]) * k) / 2;
  const project = (p: Point): Point => [ox + p[0] * k, oy + p[1] * k];
  let body = parts
    .map(
      (p) =>
        `<path d="${path(p.points.map(project), !p.strokeOnly)}${p.holes.map((h) => path(h.map(project))).join('')}" fill-rule="evenodd" fill="${p.strokeOnly ? 'none' : p.kind === 'floor' ? '#fafafa' : p.kind === 'wall' ? '#bac3c3' : p.kind === 'opening' ? '#c5e9f4' : kind === 'electrical' ? '#eef0ef' : xml(p.color)}" stroke="${p.category === 'furniture' ? '#809194' : '#344f56'}" stroke-width="${p.kind === 'wall' ? 0.3 : 0.15}"/>`,
    )
    .join('');
  body +=
    dimension(project(b.min), project([b.max[0], b.min[1]]), w, -6) +
    dimension(project([b.min[0], b.max[1]]), project(b.min), h, -6);
  rooms.forEach((r, i) => {
    const a = project(roomAnchor(r));
    if (kind !== 'electrical')
      body += `<circle cx="${f(a[0])}" cy="${f(a[1])}" r="3" fill="white" stroke="#52686d" stroke-width="0.2"/>${label(a[0], a[1] + 1, `${i + 1}`, 2.8, 'middle')}`;
  });
  body += label(225, 37, 'Помещения', 3.2);
  let y = 44;
  rooms.forEach((r, i) => {
    const b = bounds(r.polygon);
    body += note(225, y, `${i + 1}. ${r.name}`, 29, 2.7);
    y += Math.max(1, textLines(`${i + 1}. ${r.name}`, 29).length) * 4;
    body += label(
      225,
      y,
      `${f(r.floorArea).replace('.', ',')} м² · ${cm(b.max[0] - b.min[0])} × ${cm(b.max[1] - b.min[1])}`,
      2.4,
    );
    y += 7;
  });
  body += note(
    225,
    y + 1,
    'Размеры рядом с площадью: габариты контура, включая ниши.',
    32,
    2.3,
  );
  if (kind === 'electrical') {
    electricalNodes(scene.objects, true).forEach((n, i) => {
      const p = electricalPosition(scene.objects, n.id),
        a = project([p[0], p[2]]);
      body += `<circle cx="${f(a[0])}" cy="${f(a[1])}" r="2.4" fill="white" stroke="#a15423" stroke-width="0.4"/>${label(a[0], a[1] + 0.8, `${i + 1}`, 2.3, 'middle')}`;
    });
    body += note(
      225,
      Math.max(y + 22, 140),
      'Номера точек и высоты приведены в ведомости. Трассы кабелей не заданы.',
      32,
    );
  } else
    body += note(
      225,
      Math.max(y + 22, 140),
      kind === 'plan'
        ? 'Голубой цвет: окна. Дуги: полный сектор открывания двери.'
        : 'Мебель показана в текущем положении, включая открытые механизмы.',
      32,
    );
  return {
    id: kind,
    title: titles[kind],
    kind,
    scale,
    widthMm: 297,
    heightMm: 210,
    svg: frame(
      titles[kind],
      'Текущая планировка · вид сверху',
      body,
      scale,
      number,
      name,
    ),
  };
}
function finishPattern(id: string, finish: Finish, k: number) {
  if (!['tile', 'oak'].includes(finish.kind))
    return { definition: '', fill: finish.color };
  const w = Math.max(0.3, finish.width * k),
    h = Math.max(0.3, finish.height * k),
    joint = Math.max(0.06, finish.joint * k);
  return {
    definition: `<pattern id="${id}" width="${f(w, 4)}" height="${f(h, 4)}" patternUnits="userSpaceOnUse" patternTransform="rotate(${finish.angle})"><rect width="100%" height="100%" fill="${xml(finish.color)}"/><path d="M0 ${f(h)}V0H${f(w)}" stroke="${xml(finish.jointColor)}" stroke-width="${f(joint, 4)}" fill="none"/></pattern>`,
    fill: `url(#${id})`,
  };
}
function elevationSheet(
  e: Elevation,
  number: number,
  name: string,
): DrawingSheet {
  const w = e.max[0] - e.min[0],
    h = e.max[1] - e.min[1],
    scale = scaleFor(w, h, 187, 110),
    k = 1000 / scale;
  const ox = 118 - ((e.min[0] + e.max[0]) * k) / 2,
    oy = 149 + e.min[1] * k;
  const project = (p: Point): Point => [ox + p[0] * k, oy - p[1] * k];
  const topLeft = project([e.min[0], e.max[1]]);
  let defs = `<clipPath id="wall-clip"><rect x="${f(topLeft[0])}" y="${f(topLeft[1])}" width="${f(w * k)}" height="${f(h * k)}"/></clipPath>`,
    shapes = '';
  const parts = [...e.parts].sort(
    (a, b) =>
      (a.kind === 'wall' ? -2 : a.kind === 'opening' ? -1 : a.depth) -
      (b.kind === 'wall' ? -2 : b.kind === 'opening' ? -1 : b.depth),
  );
  parts.forEach((p, i) => {
    let fill = p.color;
    if (p.finish) {
      const pattern = finishPattern(`finish-${i}`, p.finish, k);
      defs += pattern.definition;
      fill = pattern.fill;
    }
    shapes += `<path d="${path(p.points.map(project))}" fill="${xml(fill)}" stroke="${p.kind === 'wall' ? '#74878c' : '#344d55'}" stroke-width="${p.kind === 'wall' ? 0.15 : 0.25}"/>`;
  });
  let body = `<defs>${defs}</defs><g clip-path="url(#wall-clip)">${shapes}</g>`;
  body +=
    dimension(
      project([e.min[0], e.min[1]]),
      project([e.max[0], e.min[1]]),
      w,
      8,
    ) +
    dimension(
      project([e.min[0], e.min[1]]),
      project([e.min[0], e.max[1]]),
      h,
      -8,
    );
  const legend: string[] = [];
  let openingNumber = 0;
  for (const p of e.parts.filter((p) => p.kind === 'opening')) {
    const b = bounds(p.points),
      left = Math.max(e.min[0], b.min[0]),
      right = Math.min(e.max[0], b.max[0]);
    if (right - left < 0.001) continue;
    const n = ++openingNumber,
      pos = project([(left + right) / 2, (b.min[1] + b.max[1]) / 2]);
    body += label(
      pos[0],
      pos[1],
      `П${n}`,
      2.8,
      'middle',
      'paint-order="stroke" stroke="white" stroke-width="1"',
    );
    legend.push(
      `П${n}. ${p.name}: ${cm(b.max[0] - b.min[0])} × ${cm(b.max[1] - b.min[1])}; слева ${cm(b.min[0] - e.min[0])}; низ ${cm(b.min[1] - e.min[1])}`,
    );
  }
  for (const p of e.points) {
    const a = project(p.position);
    body += `<circle cx="${f(a[0])}" cy="${f(a[1])}" r="2" fill="white" stroke="#a15423" stroke-width="0.4"/>${label(a[0], a[1] + 0.7, `${p.number}`, 2.2, 'middle')}`;
    legend.push(
      `Э${p.number}. ${p.name}; слева ${cm(p.position[0] - e.min[0])}; от пола ${cm(p.height)}`,
    );
  }
  body += label(225, 38, 'Проёмы и точки', 3.1);
  let y = 45;
  for (const text of legend) {
    const lines = textLines(text, 33);
    if (y + lines.length * 4 > 112) {
      body += note(225, y, 'Все координаты: ведомость размеров помещения.', 32);
      break;
    }
    body += note(225, y, text, 33);
    y += lines.length * 4 + 3;
  }
  if (!legend.length)
    body += note(
      225,
      y,
      'На этой стороне нет проёмов и электрических точек.',
      32,
    );
  // A separate plan locator makes every wall number unambiguous, including short niche faces.
  const roomBounds = bounds(e.roomPolygon),
    locatorScale = Math.min(
      52 / Math.max(0.01, roomBounds.max[0] - roomBounds.min[0]),
      40 / Math.max(0.01, roomBounds.max[1] - roomBounds.min[1]),
    );
  const locator = (p: Point): Point => [
    253 + (p[0] - (roomBounds.min[0] + roomBounds.max[0]) / 2) * locatorScale,
    155 + (p[1] - (roomBounds.min[1] + roomBounds.max[1]) / 2) * locatorScale,
  ];
  const wallEnds = [e.min[0], e.max[0]].map((x) =>
    e.origin.clone().addScaledVector(e.u, x).addScaledVector(e.v, e.min[1]),
  );
  body += label(225, 128, 'Положение стены', 2.8);
  body += `<path d="${path(e.roomPolygon.map(locator))}${e.roomHoles.map((h) => path(h.map(locator))).join('')}" fill="#f4f6f5" fill-rule="evenodd" stroke="#9aabaf" stroke-width="0.3"/>`;
  body += line(
    locator([wallEnds[0].x, wallEnds[0].z]),
    locator([wallEnds[1].x, wallEnds[1].z]),
    'style="stroke:#b35023;stroke-width:1"',
  );
  const middle = wallEnds[0].clone().lerp(wallEnds[1], 0.5),
    camera = middle.clone().addScaledVector(e.normal, 0.65);
  const tip = locator([middle.x, middle.z]),
    tail = locator([camera.x, camera.z]);
  body += line(tail, tip, 'style="stroke:#b35023;stroke-width:0.4"');
  const angle = Math.atan2(tip[1] - tail[1], tip[0] - tail[0]);
  body += `<path d="${path([tip, [tip[0] - 2 * Math.cos(angle - 0.4), tip[1] - 2 * Math.sin(angle - 0.4)], [tip[0] - 2 * Math.cos(angle + 0.4), tip[1] - 2 * Math.sin(angle + 0.4)]])}" fill="#b35023"/>`;
  const finishes = [
    ...new Set(
      e.parts
        .filter((p) => p.kind === 'wall')
        .map((p) =>
          p.finish
            ? `${{ paint: 'Краска', oak: 'Дерево', tile: 'Плитка', stone: 'Камень', fabric: 'Ткань' }[p.finish.kind]} ${p.finish.color}${['tile', 'oak'].includes(p.finish.kind) ? ` · ${cm(p.finish.width)} × ${cm(p.finish.height)}` : ''}`
            : `Материал модели ${p.color}`,
        ),
    ),
  ];
  body += note(22, 166, `Отделка: ${finishes.join('; ')}`, 100, 2.7);
  body += note(
    22,
    179,
    'Вид из помещения. Мебель в пределах 110 см от стены показана проекцией. Цвет и раскладка отделки условные; начало раскладки не задано.',
    116,
    2.4,
  );
  return {
    id: `elevation-${e.id}`,
    title: e.name,
    kind: 'elevation',
    roomId: e.roomId,
    scale,
    widthMm: 297,
    heightMm: 210,
    svg: frame(
      e.name,
      'Развёртка стены · текущие проёмы, мебель, отделка и точки',
      body,
      scale,
      number,
      name,
    ),
  };
}
function scheduleSheets(
  rows: string[],
  title: string,
  id: string,
  start: number,
  name: string,
): DrawingSheet[] {
  const wrapped = rows.flatMap((row) => [...textLines(row, 138), '']);
  if (!wrapped.length)
    wrapped.push(
      'Точки пока не добавлены. Добавьте их в разделе «Ремонт → Электрика».',
    );
  const sheets: DrawingSheet[] = [];
  for (let offset = 0; offset < wrapped.length; offset += 32) {
    const body = wrapped
      .slice(offset, offset + 32)
      .map((t, i) => label(16, 39 + i * 4.4, t, 2.8))
      .join('');
    sheets.push({
      id: `${id}-${offset}`,
      title: `${title}${offset ? ` · ${offset / 32 + 1}` : ''}`,
      kind: 'schedule',
      scale: null,
      widthMm: 297,
      heightMm: 210,
      svg: frame(
        title,
        'Позиции и размеры по текущей модели',
        body,
        null,
        start + sheets.length,
        name,
      ),
    });
  }
  return sheets;
}
/** No project mutations, browser state, networking or generated image inputs. */
export function buildDrawingSet(
  scene: Arrangement,
  projectName: string,
  roomIds: string[],
): DrawingSheet[] {
  const { rooms } = measureSurfaces(scene);
  const sheets = (['plan', 'furniture', 'electrical'] as const).map((kind, i) =>
    planSheet(scene, kind, rooms, i + 1, projectName),
  );
  const points = electricalNodes(scene.objects, true);
  const rows = points.map((n, i) => {
    const p = electricalPosition(scene.objects, n.id),
      room = rooms.find((r) => roomContains(r, [p[0], p[2]]));
    return `${i + 1}. ${n.name} · ${electricalKinds.find((k) => k.id === n.electrical!.kind)?.name} · ${n.electrical!.group}. X=${cm(p[0])}; Z=${cm(p[2])}; ${room ? `от пола ${room.name}: ${cm(p[1] - room.elevation)}` : `Y от нуля модели: ${cm(p[1])}`}.`;
  });
  sheets.push(
    ...scheduleSheets(
      rows,
      'Ведомость электрических точек',
      'electrical-schedule',
      sheets.length + 1,
      projectName,
    ),
  );
  const roomDetails = new Map<string, { name: string; rows: string[] }>();
  for (const elevation of buildElevations(scene, roomIds)) {
    sheets.push(elevationSheet(elevation, sheets.length + 1, projectName));
    // Full furniture extents and electrical offsets stay readable even on densely furnished walls.
    const furniture = new Map<string, { name: string; points: Point[] }>();
    for (const p of elevation.parts.filter((p) => p.kind === 'furniture')) {
      const entry = furniture.get(p.id) ?? { name: p.name, points: [] };
      entry.points.push(...p.points);
      furniture.set(p.id, entry);
    }
    const details = [...furniture.values()].map((p, i) => {
      const b = bounds(p.points);
      return `М${i + 1}. ${p.name}. Проекция ${cm(b.max[0] - b.min[0])} × ${cm(b.max[1] - b.min[1])}; слева ${cm(b.min[0] - elevation.min[0])}; низ ${cm(b.min[1] - elevation.min[1])}.`;
    });
    details.unshift(
      ...elevation.parts
        .filter((p) => p.kind === 'opening')
        .map((p, i) => {
          const b = bounds(p.points);
          return `П${i + 1}. ${p.name}. Ширина ${cm(b.max[0] - b.min[0])}; высота ${cm(b.max[1] - b.min[1])}; слева ${cm(b.min[0] - elevation.min[0])}; низ ${cm(b.min[1] - elevation.min[1])}.`;
        }),
    );
    details.push(
      ...elevation.points.map(
        (p) =>
          `Э${p.number}. ${p.name}. Слева ${cm(p.position[0] - elevation.min[0])}; от пола ${cm(p.height)}. Группа: ${p.group}.`,
      ),
    );
    if (details.length) {
      const room = roomDetails.get(elevation.roomId) ?? {
        name: elevation.roomName,
        rows: [],
      };
      room.rows.push(elevation.name, ...details);
      roomDetails.set(elevation.roomId, room);
    }
  }
  for (const [id, room] of roomDetails)
    sheets.push(
      ...scheduleSheets(
        room.rows,
        `${room.name} · ведомость развёрток`,
        `details-${id}`,
        sheets.length + 1,
        projectName,
      ),
    );
  return sheets;
}
