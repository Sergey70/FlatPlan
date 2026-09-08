import test from 'node:test';
import assert from 'node:assert/strict';
import { Matrix3, Vector3 } from 'three';
import { baseNode, makeOpening } from '../lib/editor-seed.ts';
import { defaultView, clone, validateProject } from '../lib/editor-model.ts';
import type { Arrangement } from '../lib/editor-model.ts';
import { defaultSun } from '../lib/design-types.ts';
import { defaultStudy } from '../lib/renovation-types.ts';
import { nodeWorldMatrix } from '../lib/editor-geometry.ts';
import { createPlanProject } from '../lib/plan-project.ts';
import { createRoomProposalProject } from '../lib/room-proposal.ts';
import {
  createSunWorld,
  shadeBlocks,
  rotatedStudyScene,
  runWorkplaceStudy,
  studyTotals,
  studyTimes,
  suggestedStudy,
  studyWindows,
  type WindowHit,
} from '../lib/workplace-sun.ts';
const near = (a: number, b: number, eps = 1e-7) =>
  assert.ok(Math.abs(a - b) < eps, `${a} != ${b}`);
export function sunlightFixture() {
  const floor = baseNode(
    'sun-floor',
    'Пол — Кабинет',
    {
      kind: 'floor',
      size: [4, 0.1, 3],
      polygon: [
        [-2, 0.1],
        [2, 0.1],
        [2, 3],
        [-2, 3],
      ],
      holes: [],
    },
    'structure',
  );
  floor.position[1] = -0.1;
  const wall = baseNode(
    'sun-wall',
    'Стена с окном',
    { kind: 'wall', size: [4, 3, 0.2] },
    'structure',
  );
  const window = makeOpening(3, 2.4, 0.2, 'window');
  window.id = 'sun-window';
  window.position[1] = 0.5;
  window.children = [];
  wall.children.push(window);
  const desk = baseNode('sun-desk', 'Рабочий стол / Столешница', {
    kind: 'box',
    size: [1, 0.1, 0.6],
  });
  desk.position = [0, 0.75, 1];
  const scene: Arrangement = {
    objects: [floor, wall, desk],
    view: {
      ...defaultView(),
      mode: '2d',
      sunlight: { ...defaultSun, north: 180, date: '2026-03-21', minutes: 780 },
    },
  };
  const settings = defaultStudy();
  settings.targets = [{ id: desk.id, face: 'top' }];
  settings.rotateIds = [desk.id];
  settings.shades.windowIds = [window.id];
  settings.start = 720;
  settings.end = 900;
  return { scene, settings, floor, wall, window, desk };
}
test('R17-4 rays reach a real window, respect front face, wall blocks, opaque frames and closed ceilings', () => {
  const f = sunlightFixture(),
    source = clone(f.scene);
  let world = createSunWorld(f.scene, f.settings);
  assert.equal(world.surfaces[0].points.length, 25);
  const point = world.surfaces[0].points[12];
  near(point.position[1], 0.8);
  assert.equal(world.trace(point, [0, 1, -1])?.[0].id, 'sun-window');
  assert.equal(
    world.trace(point, [0, 1, 1]),
    null,
    'No actual window on opposite facade',
  );
  assert.equal(
    world.trace({ ...point, normal: [0, 0, 1] }, [0, 1, -1]),
    null,
    'Back of screen cannot illuminate its front',
  );
  assert.equal(
    world.trace(point, [3, 1, -1]),
    null,
    'Ray outside aperture hits wall',
  );
  world.dispose();
  f.settings.ceilingHeight = 2;
  world = createSunWorld(f.scene, f.settings);
  assert.equal(
    world.trace(point, [0, 1.8, -1]),
    null,
    'Window above assumed ceiling cannot admit light through roof',
  );
  world.dispose();
  f.settings.ceilingHeight = 3;
  world = createSunWorld(f.scene, f.settings);
  assert.ok(world.trace(point, [0, 1.8, -1]));
  world.dispose();
  const frame = baseNode(
    'sun-frame',
    'Импост',
    { kind: 'box', size: [0.2, 2.4, 0.15] },
    'structure',
  );
  frame.position = [0, 1.2, 0];
  f.window.children.push(frame);
  world = createSunWorld(f.scene, f.settings);
  assert.equal(
    world.trace(point, [0, 1, -1]),
    null,
    'Frame is an opaque occluder',
  );
  world.dispose();
  frame.material = 'glass';
  world = createSunWorld(f.scene, f.settings);
  assert.ok(
    world.trace(point, [0, 1, -1]),
    'Clear glazing does not block direct rays',
  );
  world.dispose();
  f.window.children = [];
  f.window.geometry.openingType = 'door';
  assert.throws(
    () => createSunWorld(f.scene, f.settings),
    /нет видимых оконных/,
  );
  f.window.geometry.openingType = 'window';
  assert.deepEqual(f.scene, source);
  f.floor.visible = false;
  assert.throws(
    () => createSunWorld(f.scene, f.settings),
    /видимый контур пола/,
  );
});
test('R17-4 mesh samples and normals preserve nested nonuniform transforms; hidden objects cannot become study targets', () => {
  const f = sunlightFixture(),
    group = baseNode('sun-group', 'Группа', { kind: 'group', size: [1, 1, 1] });
  f.scene.objects = f.scene.objects.filter((n) => n.id !== f.desk.id);
  group.position = [1, 0.2, 1];
  group.rotation = [0, 35, 0];
  group.scale = [2, 1.2, 0.6];
  f.desk.rotation = [10, 20, 0];
  group.children = [f.desk];
  f.scene.objects.push(group);
  const world = createSunWorld(f.scene, f.settings),
    matrix = nodeWorldMatrix(f.scene.objects, f.desk.id)!;
  const expected = new Vector3(0, 0.05, 0).applyMatrix4(matrix),
    point = world.surfaces[0].points[12];
  point.position.forEach((v, i) => near(v, expected.toArray()[i]));
  const normal = new Vector3(0, 1, 0)
    .applyMatrix3(new Matrix3().getNormalMatrix(matrix))
    .normalize();
  point.normal.forEach((v, i) => near(v, normal.toArray()[i]));
  world.dispose();
  group.visible = false;
  assert.throws(() => createSunWorld(f.scene, f.settings), /удалена, скрыта/);
});
test('R17-4 ideal rollers/slats match geometric cases and apply only to selected windows', () => {
  const s = defaultStudy().shades;
  s.windowIds = ['window'];
  const hit: WindowHit = {
    id: 'window',
    position: [0, 1, 0],
    local: [0, 1.7, 0],
    direction: [0, 0, -1],
    height: 2,
    distance: 1,
  };
  assert.equal(shadeBlocks(hit, 'roller', s), true);
  hit.local[1] = 0.6;
  assert.equal(shadeBlocks(hit, 'roller', s), false);
  s.roller = 1;
  assert.equal(shadeBlocks(hit, 'roller', s), true);
  s.roller = 0;
  assert.equal(shadeBlocks(hit, 'roller', s), false);
  s.slatPitch = 0.02;
  s.slatWidth = 0.025;
  hit.local[1] = 1.98;
  s.slatAngle = 0;
  assert.equal(
    shadeBlocks(hit, 'blinds', s),
    false,
    'Horizontal slats admit horizontal rays between them',
  );
  hit.direction = [0, 1, -1];
  assert.equal(
    shadeBlocks(hit, 'blinds', s),
    true,
    'High sun is intercepted by projected horizontal slats',
  );
  hit.direction = [0, 0, -1];
  s.slatAngle = 90;
  assert.equal(shadeBlocks(hit, 'blinds', s), true, 'Closed overlapping slats');
  hit.id = 'other';
  assert.equal(shadeBlocks(hit, 'blinds', s), false);
});
test('R17-4 orientation is a read-only rigid rotation about the chosen workspace; source and unrelated furniture remain identical', () => {
  const f = sunlightFixture(),
    source = clone(f.scene);
  const other = baseNode('sun-chair', 'Кресло', {
    kind: 'box',
    size: [0.5, 1, 0.5],
  });
  other.position = [0, 0.5, 2];
  f.scene.objects.push(other);
  f.settings.rotateIds.push(other.id);
  const turned = rotatedStudyScene(f.scene, f.settings);
  const a = new Vector3().setFromMatrixPosition(
      nodeWorldMatrix(turned.objects, 'sun-desk')!,
    ),
    b = new Vector3().setFromMatrixPosition(
      nodeWorldMatrix(turned.objects, 'sun-chair')!,
    );
  near(a.distanceTo(b), Math.hypot(0.25, 1));
  near(a.z, b.z);
  assert.deepEqual(turned.objects.slice(0, 2), source.objects.slice(0, 2));
  assert.deepEqual(f.scene.objects.slice(0, 3), source.objects);
});
test('R17-4 work intervals use duration-weighted midpoint samples, real Minsk solar direction and independent shade/orientation reports', async () => {
  const f = sunlightFixture(),
    original = clone(f.scene);
  f.settings.end = 895;
  f.settings.shades.roller = 1;
  assert.deepEqual(studyTimes({ start: 540, end: 610, step: 60 }), [
    { from: 540, to: 600, minutes: 570 },
    { from: 600, to: 610, minutes: 605 },
  ]);
  const progress: number[] = [];
  const result = await runWorkplaceStudy(f.scene, f.settings, undefined, (n) =>
    progress.push(n),
  );
  const total = studyTotals(result, 'current', 0);
  assert.ok(total.minutes > 0 && total.fraction > 0);
  assert.equal(studyTotals(result, 'roller', 0).minutes, 0);
  assert.equal(result.frames.at(-1)!.to, 895);
  assert.equal(progress.at(-1), 100);
  assert.ok(result.frames[0].azimuth !== result.frames.at(-1)!.azimuth);
  assert.deepEqual(f.scene, original);
  f.scene.view.sunlight!.north = 0;
  const north = await runWorkplaceStudy(f.scene, f.settings);
  assert.equal(studyTotals(north, 'current', 0).minutes, 0);
  const controller = new AbortController();
  await assert.rejects(
    runWorkplaceStudy(f.scene, f.settings, controller.signal, () =>
      controller.abort(),
    ),
    { name: 'AbortError' },
  );
});
test('R17-4 optional settings round trip, stay per-arrangement and reject invalid/oversized input without changing old files', () => {
  const p = createPlanProject(),
    before = clone(p);
  assert.equal(p.scene.workplaceStudy, undefined);
  assert.deepEqual(validateProject(p), before);
  p.scene.workplaceStudy = suggestedStudy(p.scene.objects);
  assert.ok(p.scene.workplaceStudy.targets.length);
  const valid = validateProject(p);
  assert.deepEqual(valid, p);
  assert.equal(valid.arrangements[0].scene.workplaceStudy, undefined);
  for (const patch of [
    (s: typeof p.scene.workplaceStudy) => {
      s!.end = s!.start;
    },
    (s: typeof p.scene.workplaceStudy) => {
      s!.targets = Array(9).fill(s!.targets[0]);
    },
    (s: typeof p.scene.workplaceStudy) => {
      s!.shades.slatPitch = 0;
    },
    (s: typeof p.scene.workplaceStudy) => {
      s!.shades.windowIds = ['same', 'same'];
    },
  ]) {
    const next = clone(valid);
    patch(next.scene.workplaceStudy!);
    assert.throws(() => validateProject(next));
  }
});
test('R17-4 actual room proposal includes desk and two screen surfaces; all rays follow actual windows and source stays unchanged', async () => {
  const p = createRoomProposalProject(),
    before = clone(p),
    settings = suggestedStudy(p.scene.objects);
  assert.equal(settings.targets.length, 3);
  assert.equal(studyWindows(p.scene.objects).length, 4);
  settings.step = 60;
  const result = await runWorkplaceStudy(p.scene, settings);
  for (const s of result.surfaces.current) assert.equal(s.points.length, 25);
  assert.ok(result.frames.length === 9);
  assert.equal(result.turningWarnings.length, 2);
  for (const key of ['current', 'turned', 'roller', 'blinds'] as const)
    for (let i = 0; i < 3; i++) {
      const total = studyTotals(result, key, i);
      assert.ok(
        total.fraction >= 0 && total.fraction <= 1 && total.minutes <= 540,
      );
    }
  assert.deepEqual(p, before);
});
