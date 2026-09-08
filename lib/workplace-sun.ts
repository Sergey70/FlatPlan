import { analyzePlan, analysisFootprints } from './plan-analysis.ts';
import {
  Matrix3,
  Matrix4,
  Vector3,
  Mesh,
  MeshBasicMaterial,
  DoubleSide,
  Raycaster,
  type BufferGeometry,
} from 'three';
import {
  clone,
  type Arrangement,
  type SceneNode,
  type Vec3,
} from './editor-model.ts';
import { baseNode } from './editor-seed.ts';
import {
  nodeMatrix,
  createNodeGeometry,
  wallBlocks,
  wallBlockGeometry,
  sceneBounds,
} from './editor-geometry.ts';
import { measuredRooms, roomContains } from './room-surfaces.ts';
import { sunDirection } from './sunlight.ts';
import {
  defaultStudy,
  type WorkplaceStudy,
  type StudyTarget,
  type StudyShades,
} from './renovation-types.ts';
import { defaultSun, type SunSettings } from './design-types.ts';

export const STUDY_GRID = 5;
export const studyScenarios = [
  { id: 'current', name: 'Текущая расстановка' },
  { id: 'turned', name: 'Поворот рабочего места' },
  { id: 'roller', name: 'Текущая + рулонная штора' },
  { id: 'blinds', name: 'Текущая + жалюзи' },
] as const;
export type StudyScenario = (typeof studyScenarios)[number]['id'];
interface Entry {
  node: SceneNode;
  matrix: Matrix4;
  rootId: string;
  name: string;
}
function entries(nodes: SceneNode[]) {
  const result: Entry[] = [];
  const visit = (
    node: SceneNode,
    parent: Matrix4,
    rootId: string,
    path: string,
  ) => {
    if (!node.visible) return;
    const matrix = parent.clone().multiply(nodeMatrix(node)),
      name = path ? `${path} / ${node.name}` : node.name;
    result.push({ node, matrix, rootId, name });
    node.children.forEach((n) => visit(n, matrix, rootId, name));
  };
  nodes.forEach((n) => visit(n, new Matrix4(), n.id, ''));
  return result;
}
export function studyCandidates(nodes: SceneNode[]) {
  return entries(nodes).filter(
    (e) => e.node.category === 'furniture' && e.node.geometry.kind === 'box',
  );
}
export function studyWindows(nodes: SceneNode[]) {
  return entries(nodes).filter(
    (e) =>
      e.node.geometry.kind === 'opening' &&
      e.node.geometry.openingType === 'window',
  );
}
/** Suggestions are local UI defaults until the user saves settings or starts a study. */
export function suggestedStudy(nodes: SceneNode[]): WorkplaceStudy {
  const s = defaultStudy(),
    candidates = studyCandidates(nodes);
  const desk = candidates.find(
    (e) => /столешница/i.test(e.node.name) && /рабоч|письменн/i.test(e.name),
  );
  if (desk) s.targets.push({ id: desk.node.id, face: 'top' });
  for (const screen of candidates
    .filter(
      (e) =>
        e.node.name.toLowerCase().startsWith('экран') &&
        /монитор/i.test(e.name),
    )
    .slice(0, 2))
    s.targets.push({ id: screen.node.id, face: 'front' });
  s.rotateIds = [
    ...new Set(
      s.targets.map((t) => candidates.find((e) => e.node.id === t.id)!.rootId),
    ),
  ];
  s.shades.windowIds = studyWindows(nodes)
    .slice(0, 64)
    .map((e) => e.node.id);
  return s;
}
/** Wrap only the chosen roots in a temporary rotation. No TRS decomposition or saved-node edits. */
export function rotatedStudyScene(
  scene: Arrangement,
  settings: WorkplaceStudy,
): Arrangement {
  const next = clone(scene),
    ids = new Set(settings.rotateIds);
  const selected = next.objects.filter((n) => ids.has(n.id));
  if (
    !selected.length ||
    selected.length !== ids.size ||
    selected.some((n) => n.category !== 'furniture')
  )
    throw new Error('Выберите целые предметы мебели для сравнения поворота.');
  const centre = sceneBounds(selected).getCenter(new Vector3());
  const all = new Set(entries(next.objects).map((e) => e.node.id));
  let id = 'sun-study-rotation';
  while (all.has(id)) id += '-copy';
  const group = baseNode(id, 'Поворот для анализа', {
    kind: 'group',
    size: [1, 1, 1],
  });
  group.position = [centre.x, 0, centre.z];
  group.rotation[1] = settings.rotation;
  group.children = selected.map((n) => ({
    ...n,
    position: [
      n.position[0] - centre.x,
      n.position[1],
      n.position[2] - centre.z,
    ],
  }));
  next.objects = [...next.objects.filter((n) => !ids.has(n.id)), group];
  return next;
}
export interface SurfacePoint {
  position: Vec3;
  normal: Vec3;
  cell: number;
}
export interface StudySurface {
  id: string;
  name: string;
  face: StudyTarget['face'];
  points: SurfacePoint[];
}
function sampleSurface(entry: Entry, target: StudyTarget): StudySurface {
  const g = createNodeGeometry(entry.node)!;
  g.computeBoundingBox();
  const b = g.boundingBox!,
    material = new MeshBasicMaterial({ side: DoubleSide }),
    mesh = new Mesh(g, material);
  const axis = target.face === 'top' ? 'y' : 'z',
    v = target.face === 'top' ? 'z' : 'y',
    sign = target.face === 'back' ? -1 : 1;
  const normalMatrix = new Matrix3().getNormalMatrix(entry.matrix),
    ray = new Raycaster();
  const points: SurfacePoint[] = [];
  try {
    for (let row = 0; row < STUDY_GRID; row++)
      for (let col = 0; col < STUDY_GRID; col++) {
        const origin = new Vector3();
        origin.x = b.min.x + ((b.max.x - b.min.x) * (col + 0.5)) / STUDY_GRID;
        origin[v] =
          b.max[v] - ((b.max[v] - b.min[v]) * (row + 0.5)) / STUDY_GRID;
        origin[axis] = sign > 0 ? b.max[axis] + 1 : b.min[axis] - 1;
        const direction = new Vector3();
        direction[axis] = -sign;
        ray.set(origin, direction);
        const hit = ray.intersectObject(mesh, false)[0];
        if (hit?.face)
          points.push({
            position: hit.point.applyMatrix4(entry.matrix).toArray(),
            normal: hit.face.normal
              .clone()
              .applyMatrix3(normalMatrix)
              .normalize()
              .toArray(),
            cell: row * STUDY_GRID + col,
          });
      }
  } finally {
    g.dispose();
    material.dispose();
  }
  if (!points.length)
    throw new Error(`Не удалось определить поверхность: ${entry.name}`);
  return {
    id: entry.node.id,
    name: entry.name,
    face: target.face,
    points,
  };
}
export interface WindowHit {
  id: string;
  position: Vec3;
  local: Vec3;
  direction: Vec3;
  height: number;
  distance: number;
}
export interface SunWorld {
  surfaces: StudySurface[];
  trace: (point: SurfacePoint, direction: Vec3) => WindowHit[] | null;
  dispose: () => void;
}
export function createSunWorld(
  scene: Arrangement,
  settings: WorkplaceStudy,
): SunWorld {
  const visible = entries(scene.objects),
    meshes: Mesh[] = [],
    material = new MeshBasicMaterial({ side: DoubleSide });
  const windows = visible
    .filter(
      (e) =>
        e.node.geometry.kind === 'opening' &&
        e.node.geometry.openingType === 'window',
    )
    .map((e) => ({ ...e, inverse: e.matrix.clone().invert() }));
  const dispose = () => {
    meshes.forEach((m) => m.geometry.dispose());
    material.dispose();
  };
  const add = (geometry: BufferGeometry, matrix: Matrix4) => {
    const mesh = new Mesh(geometry, material);
    mesh.matrixAutoUpdate = false;
    mesh.matrix.copy(matrix);
    mesh.updateMatrixWorld(true);
    meshes.push(mesh);
  };
  try {
    const surfaces = settings.targets.map((t) => {
      const entry = visible.find(
        (e) =>
          e.node.id === t.id &&
          e.node.category === 'furniture' &&
          e.node.geometry.kind === 'box',
      );
      if (!entry)
        throw new Error(
          'Выбранная поверхность удалена, скрыта или не является деталью мебели. Выберите её заново.',
        );
      return sampleSurface(entry, t);
    });
    if (!surfaces.length)
      throw new Error('Выберите столешницу или экран для анализа.');
    if (!windows.length)
      throw new Error(
        'В сцене нет видимых оконных проёмов для анализа солнца.',
      );
    for (const { node, matrix } of visible) {
      if (
        node.material === 'glass' &&
        !node.finish &&
        !Object.keys(node.surfaces ?? {}).length
      )
        continue;
      if (node.geometry.kind === 'wall') {
        for (const block of wallBlocks(node))
          add(
            wallBlockGeometry(block),
            matrix
              .clone()
              .multiply(new Matrix4().makeTranslation(...block.position)),
          );
      } else {
        const geometry = createNodeGeometry(node);
        if (geometry) add(geometry, matrix);
      }
    }
    // Study roof: horizontal room contours, a user-supplied clear height above each floor.
    const rooms = measuredRooms(scene.objects);
    if (!rooms.length)
      throw new Error(
        'Добавьте видимый контур пола: он нужен для потолка в анализе солнца.',
      );
    for (const room of rooms) {
      const ceiling = baseNode(
        'study-ceiling',
        'Потолок анализа',
        {
          kind: 'floor',
          size: [1, 0.08, 1],
          polygon: room.polygon,
          holes: room.holes,
        },
        'structure',
      );
      add(
        createNodeGeometry(ceiling)!,
        new Matrix4().makeTranslation(
          0,
          room.elevation + settings.ceilingHeight,
          0,
        ),
      );
    }
    const ray = new Raycaster(undefined, undefined, 0, 1000);
    return {
      surfaces,
      dispose,
      trace: (point, direction) => {
        const dir = new Vector3(...direction).normalize();
        if (dir.y <= 0 || dir.dot(new Vector3(...point.normal)) <= 1e-8)
          return null;
        const origin = new Vector3(...point.position).addScaledVector(
          new Vector3(...point.normal),
          0.0001,
        );
        const hits: WindowHit[] = [];
        for (const window of windows) {
          const local = origin.clone().applyMatrix4(window.inverse),
            delta = origin
              .clone()
              .add(dir)
              .applyMatrix4(window.inverse)
              .sub(local);
          if (Math.abs(delta.z) < 1e-10) continue;
          const t = -local.z / delta.z;
          if (t <= 0 || t > 1000) continue;
          const p = local.clone().addScaledVector(delta, t),
            [w, h] = window.node.geometry.size;
          if (Math.abs(p.x) <= w / 2 && p.y >= 0 && p.y <= h)
            hits.push({
              id: window.node.id,
              local: p.toArray(),
              direction: delta.toArray(),
              height: h,
              position: origin.clone().addScaledVector(dir, t).toArray(),
              distance: t,
            });
        }
        if (!hits.length) return null; // An open door, absent facade or roof is not a daylight window.
        ray.set(origin, dir);
        for (const mesh of meshes)
          if (ray.intersectObject(mesh, false).length) return null;
        return hits.sort((a, b) => a.distance - b.distance);
      },
    };
  } catch (e) {
    dispose();
    throw e;
  }
}
/** Ideal opaque roller or zero-thickness horizontal slats in opening-local coordinates. */
export function shadeBlocks(
  hit: WindowHit,
  kind: 'roller' | 'blinds',
  s: StudyShades,
) {
  if (!s.windowIds.includes(hit.id)) return false;
  const y = hit.local[1],
    h = hit.height;
  if (kind === 'roller') return s.roller > 0 && y >= h * (1 - s.roller) - 1e-9;
  const angle = (s.slatAngle * Math.PI) / 180,
    slope = hit.direction[1] / hit.direction[2];
  const half =
    (s.slatWidth / 2) * Math.abs(Math.sin(angle) - slope * Math.cos(angle));
  // Finite slats start half a pitch below the top; no imaginary slats above/below the opening.
  const count = Math.floor(h / s.slatPitch + 0.5);
  const k = Math.max(
    0,
    Math.min(count - 1, Math.round((h - y) / s.slatPitch - 0.5)),
  );
  const centre = h - (k + 0.5) * s.slatPitch;
  return centre >= 0 && Math.abs(y - centre) <= half + 1e-9;
}
export interface StudyFrame {
  from: number;
  to: number;
  minutes: number;
  elevation: number;
  azimuth: number;
  direction: Vec3;
  lit: Record<StudyScenario, boolean[][]>;
}
export interface StudyReport {
  settings: WorkplaceStudy;
  sun: SunSettings;
  surfaces: Record<StudyScenario, StudySurface[]>;
  frames: StudyFrame[];
  turningWarnings: string[];
}
export function studyTimes(s: Pick<WorkplaceStudy, 'start' | 'end' | 'step'>) {
  const result = [];
  for (let from = s.start; from < s.end; from += s.step) {
    const to = Math.min(from + s.step, s.end);
    result.push({ from, to, minutes: (from + to) / 2 });
  }
  return result;
}
export const studySun = (scene: Arrangement): SunSettings => ({
  ...(scene.view.sunlight ?? defaultSun),
  mode: 'location',
});
export const studyKey = (scene: Arrangement, settings: WorkplaceStudy) =>
  JSON.stringify([scene.objects, settings, studySun(scene)]);
