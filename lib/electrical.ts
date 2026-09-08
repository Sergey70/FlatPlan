import { Color, Vector3 } from 'three';
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
import { nodeWorldMatrix } from './editor-geometry.ts';
import { assertOperable } from './mechanisms.ts';
import {
  defaultLight,
  electricalKinds,
  type ElectricalKind,
  type LightingScene,
} from './renovation-types.ts';

export function electricalNodes(
  nodes: SceneNode[],
  visibleOnly = false,
): SceneNode[] {
  const out: SceneNode[] = [];
  const visit = (node: SceneNode, visible: boolean) => {
    visible &&= node.visible;
    if (node.electrical && (!visibleOnly || visible)) out.push(node);
    node.children.forEach((n) => visit(n, visible));
  };
  nodes.forEach((n) => visit(n, true));
  return out;
}
export function electricalPosition(nodes: SceneNode[], id: string): Vec3 {
  const matrix = nodeWorldMatrix(nodes, id);
  if (!matrix) throw new Error('Точка не найдена.');
  return new Vector3().applyMatrix4(matrix).toArray();
}
export function setElectricalPosition(
  project: EditorProject,
  id: string,
  position: Vec3,
) {
  const next = clone(project);
  assertOperable(next.scene.objects, id);
  const node = findNode(next.scene.objects, id)!;
  if (!node.electrical) throw new Error('Выберите электрическую точку.');
  const parent = findParent(next.scene.objects, id);
  node.position = parent
    ? new Vector3(...position)
        .applyMatrix4(nodeWorldMatrix(next.scene.objects, parent.id)!.invert())
        .toArray()
    : [...position];
  return validateProject(next);
}
export function createElectricalPoint(
  kind: ElectricalKind,
  position: Vec3,
  group = 'Общая',
): SceneNode {
  const info = electricalKinds.find((k) => k.id === kind);
  if (!info) throw new Error('Неизвестный вид точки.');
  const node = baseNode(newId('electrical'), info.name, {
    kind: 'group',
    size: kind === 'light' ? [0.12, 0.06, 0.12] : [0.08, 0.08, 0.02],
  });
  node.position = [...position];
  node.electrical = { kind, group, controls: [] };
  node.color = '#f5f2e9';
  const add = (
    name: string,
    size: Vec3,
    position: Vec3,
    color: string,
    light = false,
  ) => {
    const part = baseNode(newId('electrical-part'), name, {
      kind: kind === 'light' ? 'cylinder' : 'box',
      size,
      radius: 0.004,
    });
    part.position = position;
    part.color = color;
    part.material = light ? 'light' : 'paint';
    node.children.push(part);
  };
  if (kind === 'light') {
    node.electrical.fixture = defaultLight();
    add('Корпус светильника', [0.12, 0.05, 0.12], [0, 0.025, 0], '#f5f2e9');
    add('Рассеиватель', [0.1, 0.003, 0.1], [0, -0.003, 0], '#ffe5bd', true);
  } else {
    add('Рамка точки', [0.08, 0.08, 0.016], [0, 0, 0], '#f5f2e9');
    add(
      'Центр точки',
      [0.046, 0.046, 0.005],
      [0, 0, 0.01],
      kind === 'switch' ? '#d5d9d5' : '#46595e',
    );
  }
  return node;
}
export function addElectricalPoint(
  project: EditorProject,
  kind: ElectricalKind,
  position: Vec3,
  group: string,
) {
  const next = clone(project),
    node = createElectricalPoint(kind, position, group);
  next.scene.objects.push(node);
  next.scene.view.selected = node.id;
  next.scene.view.electrical = true;
  if (kind === 'light') next.scene.view.artificialLight = true;
  return validateProject(next);
}
export function controlExistingLight(
  project: EditorProject,
  id: string,
  group: string,
) {
  const next = clone(project);
  assertOperable(next.scene.objects, id);
  const node = findNode(next.scene.objects, id)!;
  if (!flattenNodes([node]).some((n) => n.node.material === 'light'))
    throw new Error('У предмета нет светящейся детали.');
  node.electrical = {
    kind: 'light',
    group,
    controls: [],
    fixture: defaultLight(),
  };
  next.scene.view.artificialLight = true;
  return validateProject(next);
}
export function setLightGroup(
  project: EditorProject,
  group: string,
  level: number,
) {
  const next = clone(project);
  const members = electricalNodes(next.scene.objects).filter(
    (n) => n.electrical!.group === group && n.electrical!.fixture,
  );
  if (!members.length) throw new Error('В группе пока нет светильников.');
  for (const n of members) {
    assertOperable(next.scene.objects, n.id);
    n.electrical!.fixture!.level = level;
  }
  next.scene.view.artificialLight = true;
  return validateProject(next);
}
export function toggleElectricalSwitch(
  project: EditorProject,
  id: string,
  enabled: boolean,
) {
  const point = findNode(project.scene.objects, id);
  if (point?.electrical?.kind !== 'switch')
    throw new Error('Выберите выключатель.');
  const next = clone(project);
  assertOperable(next.scene.objects, id);
  const targets = electricalNodes(next.scene.objects).filter(
    (n) =>
      n.electrical!.fixture &&
      point.electrical!.controls.includes(n.electrical!.group),
  );
  if (!targets.length)
    throw new Error('Выключателю не назначена группа со светильниками.');
  for (const n of targets) {
    assertOperable(next.scene.objects, n.id);
    n.electrical!.fixture!.level = enabled ? 1 : 0;
  }
  next.scene.view.artificialLight = true;
  return validateProject(next);
}
export function captureLightingScene(project: EditorProject, name: string) {
  const next = clone(project),
    scene: LightingScene = {
      id: newId('lighting'),
      name: name.trim(),
      levels: electricalNodes(next.scene.objects)
        .filter((n) => n.electrical!.fixture)
        .map((n) => ({ id: n.id, level: n.electrical!.fixture!.level })),
    };
  if (!scene.levels.length) throw new Error('Добавьте управляемый светильник.');
  next.scene.lightingScenes = [...(next.scene.lightingScenes ?? []), scene];
  return validateProject(next);
}
export function applyLightingScene(project: EditorProject, id: string) {
  const next = clone(project),
    scene = next.scene.lightingScenes?.find((s) => s.id === id);
  if (!scene) throw new Error('Сценарий не найден.');
  const levels = new Map(scene.levels.map((l) => [l.id, l.level]));
  for (const n of electricalNodes(next.scene.objects).filter(
    (n) => n.electrical!.fixture,
  )) {
    assertOperable(next.scene.objects, n.id);
    n.electrical!.fixture!.level = levels.get(n.id) ?? 0;
  }
  next.scene.view = {
    ...next.scene.view,
    artificialLight: true,
    night: true,
    cutaway: false,
    labels: false,
    mode: '3d',
    ...(next.scene.view.sunlight
      ? { sunlight: { ...next.scene.view.sunlight, enabled: false } }
      : {}),
  };
  return validateProject(next);
}
export function addLightingPresets(project: EditorProject) {
  const next = clone(project),
    fixtures = electricalNodes(next.scene.objects).filter(
      (n) => n.electrical!.fixture,
    );
  if (!fixtures.length)
    throw new Error('Добавьте управляемые светильники и укажите их группы.');
  const names = ['Работа', 'Готовка', 'Вечер', 'Ночь'];
  next.scene.lightingScenes ??= [];
  for (const [index, name] of names.entries()) {
    if (next.scene.lightingScenes.some((s) => s.name === name)) continue;
    const levels = fixtures.map((n) => {
      const group = `${n.electrical!.group} ${n.name}`;
      const level =
        index === 0
          ? /рабоч|стол|кабинет/i.test(group)
            ? 1
            : 0.35
          : index === 1
            ? /кух|готов/i.test(group)
              ? 1
              : 0.3
            : index === 2
              ? 0.3
              : /коридор|прихож|ноч/i.test(group)
                ? 0.08
                : 0;
      return { id: n.id, level };
    });
    next.scene.lightingScenes.push({ id: newId('lighting'), name, levels });
  }
  return validateProject(next);
}
/** Interpolated display whitepoints, not a measured spectrum or a colour-matching model. */
export function kelvinColor(kelvin: number) {
  const anchors: [number, string][] = [
    [2200, '#ff932c'],
    [2700, '#ffa757'],
    [3000, '#ffb46b'],
    [4000, '#ffd1a3'],
    [5000, '#ffe4ce'],
    [6500, '#ffffff'],
  ];
  const k = Math.max(2200, Math.min(6500, kelvin));
  const index = Math.max(0, anchors.findIndex(([v]) => v >= k) - 1),
    a = anchors[index],
    b = anchors[index + 1];
  return new Color(a[1]).lerp(new Color(b[1]), (k - a[0]) / (b[0] - a[0]));
}
