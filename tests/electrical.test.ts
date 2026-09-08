import test from 'node:test';
import assert from 'node:assert/strict';
import { Vector3 } from 'three';
import { createPlanProject } from '../lib/plan-project.ts';
import {
  clone,
  findNode,
  validateProject,
  importProject,
  exportProject,
  saveArrangement,
  loadArrangement,
  pushHistory,
  undoHistory,
} from '../lib/editor-model.ts';
import { baseNode } from '../lib/editor-seed.ts';
import { nodeWorldMatrix } from '../lib/editor-geometry.ts';
import { defaultLight } from '../lib/renovation-types.ts';
import {
  addElectricalPoint,
  addLightingPresets,
  applyLightingScene,
  captureLightingScene,
  controlExistingLight,
  createElectricalPoint,
  electricalNodes,
  electricalPosition,
  kelvinColor,
  setElectricalPosition,
  setLightGroup,
  toggleElectricalSwitch,
} from '../lib/electrical.ts';
const near = (a: number, b: number) =>
  assert.ok(Math.abs(a - b) < 1e-8, `${a} != ${b}`);
test('R17-3 exact electrical point position and installation height survive scaled rotated parents and saved variants', () => {
  const source = createPlanProject();
  let p = source;
  for (const kind of [
    'socket',
    'switch',
    'data',
    'appliance',
    'light',
  ] as const) {
    p = addElectricalPoint(
      p,
      kind,
      [2.35, kind === 'light' ? 2.6 : 0.9, 4.15],
      'Рабочее место',
    );
    assert.deepEqual(
      electricalPosition(p.scene.objects, p.scene.view.selected!),
      [2.35, kind === 'light' ? 2.6 : 0.9, 4.15],
    );
  }
  const parent = baseNode('electrical-parent', 'Поворот группы', {
    kind: 'group',
    size: [1, 1, 1],
  });
  parent.position = [3, 0.2, 4];
  parent.rotation = [0, 35, 0];
  parent.scale = [1.5, 0.8, 0.6];
  const node = createElectricalPoint('socket', [1, 0.3, 0], 'Компьютер');
  parent.children.push(node);
  p.scene.objects.push(parent);
  p = setElectricalPosition(p, node.id, [3.8, 1.12, 5.9]);
  electricalPosition(p.scene.objects, node.id).forEach((v, i) =>
    near(v, [3.8, 1.12, 5.9][i]),
  );
  const saved = saveArrangement(p, 'Электрика'),
    imported = importProject(exportProject(saved));
  assert.deepEqual(
    loadArrangement(imported, saved.activeArrangement!).scene.objects,
    p.scene.objects,
  );
  assert.deepEqual(source, createPlanProject());
  findNode(p.scene.objects, parent.id)!.locked = true;
  assert.throws(() => setElectricalPosition(p, node.id, [1, 1, 1]));
});
test('R17-3 groups/switches change only assigned fixtures; live settings, snapshots and independent arrangements persist', () => {
  let p = createPlanProject();
  for (const group of ['Рабочее место', 'Кухня', 'Коридор'])
    p = addElectricalPoint(p, 'light', [1, 2.6, 2], group);
  p = addElectricalPoint(p, 'switch', [1, 0.9, 2], 'При входе');
  const sw = findNode(p.scene.objects, p.scene.view.selected!)!;
  sw.electrical!.controls = ['Кухня'];
  const off = toggleElectricalSwitch(p, sw.id, false);
  assert.equal(
    electricalNodes(off.scene.objects).find(
      (n) => n.electrical!.group === 'Кухня',
    )!.electrical!.fixture!.level,
    0,
  );
  assert.equal(
    electricalNodes(off.scene.objects).find(
      (n) => n.electrical!.group === 'Рабочее место',
    )!.electrical!.fixture!.level,
    1,
  );
  p = setLightGroup(off, 'Рабочее место', 0.42);
  p = captureLightingScene(p, 'Мой свет');
  const customId = p.scene.lightingScenes![0].id;
  const changed = setLightGroup(p, 'Кухня', 1),
    restored = applyLightingScene(changed, customId);
  assert.equal(
    electricalNodes(restored.scene.objects).find(
      (n) => n.electrical!.group === 'Кухня',
    )!.electrical!.fixture!.level,
    0,
  );
  assert.equal(
    electricalNodes(restored.scene.objects).find(
      (n) => n.electrical!.group === 'Рабочее место',
    )!.electrical!.fixture!.level,
    0.42,
  );
  const presets = addLightingPresets(restored);
  assert.equal(presets.scene.lightingScenes!.length, 5);
  assert.deepEqual(addLightingPresets(presets), presets);
  for (const name of ['Работа', 'Готовка', 'Вечер', 'Ночь']) {
    const applied = applyLightingScene(
      presets,
      presets.scene.lightingScenes!.find((s) => s.name === name)!.id,
    );
    assert.equal(applied.scene.view.night, true);
    assert.equal(applied.scene.view.artificialLight, true);
    assert.deepEqual(importProject(exportProject(applied)), applied);
  }
  assert.deepEqual(
    undoHistory(
      pushHistory({ past: [], present: changed, future: [] }, restored),
    ).present,
    changed,
  );
});
test('R17-3 source light conversion keeps geometry and offsets in actual world positions; hidden ancestors omit lights', () => {
  const source = createPlanProject(),
    lamp = source.scene.objects.find(
      (n) => n.cutaway && n.children.some((n) => n.material === 'light'),
    )!;
  const p = controlExistingLight(source, lamp.id, 'Кухня');
  const changed = clone(findNode(p.scene.objects, lamp.id)!);
  delete changed.electrical;
  assert.deepEqual(changed, lamp);
  const config = findNode(p.scene.objects, lamp.id)!.electrical!.fixture!;
  assert.deepEqual(config, defaultLight());
  const origin = new Vector3(...config.offset).applyMatrix4(
    nodeWorldMatrix(p.scene.objects, lamp.id)!,
  );
  near(origin.y, lamp.position[1] - 0.03);
  assert.equal(electricalNodes(p.scene.objects, true).length, 1);
  findNode(p.scene.objects, lamp.id)!.visible = false;
  assert.equal(electricalNodes(p.scene.objects, true).length, 0);
  const warm = kelvinColor(2700),
    cold = kelvinColor(6500);
  assert.ok(warm.b < cold.b);
  near(cold.r, cold.b);
});
test('R17-3 strict bounded electrical/snapshot schema preserves old v1 and rejects invalid values atomically', () => {
  const source = createPlanProject(),
    p = addElectricalPoint(source, 'light', [1, 2.6, 2], 'Кухня');
  for (const bad of [
    { level: 2 },
    { lumens: -1 },
    { kelvin: 10000 },
    { beam: 180 },
    { target: [0, -0.03, 0] },
    { offset: [NaN, 0, 0] },
  ]) {
    const next = clone(p);
    Object.assign(
      findNode(next.scene.objects, next.scene.view.selected!)!.electrical!
        .fixture!,
      bad,
    );
    assert.throws(() => validateProject(next));
  }
  const bad = clone(p);
  findNode(bad.scene.objects, bad.scene.view.selected!)!.electrical!.kind =
    'socket';
  assert.throws(() => validateProject(bad));
  const scenes = captureLightingScene(p, 'Пример');
  scenes.scene.lightingScenes!.push(clone(scenes.scene.lightingScenes![0]));
  assert.throws(() => validateProject(scenes));
  assert.throws(() => setLightGroup(p, 'Нет такой группы', 1));
  assert.deepEqual(validateProject(source), source);
});
