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
}
export interface Arrangement {
  objects: SceneNode[];
  view: EditorView;
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
    if (material) part.material = material;
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
function parseObjects(value: unknown): SceneNode[] {
  const ids = new Set<string>();
  let count = 0;
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
