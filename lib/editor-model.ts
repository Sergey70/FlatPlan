import type {
  Mechanism,
  MechanismPreset,
  ElectricalPoint,
  LightingScene,
  EstimateSettings,
  WorkplaceStudy,
  StudyFace,
} from './renovation-types.ts';
import type {
  Finish,
  WallFace,
  SnapSettings,
  WalkSettings,
  SunSettings,
  SavedViewpoint,
} from './design-types.ts';
import { validateContours } from './polygon-validation.ts';
import type { PaletteId, Point } from './apartment.ts';

export type Vec3 = [number, number, number];
export type NodeKind =
  | 'group'
  | 'box'
  | 'cylinder'
  | 'sphere'
  | 'floor'
  | 'wall'
  | 'solid'
  | 'opening';
export type MaterialKind =
  | 'paint'
  | 'wood'
  | 'fabric'
  | 'stone'
  | 'metal'
  | 'glass'
  | 'light';
export type StyleRole = 'wood' | 'fabric' | 'stone' | 'wall' | 'accent';
export interface Geometry {
  kind: NodeKind;
  size: Vec3;
  radius?: number;
  topRadius?: number;
  bottomRadius?: number;
  polygon?: Point[];
  holes?: Point[][];
  openingType?: 'window' | 'door';
  wallProfile?: Point[];
  labelAnchor?: Point;
  doorSwing?: { hinge: 'start' | 'end' | 'both'; side: -1 | 1; offset: number };
}
export interface SceneNode {
  id: string;
  name: string;
  category: 'structure' | 'furniture';
  position: Vec3;
  rotation: Vec3;
  scale: Vec3;
  geometry: Geometry;
  color: string;
  material: MaterialKind;
  role?: StyleRole;
  visible: boolean;
  locked: boolean;
  cutaway: boolean;
  children: SceneNode[];
  clearance?: { front: number; back: number };
  assembly?: boolean;
  electrical?: ElectricalPoint;
  mechanism?: Mechanism;
  mechanismPreset?: MechanismPreset;
  finish?: Finish;
  surfaces?: Partial<Record<WallFace, Finish>>;
}
export interface CameraState {
  position: Vec3;
  target: Vec3;
}
export interface EditorView {
  mode: '3d' | '2d';
  planZoom: number;
  planOffset: [number, number];
  palette: PaletteId;
  night: boolean;
  cutaway: boolean;
  furniture: boolean;
  labels: boolean;
  grid: boolean;
  camera: CameraState | null;
  selected: string | null;
  snapping?: SnapSettings;
  walk?: WalkSettings;
  sunlight?: SunSettings;
  electrical?: boolean;
  artificialLight?: boolean;
}
export interface Arrangement {
  objects: SceneNode[];
  view: EditorView;
  measurements?: PlanMeasurement[];
  viewpoints?: SavedViewpoint[];
  lightingScenes?: LightingScene[];
  estimate?: EstimateSettings;
  workplaceStudy?: WorkplaceStudy;
}
export interface PlanMeasurement {
  id: string;
  from: Point;
  to: Point;
}
export interface SavedArrangement {
  id: string;
  name: string;
  scene: Arrangement;
}
export interface EditorProject {
  format: 'flatplan-project';
  version: 1;
  name: string;
  scene: Arrangement;
  arrangements: SavedArrangement[];
  activeArrangement: string | null;
  sourceRevision?: string;
}
export const STORAGE_KEY = 'flatplan.editor.v1';
export const ROOM_WORKSPACE_STORAGE_KEY = 'flatplan.room-workspace.v1';
export const MAX_FILE_BYTES = 8_000_000;
export const clone = <T>(value: T): T => structuredClone(value);
export const newId = (prefix = 'object') =>
  `${prefix}-${globalThis.crypto.randomUUID()}`;
