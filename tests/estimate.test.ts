import { defaultFinish } from '../lib/design-types.ts';
import test from 'node:test';
import assert from 'node:assert/strict';
import { baseNode, makeOpening } from '../lib/editor-seed.ts';
import { createPlanProject } from '../lib/plan-project.ts';
import {
  clone,
  defaultView,
  importProject,
  exportProject,
  validateProject,
  saveArrangement,
  loadArrangement,
} from '../lib/editor-model.ts';
import { estimateScene, estimateCsv } from '../lib/estimate.ts';
import { defaultEstimate } from '../lib/renovation-types.ts';
const near = (a: number, b: number, eps = 1e-7) =>
  assert.ok(Math.abs(a - b) < eps, `${a} != ${b}`);
function fixture() {
  const floor = baseNode(
    'estimate-room',
    'Пол — Комната',
    {
      kind: 'floor',
      size: [4, 0.04, 3],
      polygon: [
        [-2, 0.1],
        [2, 0.1],
        [2, 3.1],
        [-2, 3.1],
      ],
      holes: [],
    },
    'structure',
  );
  floor.position[1] = -0.04;
  floor.material = 'wood';
  const wall = baseNode(
    'estimate-wall',
    'Стена',
    { kind: 'wall', size: [4, 2.7, 0.2] },
    'structure',
  );
  wall.material = 'paint';
  const door = makeOpening(0.8, 2.1, 0.2, 'door');
  wall.children.push(door);
  return {
    objects: [floor, wall],
    view: defaultView(),
    estimate: defaultEstimate(),
  };
}
test('R17-6 waste, coverage and pack rounding produce known quantities/prices without charging exterior walls', () => {
  const scene = fixture(),
    base = estimateScene(scene);
  near(base.rows.find((r) => r.category === 'floor')!.net, 12);
  near(base.rows.find((r) => r.category === 'wall')!.net, 9.12);
  near(base.rows.find((r) => r.category === 'skirting')!.net, 3.2);
  scene.estimate.rates = base.rows.map((r) => ({
    key: r.key,
    unit: r.category === 'floor' ? 'упак.' : r.category === 'wall' ? 'л' : 'шт',
    coverage: r.category === 'floor' ? 2.2 : r.category === 'wall' ? 8 : 2,
    pack: 1,
    price: r.category === 'floor' ? 25 : r.category === 'wall' ? 10 : 7,
  }));
  const result = estimateScene(scene);
  near(result.rows.find((r) => r.category === 'floor')!.purchased, 6);
  near(result.rows.find((r) => r.category === 'wall')!.purchased, 2);
  near(result.rows.find((r) => r.category === 'skirting')!.purchased, 2);
  near(result.total, 184);
  assert.equal(result.unpriced, 0);
  const before = clone(scene);
  estimateCsv(scene);
  assert.deepEqual(scene, before);
  scene.objects[0].scale[0] = 2;
  near(estimateScene(scene).rows.find((r) => r.category === 'floor')!.net, 24);
});
test('R17-6 wall face finishes split rates; per-room quantities sum, missing prices stay explicit, old scenes are not modified', () => {
  const p = createPlanProject(),
    before = clone(p),
    all = estimateScene(p.scene);
  near(all.total, 0);
  assert.equal(all.unpriced, all.rows.length);
  const totals = all.measured.rooms.reduce(
    (sum, room) =>
      sum +
      estimateScene(p.scene, room.id)
        .rows.filter((r) => r.category === 'wall')
        .reduce((sum, r) => sum + r.net, 0),
    0,
  );
  near(
    totals,
    all.rows
      .filter((r) => r.category === 'wall')
      .reduce((sum, r) => sum + r.net, 0),
  );
  assert.deepEqual(p, before);
  const scene = fixture(),
    second = clone(scene.objects[0]);
  second.id = 'second-room';
  second.geometry.polygon = [
    [-2, -3.1],
    [2, -3.1],
    [2, -0.1],
    [-2, -0.1],
  ];
  scene.objects.push(second);
  scene.objects[1].surfaces = {
    front: defaultFinish('paint'),
    back: defaultFinish('tile'),
  };
  const finishes = estimateScene(scene).rows.filter(
    (r) => r.category === 'wall',
  );
  assert.equal(finishes.length, 2);
  assert.ok(finishes.some((r) => r.key.includes('tile')));
  finishes.forEach((r) => near(r.net, 9.12));
});
test('R17-6 rates round-trip independently with arrangements and reject invalid budgets; CSV protects spreadsheet strings', () => {
  const p = createPlanProject();
  p.scene = fixture();
  const rows = estimateScene(p.scene).rows;
  p.scene.estimate!.rates = rows.map((r) => ({
    ...r.rate,
    price: 12.5,
    unit: '=1+2',
  }));
  p.scene.estimate!.currency = 'BYN';
  const saved = saveArrangement(p, 'Смета'),
    imported = importProject(exportProject(saved));
  assert.deepEqual(
    loadArrangement(imported, saved.activeArrangement!).scene.estimate,
    p.scene.estimate,
  );
  const csv = estimateCsv(p.scene);
  assert.ok(csv.startsWith('\ufeff'));
  assert.ok(csv.includes("'="));
  assert.ok(csv.includes('Стоимость, BYN'));
  assert.ok(!csv.includes('"=1+2"'));
  for (const bad of [{ price: -1 }, { coverage: 0 }, { pack: Infinity }]) {
    const next = clone(p);
    Object.assign(next.scene.estimate!.rates[0], bad);
    assert.throws(() => validateProject(next));
  }
  const bad = clone(p);
  bad.scene.estimate!.rates.push(clone(bad.scene.estimate!.rates[0]));
  assert.throws(() => validateProject(bad));
});