const abort = (signal?: AbortSignal) => {
  if (signal?.aborted) throw new DOMException('Расчёт отменён.', 'AbortError');
};
export async function runWorkplaceStudy(
  scene: Arrangement,
  settings: WorkplaceStudy,
  signal?: AbortSignal,
  progress?: (percent: number) => void,
): Promise<StudyReport> {
  const worlds: SunWorld[] = [];
  try {
    abort(signal);
    const current = createSunWorld(scene, settings);
    worlds.push(current);
    const rotated = rotatedStudyScene(scene, settings);
    const turned = createSunWorld(rotated, settings);
    worlds.push(turned);
    const sun = studySun(scene),
      times = studyTimes(settings);
    const report: StudyReport = {
      settings: clone(settings),
      sun,
      surfaces: {
        current: current.surfaces,
        turned: turned.surfaces,
        roller: current.surfaces,
        blinds: current.surfaces,
      },
      frames: [],
      turningWarnings: (() => {
        const rootId = rotated.objects.at(-1)!.id;
        const shapes = analysisFootprints(rotated.objects),
          rooms = measuredRooms(rotated.objects);
        const contacts = analyzePlan(shapes).filter(
          (i) =>
            i.ids.includes(rootId) && ['collision', 'door'].includes(i.kind),
        );
        const outside = shapes
          .filter((s) => s.owner === rootId && s.kind === 'furniture')
          .some((s) =>
            s.points.some((p) => !rooms.some((r) => roomContains(r, p))),
          );
        return [
          ...(contacts.length
            ? [
                `После поворота найдены пересечения с мебелью, стенами или зонами дверей: ${contacts.length}. Такой поворот требует корректировки расстановки.`,
              ]
            : []),
          ...(outside
            ? [
                'Часть повёрнутой мебели выходит за контуры помещений. Этот сценарий нельзя оценивать только по количеству прямого солнца.',
              ]
            : []),
        ];
      })(),
    };
    for (const [index, time] of times.entries()) {
      abort(signal);
      const position = sunDirection({ ...sun, minutes: time.minutes });
      const hits = current.surfaces.map((s) =>
        s.points.map((p) => current.trace(p, position.direction)),
      );
      const lit: StudyFrame['lit'] = {
        current: hits.map((h) => h.map(Boolean)),
        roller: hits.map((h) =>
          h.map(
            (w) =>
              !!w &&
              !w.some((hit) => shadeBlocks(hit, 'roller', settings.shades)),
          ),
        ),
        blinds: hits.map((h) =>
          h.map(
            (w) =>
              !!w &&
              !w.some((hit) => shadeBlocks(hit, 'blinds', settings.shades)),
          ),
        ),
        turned: turned.surfaces.map((s) =>
          s.points.map((p) => !!turned.trace(p, position.direction)),
        ),
      };
      report.frames.push({ ...time, ...position, lit });
      progress?.(Math.round(((index + 1) / times.length) * 100));
      // Bound main-thread work to one time sample; allow UI updates, cancellation and unmount.
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    }
    abort(signal);
    return report;
  } finally {
    worlds.forEach((w) => w.dispose());
  }
}
export function studyTotals(
  report: StudyReport,
  scenario: StudyScenario,
  target: number,
) {
  let minutes = 0,
    weighted = 0,
    peak = 0;
  for (const f of report.frames) {
    const mask = f.lit[scenario][target],
      fraction = mask.filter(Boolean).length / mask.length,
      duration = f.to - f.from;
    if (fraction > 0) minutes += duration;
    weighted += fraction * duration;
    peak = Math.max(peak, fraction);
  }
  return {
    minutes,
    fraction: weighted / (report.settings.end - report.settings.start),
    peak,
  };
}
export const studyTime = (minutes: number) =>
  `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(Math.floor(minutes % 60)).padStart(2, '0')}`;