export const defaultView = (): EditorView => ({
  mode: '3d',
  planZoom: 1,
  planOffset: [0, 0],
  palette: 'natural',
  night: false,
  cutaway: true,
  furniture: true,
  labels: true,
  grid: true,
  camera: null,
  selected: null,
});
export function flattenNodes(
  nodes: SceneNode[],
  parent: SceneNode | null = null,
  depth = 0,
): { node: SceneNode; parent: SceneNode | null; depth: number }[] {
  return nodes.flatMap((node) => [
    { node, parent, depth },
    ...flattenNodes(node.children, node, depth + 1),
  ]);
}
export function findNode(
  nodes: SceneNode[],
  id: string | null,
): SceneNode | undefined {
  if (!id) return;
  for (const node of nodes) {
    if (node.id === id) return node;
    const child = findNode(node.children, id);
    if (child) return child;
  }
}
export function findParent(
  nodes: SceneNode[],
  id: string,
): SceneNode | null | undefined {
  for (const node of nodes) {
    if (node.id === id) return null;
    if (node.children.some((child) => child.id === id)) return node;
    const parent = findParent(node.children, id);
    if (parent) return parent;
  }
}
export function editNode(
  project: EditorProject,
  id: string,
  edit: (node: SceneNode) => void,
): EditorProject {
  const next = clone(project),
    node = findNode(next.scene.objects, id);
  if (!node) throw new Error('Объект не найден.');
  edit(node);
  return validateProject(next);
}
export function removeNode(project: EditorProject, id: string): EditorProject {
  const next = clone(project);
  const parent = findParent(next.scene.objects, id);
  const list = parent ? parent.children : next.scene.objects;
  const index = list.findIndex((node) => node.id === id);
  if (index < 0) throw new Error('Объект не найден.');
  list.splice(index, 1);
  if (!findNode(next.scene.objects, next.scene.view.selected))
    next.scene.view.selected = null;
  return validateProject(next);
}
export function duplicateNode(
  project: EditorProject,
  id: string,
): EditorProject {
  const next = clone(project),
    node = findNode(next.scene.objects, id);
  if (!node) throw new Error('Объект не найден.');
  const copy = clone(node);
  for (const { node: part } of flattenNodes([copy])) part.id = newId();
  copy.name += ' — копия';
  if (copy.geometry.kind === 'opening') {
    copy.position[0] += copy.geometry.size[0] * copy.scale[0] + 0.1;
  } else {
    copy.position[0] += 0.25;
    copy.position[2] += 0.25;
  }
  const parent = findParent(next.scene.objects, id);
  (parent ? parent.children : next.scene.objects).push(copy);
  next.scene.view.selected = copy.id;
  return validateProject(next);
}
export function paintNode(
  node: SceneNode,
  color: string,
  material?: MaterialKind,
) {
  for (const { node: part } of flattenNodes([node])) {
    part.color = color;
    delete part.role;
    if (material) {
      part.material = material;
      delete part.finish;
      delete part.surfaces;
    } else {
      if (part.finish) part.finish.color = color;
      for (const surface of Object.values(part.surfaces ?? {}))
        surface.color = color;
    }
  }
}
export function saveArrangement(
  project: EditorProject,
  name: string,
  replace = false,
): EditorProject {
  const next = clone(project),
    title = name.trim();
  if (!title || title.length > 100)
    throw new Error('Название: от 1 до 100 символов.');
  const existing = replace
    ? next.arrangements.find((item) => item.id === next.activeArrangement)
    : undefined;
  if (existing) {
    existing.name = title;
    existing.scene = clone(next.scene);
  } else {
    const item = {
      id: newId('variant'),
      name: title,
      scene: clone(next.scene),
    };
    next.arrangements.push(item);
    next.activeArrangement = item.id;
  }
  return validateProject(next);
}
export function loadArrangement(
  project: EditorProject,
  id: string,
): EditorProject {
  const item = project.arrangements.find((item) => item.id === id);
  if (!item) throw new Error('Вариант не найден.');
  return { ...clone(project), scene: clone(item.scene), activeArrangement: id };
}
const shapes = new Set([
  'group',
  'box',
  'cylinder',
  'sphere',
  'floor',
  'wall',
  'solid',
  'opening',
]);
const materials = new Set([
  'paint',
  'wood',
  'fabric',
  'stone',
  'metal',
  'glass',
  'light',
]);
const roles = new Set(['wood', 'fabric', 'stone', 'wall', 'accent']);
function fail(message: string): never {
  throw new Error(`Файл проекта: ${message}`);
}
function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    fail('ожидался объект.');
  const obj = value as Record<string, unknown>;
  if (
    Object.keys(obj).some((key) =>
      ['__proto__', 'constructor', 'prototype'].includes(key),
    )
  )
    fail('недопустимое поле.');
  return obj;
}
function number(value: unknown, min: number, max: number) {
  if (
    typeof value !== 'number' ||
    !Number.isFinite(value) ||
    value < min ||
    value > max
  )
    fail(`число вне диапазона ${min}…${max}.`);
  return value === 0 ? 0 : value;
}
function text(value: unknown, max = 100) {
  if (typeof value !== 'string' || !value.trim() || value.length > max)
    fail('неверное название или идентификатор.');
  return value;
}
function bool(value: unknown) {
  if (typeof value !== 'boolean') fail('неверное логическое значение.');
  return value;
}
function vec(value: unknown, min: number, max: number): Vec3 {
  if (!Array.isArray(value) || value.length !== 3)
    fail('ожидались три координаты.');
  return value.map((item) => number(item, min, max)) as Vec3;
}
function polygon(value: unknown): Point[] {
  if (!Array.isArray(value) || value.length < 3 || value.length > 200)
    fail('контур должен содержать 3–200 точек.');
  return value.map((point) => {
    if (!Array.isArray(point) || point.length !== 2)
      fail('неверная точка контура.');
    return [number(point[0], -100, 100), number(point[1], -100, 100)];
  });
}
function parseFinish(value: unknown): Finish {
  const f = record(value);
  if (!['paint', 'oak', 'tile', 'fabric', 'stone'].includes(f.kind as string))
    fail('неизвестная отделка.');
  const color = (v: unknown) => {
    if (typeof v !== 'string' || !/^#[\da-f]{6}$/i.test(v))
      fail('неверный цвет отделки.');
    return v;
  };
  return {
    kind: f.kind as Finish['kind'],
    color: color(f.color),
    angle: number(f.angle, -3600, 3600),
    width: number(f.width, 0.02, 10),
    height: number(f.height, 0.02, 10),
    joint: number(f.joint, 0, 0.03),
    jointColor: color(f.jointColor),
    roughness: number(f.roughness, 0, 1),
  };
}
function parseDesignView(v: Record<string, unknown>): Partial<EditorView> {
  const result: Partial<EditorView> = {};
  if (v.electrical !== undefined) result.electrical = bool(v.electrical);
  if (v.artificialLight !== undefined)
    result.artificialLight = bool(v.artificialLight);
  if (v.snapping !== undefined) {
    const a = record(v.snapping);
    result.snapping = {
      enabled: bool(a.enabled),
      grid: bool(a.grid),
      objects: bool(a.objects),
      step: number(a.step, 0.001, 1),
      gap: number(a.gap, 0, 2),
    };
  }
  if (v.walk !== undefined) {
    const a = record(v.walk);
    result.walk = {
      enabled: bool(a.enabled),
      eyeHeight: number(a.eyeHeight, 0.6, 2.2),
      speed: number(a.speed, 0.2, 4),
    };
  }
  if (v.sunlight !== undefined) {
    const a = record(v.sunlight);
    if (a.mode !== 'location' && a.mode !== 'manual')
      fail('неверный режим солнца.');
    if (
      typeof a.date !== 'string' ||
      !/^20\d{2}-\d{2}-\d{2}$/.test(a.date) ||
      !Number.isFinite(Date.parse(a.date)) ||
      new Date(a.date).toISOString().slice(0, 10) !== a.date
    )
      fail('неверная дата солнца.');
    result.sunlight = {
      enabled: bool(a.enabled),
      mode: a.mode,
      city: text(a.city),
      latitude: number(a.latitude, -89.9, 89.9),
      longitude: number(a.longitude, -180, 180),
      utcOffset: number(a.utcOffset, -14, 14),
      north: number(a.north, -360, 360),
      date: a.date,
      minutes: number(a.minutes, 0, 1439),
      azimuth: number(a.azimuth, 0, 360),
      elevation: number(a.elevation, -90, 90),
    };
  }
  return result;
}
function parseObjects(value: unknown): SceneNode[] {
  const ids = new Set<string>();
  let count = 0,
    fixtureCount = 0;
  function walk(value: unknown, depth = 0, parentKind?: NodeKind): SceneNode[] {
    if (!Array.isArray(value) || depth > 10)
      fail('слишком глубокая иерархия объектов.');
    return value.map((input) => {
      if (++count > 2500) fail('максимум 2500 объектов в одной расстановке.');
      const obj = record(input),
        id = text(obj.id, 150);
      if (ids.has(id)) fail('повторяющийся идентификатор объекта.');
      ids.add(id);
      const g = record(obj.geometry);
      if (!shapes.has(g.kind as string)) fail('неизвестная форма.');
      const kind = g.kind as NodeKind;
      if (kind === 'opening' && parentKind !== 'wall')
        fail('проём должен находиться внутри стены.');
      const geometry: Geometry = { kind, size: vec(g.size, 0.001, 200) };
      if (kind === 'wall' && g.wallProfile !== undefined) {
        geometry.wallProfile = polygon(g.wallProfile);
        validateContours(geometry.wallProfile);
      }
      if (g.radius !== undefined) geometry.radius = number(g.radius, 0, 20);
      if (g.topRadius !== undefined)
        geometry.topRadius = number(g.topRadius, 0, 1);
      if (g.bottomRadius !== undefined)
        geometry.bottomRadius = number(g.bottomRadius, 0, 1);
      if (['floor', 'solid'].includes(kind)) {
        if (g.labelAnchor !== undefined) {
          if (!Array.isArray(g.labelAnchor) || g.labelAnchor.length !== 2)
            fail('неверная точка подписи.');
          geometry.labelAnchor = g.labelAnchor.map((n) =>
            number(n, -200, 200),
          ) as Point;
        }
        geometry.polygon = polygon(g.polygon);
        if (!Array.isArray(g.holes) || g.holes.length > 30)
          fail('неверные отверстия контура.');
        geometry.holes = g.holes.map(polygon);
        validateContours(geometry.polygon, geometry.holes);
      }
      if (kind === 'opening') {
        if (g.openingType !== 'door' && g.openingType !== 'window')
          fail('неверный тип проёма.');
        geometry.openingType = g.openingType;
        if (g.doorSwing !== undefined) {
          const swing = record(g.doorSwing);
          if (
            !['start', 'end', 'both'].includes(swing.hinge as string) ||
            (swing.side !== -1 && swing.side !== 1)
          )
            fail('неверное открывание двери.');
          geometry.doorSwing = {
            hinge: swing.hinge as 'start' | 'end' | 'both',
            side: swing.side as -1 | 1,
            offset: number(swing.offset, -2, 2),
          };
        }
      }
      if (typeof obj.color !== 'string' || !/^#[\da-f]{6}$/i.test(obj.color))
        fail('цвет должен быть в формате #RRGGBB.');
      if (!materials.has(obj.material as string)) fail('неизвестный материал.');
      if (obj.category !== 'structure' && obj.category !== 'furniture')
        fail('неизвестная категория.');
      if (obj.role !== undefined && !roles.has(obj.role as string))
        fail('неверная роль материала.');
      const node: SceneNode = {
        id,
        name: text(obj.name),
        category: obj.category,
        position: vec(obj.position, -200, 200),
        rotation: vec(obj.rotation, -3600, 3600),
        scale: vec(obj.scale, 0.001, 200),
        geometry,
        color: obj.color,
        material: obj.material as MaterialKind,
        visible: bool(obj.visible),
        locked: bool(obj.locked),
        cutaway: bool(obj.cutaway),
        children: walk(obj.children, depth + 1, kind),
      };
      if (
        kind === 'opening' &&
        (Math.abs(node.position[2]) > 1e-8 ||
          node.rotation.some((n) => Math.abs(n) > 1e-8))
      )
        fail('проём должен оставаться в плоскости стены.');
      if (
        kind === 'cylinder' &&
        geometry.topRadius === 0 &&
        geometry.bottomRadius === 0
      )
        fail('цилиндр не может иметь два нулевых радиуса.');
      if (obj.role !== undefined) node.role = obj.role as StyleRole;
      if (obj.assembly !== undefined) {
        node.assembly = bool(obj.assembly);
        if (
          node.assembly &&
          (kind !== 'group' || node.category !== 'furniture')
        )
          fail('группа должна содержать мебель.');
      }
      if (obj.electrical !== undefined) {
        const e = record(obj.electrical);
        if (
          !['socket', 'switch', 'data', 'appliance', 'light'].includes(
            e.kind as string,
          ) ||
          ['wall', 'floor', 'opening'].includes(kind)
        )
          fail('неверная электрическая точка.');
        if (!Array.isArray(e.controls) || e.controls.length > 32)
          fail('максимум 32 управляемых группы.');
        node.electrical = {
          kind: e.kind as ElectricalPoint['kind'],
          group: text(e.group),
          controls: [...new Set(e.controls.map((v) => text(v)))],
        };
        if (e.kind === 'light') {
          if (++fixtureCount > 32)
            fail('максимум 32 управляемых светильника в расстановке.');
          const f = record(e.fixture);
          if (f.type !== 'point' && f.type !== 'spot')
            fail('неизвестный тип светильника.');
          const offset = vec(f.offset, -10, 10),
            target = vec(f.target, -10, 10);
          if (Math.hypot(...offset.map((v, i) => v - target[i])) < 0.01)
            fail('светильнику нужно направление.');
          node.electrical.fixture = {
            type: f.type,
            lumens: number(f.lumens, 0, 20000),
            kelvin: number(f.kelvin, 2200, 6500),
            beam: number(f.beam, 10, 170),
            level: number(f.level, 0, 1),
            offset,
            target,
          };
        } else if (e.fixture !== undefined)
          fail('параметры света доступны только светильнику.');
      }
      if (obj.mechanism !== undefined) {
        const m = record(obj.mechanism);
        if (
          !['hinge', 'slide'].includes(m.kind as string) ||
          !['x', 'y', 'z'].includes(m.axis as string) ||
          ['wall', 'floor', 'opening'].includes(kind)
        )
          fail('неверный механизм подвижной детали.');
        const extent = number(
          m.extent,
          m.kind === 'hinge' ? -180 : -5,
          m.kind === 'hinge' ? 180 : 5,
        );
        if (Math.abs(extent) < (m.kind === 'hinge' ? 1 : 0.01))
          fail('ход механизма слишком мал.');
        node.mechanism = {
          kind: m.kind as Mechanism['kind'],
          axis: m.axis as Mechanism['axis'],
          pivot: vec(m.pivot, -20, 20),
          extent,
          progress: number(m.progress, 0, 1),
        };
      }
      if (obj.mechanismPreset !== undefined) {
        if (
          ![
            'door',
            'cabinet',
            'drawer',
            'fridge',
            'dishwasher',
            'oven',
            'sofa',
          ].includes(obj.mechanismPreset as string)
        )
          fail('неизвестная схема механизма.');
        node.mechanismPreset = obj.mechanismPreset as MechanismPreset;
      }
      if (obj.finish !== undefined) node.finish = parseFinish(obj.finish);
      if (obj.surfaces !== undefined) {
        if (kind !== 'wall') fail('стороны отделки доступны только стене.');
        const sides = record(obj.surfaces);
        node.surfaces = {};
        for (const key of Object.keys(sides)) {
          if (!['front', 'back', 'top', 'edge'].includes(key))
            fail('неизвестная сторона стены.');
          node.surfaces[key as WallFace] = parseFinish(sides[key]);
        }
      }
      if (obj.clearance !== undefined) {
        const c = record(obj.clearance);
        node.clearance = {
          front: number(c.front, 0, 5),
          back: number(c.back, 0, 5),
        };
      }
      if (kind === 'wall') {
        const openings = node.children
          .filter((n) => n.geometry.kind === 'opening' && n.visible)
          .sort((a, b) => a.position[0] - b.position[0]);
        let end = -geometry.size[0] / 2;
        for (const opening of openings) {
          const w = opening.geometry.size[0] * opening.scale[0],
            h = opening.geometry.size[1] * opening.scale[1],
            left = opening.position[0] - w / 2;
          if (
            left < end - 1e-6 ||
            left + w > geometry.size[0] / 2 + 1e-6 ||
            opening.position[1] < 0 ||
            opening.position[1] + h > geometry.size[1] + 1e-6
          )
            fail('проёмы пересекаются или выходят за стену.');
          if (opening.rotation.some((n) => Math.abs(n) > 1e-6))
            fail('поворот проёма задаётся поворотом стены.');
          end = left + w;
        }
      }
      return node;
    });
  }
  return walk(value);
}
function parseScene(input: unknown): Arrangement {
  const obj = record(input),
    objects = parseObjects(obj.objects),
    v = record(obj.view);
  if (v.mode !== '2d' && v.mode !== '3d') fail('неверный режим просмотра.');
  if (!['natural', 'warm', 'contrast'].includes(v.palette as string))
    fail('неверная палитра.');
  const selected = v.selected === null ? null : text(v.selected, 150);
  if (selected && !findNode(objects, selected))
    fail('выбранный объект отсутствует.');
  let camera: CameraState | null = null;
  let measurements: PlanMeasurement[] | undefined;
  if (obj.measurements !== undefined) {
    if (!Array.isArray(obj.measurements) || obj.measurements.length > 100)
      fail('максимум 100 размерных линий в расстановке.');
    const ids = new Set<string>();
    measurements = obj.measurements.map((input) => {
      const m = record(input),
        id = text(m.id, 150);
      if (ids.has(id)) fail('повторяющийся идентификатор размера.');
      ids.add(id);
      function point(value: unknown): Point {
        if (!Array.isArray(value) || value.length !== 2)
          fail('неверная точка размера.');
        return value.map((v) => number(v, -200, 200)) as Point;
      }
      const from = point(m.from),
        to = point(m.to);
      if (Math.hypot(to[0] - from[0], to[1] - from[1]) < 0.01)
        fail('длина размера должна быть не меньше 1 см.');
      return { id, from, to };
    });
  }
  if (v.camera !== null) {
    const c = record(v.camera);
    camera = {
      position: vec(c.position, -500, 500),
      target: vec(c.target, -200, 200),
    };
    if (
      Math.hypot(...camera.position.map((n, i) => n - camera!.target[i])) < 0.1
    )
      fail('камера совпадает с точкой наблюдения.');
  }
  return {
    objects,
    ...(obj.workplaceStudy === undefined
      ? {}
      : {
          workplaceStudy: (() => {
            const a = record(obj.workplaceStudy),
              shades = record(a.shades);
            const ids = (value: unknown, max: number) => {
              if (!Array.isArray(value) || value.length > max)
                fail(`максимум ${max} объектов в анализе солнца.`);
              const result = value.map((v) => text(v, 150));
              if (new Set(result).size !== result.length)
                fail('объект повторяется в анализе солнца.');
              return result;
            };
            if (!Array.isArray(a.targets) || a.targets.length > 8)
              fail('максимум 8 поверхностей для анализа солнца.');
            const seen = new Set<string>();
            const targets = a.targets.map((value) => {
              const t = record(value),
                id = text(t.id, 150);
              if (
                seen.has(id) ||
                !['top', 'front', 'back'].includes(t.face as string)
              )
                fail('неверная поверхность для анализа солнца.');
              seen.add(id);
              return { id, face: t.face as StudyFace };
            });
            const start = number(a.start, 0, 1439),
              end = number(a.end, 1, 1440);
            if (
              !Number.isInteger(start) ||
              !Number.isInteger(end) ||
              start >= end ||
              ![15, 30, 60].includes(a.step as number)
            )
              fail('неверный рабочий интервал или шаг расчёта.');
            return {
              targets,
              rotateIds: ids(a.rotateIds, 32),
              rotation: number(a.rotation, -180, 180),
              start,
              end,
              step: a.step as WorkplaceStudy['step'],
              ceilingHeight: number(a.ceilingHeight, 2, 6),
              shades: {
                windowIds: ids(shades.windowIds, 64),
                roller: number(shades.roller, 0, 1),
                slatWidth: number(shades.slatWidth, 0.01, 0.2),
                slatPitch: number(shades.slatPitch, 0.01, 0.2),
                slatAngle: number(shades.slatAngle, -90, 90),
              },
            };
          })(),
        }),
    ...(obj.estimate === undefined
      ? {}
      : {
          estimate: (() => {
            const e = record(obj.estimate);
            if (!Array.isArray(e.rates) || e.rates.length > 500)
              fail('максимум 500 расценок.');
            const keys = new Set<string>();
            const rates = e.rates.map((value) => {
              const r = record(value),
                key = text(r.key, 300);
              if (keys.has(key)) fail('повторяющаяся расценка.');
              keys.add(key);
              return {
                key,
                unit: text(r.unit, 20),
                price: number(r.price, 0, 1000000000),
                coverage: number(r.coverage, 0.0001, 100000),
                pack: number(r.pack, 0, 100000),
              };
            });
            return {
              currency: text(e.currency, 12),
              waste: number(e.waste, 0, 100),
              rates,
            };
          })(),
        }),
    ...(obj.lightingScenes === undefined
      ? {}
      : {
          lightingScenes: (() => {
            if (
              !Array.isArray(obj.lightingScenes) ||
              obj.lightingScenes.length > 20
            )
              fail('максимум 20 сценариев освещения.');
            const ids = new Set<string>();
            return obj.lightingScenes.map((value) => {
              const s = record(value),
                id = text(s.id, 150);
              if (ids.has(id)) fail('повторяющийся сценарий освещения.');
              ids.add(id);
              if (!Array.isArray(s.levels) || s.levels.length > 32)
                fail('максимум 32 светильника в сценарии.');
              const seen = new Set<string>();
              const levels = s.levels.map((v) => {
                const l = record(v),
                  id = text(l.id, 150);
                if (seen.has(id)) fail('светильник повторяется в сценарии.');
                seen.add(id);
                return { id, level: number(l.level, 0, 1) };
              });
              return { id, name: text(s.name), levels };
            });
          })(),
        }),
    ...(measurements === undefined ? {} : { measurements }),
    ...(obj.viewpoints === undefined
      ? {}
      : {
          viewpoints: (() => {
            if (!Array.isArray(obj.viewpoints) || obj.viewpoints.length > 30)
              fail('максимум 30 точек обзора.');
            const ids = new Set<string>();
            return obj.viewpoints.map((value) => {
              const p = record(value),
                id = text(p.id, 150),
                c = record(p.camera);
              if (ids.has(id)) fail('повторяющийся ракурс.');
              ids.add(id);
              const position = vec(c.position, -500, 500),
                target = vec(c.target, -200, 200);
              if (Math.hypot(...position.map((v, i) => v - target[i])) < 0.1)
                fail('ракурс не имеет направления.');
              return { id, name: text(p.name), camera: { position, target } };
            });
          })(),
        }),
    view: {
      mode: v.mode,
      planZoom: number(v.planZoom, 0.5, 3),
      planOffset:
        v.planOffset === undefined
          ? [0, 0]
          : (() => {
              if (!Array.isArray(v.planOffset) || v.planOffset.length !== 2)
                fail('неверное смещение плана.');
              return v.planOffset.map((n) => number(n, -200, 200)) as [
                number,
                number,
              ];
            })(),
      palette: v.palette as PaletteId,
      night: bool(v.night),
      cutaway: bool(v.cutaway),
      furniture: bool(v.furniture),
      labels: bool(v.labels),
      grid: bool(v.grid),
      camera,
      selected,
      ...parseDesignView(v),
    },
  };
}
/** Parse into a new whitelisted document before any state or storage mutation. */
export function validateProject(input: unknown): EditorProject {
  const obj = record(input);
  if (obj.format !== 'flatplan-project' || obj.version !== 1)
    fail('неподдерживаемый формат или версия.');
  if (!Array.isArray(obj.arrangements) || obj.arrangements.length > 30)
    fail('максимум 30 сохранённых вариантов.');
  const ids = new Set<string>();
  const arrangements = obj.arrangements.map((input) => {
    const item = record(input),
      id = text(item.id, 150);
    if (ids.has(id)) fail('повторяющийся вариант.');
    ids.add(id);
    return { id, name: text(item.name), scene: parseScene(item.scene) };
  });
  const active =
    obj.activeArrangement === null ? null : text(obj.activeArrangement, 150);
  if (active && !ids.has(active)) fail('активный вариант отсутствует.');
  return {
    format: 'flatplan-project',
    version: 1,
    name: text(obj.name),
    scene: parseScene(obj.scene),
    arrangements,
    activeArrangement: active,
    ...(obj.sourceRevision === undefined
      ? {}
      : { sourceRevision: text(obj.sourceRevision) }),
  };
}
export function importProject(source: string): EditorProject {
  if (new TextEncoder().encode(source).length > MAX_FILE_BYTES)
    throw new Error('Файл слишком большой: максимум 8 МБ.');
  let input: unknown;
  try {
    input = JSON.parse(source);
  } catch {
    throw new Error(
      'Не удалось прочитать JSON. Выберите файл, экспортированный из FlatPlan.',
    );
  }
  return validateProject(input);
}
export function exportProject(project: EditorProject) {
  const data = JSON.stringify(validateProject(project), null, 2);
  if (new TextEncoder().encode(data).length > MAX_FILE_BYTES)
    throw new Error('Проект больше 8 МБ: удалите лишние сохранённые варианты.');
  return data;
}
export interface StoragePort {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}
export function readStoredProject(storage: StoragePort): EditorProject | null {
  const source = storage.getItem(STORAGE_KEY);
  return source === null ? null : importProject(source);
}
export function persistProject(storage: StoragePort, project: EditorProject) {
  storage.setItem(STORAGE_KEY, exportProject(project));
}
export function clearStoredProject(storage: Pick<Storage, 'removeItem'>) {
  storage.removeItem(STORAGE_KEY);
  storage.removeItem(ROOM_WORKSPACE_STORAGE_KEY);
}
export interface History {
  past: EditorProject[];
  present: EditorProject;
  future: EditorProject[];
}
export function pushHistory(history: History, project: EditorProject): History {
  return {
    past: [...history.past.slice(-29), history.present],
    present: project,
    future: [],
  };
}
export function undoHistory(history: History): History {
  if (!history.past.length) return history;
  return {
    past: history.past.slice(0, -1),
    present: history.past.at(-1)!,
    future: [history.present, ...history.future],
  };
}
export function redoHistory(history: History): History {
  if (!history.future.length) return history;
  return {
    past: [...history.past, history.present],
    present: history.future[0],
    future: history.future.slice(1),
  };
}
