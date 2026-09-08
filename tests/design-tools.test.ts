import test from 'node:test';
import assert from 'node:assert/strict';
import { BoxGeometry, Vector3 } from 'three';
import { designFixture } from './design-fixture.ts';
import {
  alignMany,
  copyMany,
  groupMany,
  offsetFromWall,
  rotateMany,
  snapTargets,
  snapTranslation,
  translateMany,
  ungroup,
} from '../lib/arrangement-tools.ts';
import {
  defaultFinish,
  defaultSnap,
  defaultSun,
  defaultWalk,
} from '../lib/design-types.ts';
import {
  clone,
  exportProject,
  flattenNodes,
  importProject,
  loadArrangement,
  paintNode,
  pushHistory,
  redoHistory,
  saveArrangement,
  undoHistory,
  validateProject,
} from '../lib/editor-model.ts';
import {
  nodeWorldMatrix,
  sceneBounds,
  wallBlocks,
  wallBlockGeometry,
} from '../lib/editor-geometry.ts';
import {
  analysisFootprints,
  movingDistances,
  polygonDistance,
} from '../lib/plan-analysis.ts';
import {
  canStand,
  constrainedWalk,
  insideRooms,
  lookCamera,
  startWalk,
  viewAngles,
  walkShapes,
  walkStep,
} from '../lib/walkthrough.ts';
import { solarPosition, sunDirection } from '../lib/sunlight.ts';
import {
  faceForNormal,
  finishGeometry,
  finishUV,
} from '../lib/surface-finish.ts';
import { createPlanProject } from '../lib/plan-project.ts';
const ids = ['design-a', 'design-b'];
const near = (a: number, b: number, e = 1e-7) =>
  assert.ok(Math.abs(a - b) < e, `${a} != ${b}`);
const world = (p: ReturnType<typeof designFixture>, id: string) =>
  nodeWorldMatrix(p.scene.objects, id)!.elements;
const sameMatrix = (a: number[], b: number[]) =>
  a.forEach((x, i) => near(x, b[i]));
test('D16-1 snapping respects grid, exact angled wall face, furniture alignment and Alt', () => {
  const p = designFixture(),
    targets = snapTargets(p.scene.objects),
    a = targets.find((t) => t.id === ids[0])!;
  const grid = snapTranslation(targets, [ids[0]], [0.037, 0.082], {
    ...defaultSnap,
    objects: false,
    step: 0.1,
  });
  near(2 + grid.delta[0], 2);
  near(2 + grid.delta[1], 2.1);
  assert.equal(grid.guides.length, 2);
  assert.deepEqual(
    snapTranslation(targets, [ids[0]], [0.037, 0.082], defaultSnap, 0.08, true),
    { delta: [0.037, 0.082], guides: [] },
  );
  const shifted = offsetFromWall(p, [ids[0]], 'design-wall', 0.05),
    own = snapTargets(shifted.scene.objects).find((t) => t.id === ids[0])!,
    wall = targets.find((t) => t.id === 'design-wall')!;
  near(polygonDistance(own.points, wall.points).distance, 0.05);
  const w = p.scene.objects.find((n) => n.id === 'design-wall')!;
  w.rotation[1] = 32;
  w.position = [2, 0, 0];
  const angled = offsetFromWall(p, [ids[0]], w.id, 0.05),
    angledTargets = snapTargets(angled.scene.objects);
  near(
    polygonDistance(
      angledTargets.find((t) => t.id === ids[0])!.points,
      angledTargets.find((t) => t.id === w.id)!.points,
    ).distance,
    0.05,
  );
  const edge = snapTranslation(targets, [ids[0]], [0.45, 0.027], {
    ...defaultSnap,
    grid: false,
  });
  near(edge.delta[0], 0.45);
  near(edge.delta[1], 0);
  assert.ok(edge.guides.length);
  assert.deepEqual(a.points, targets.find((t) => t.id === ids[0])!.points);
  assert.throws(() => offsetFromWall(p, [ids[0]], w.id, -1));
});
test('D16-1 wall targets exclude door leaves and guides report actual moving distances', () => {
  const p = designFixture(),
    rear = snapTargets(p.scene.objects).find((t) => t.id === 'design-rear')!;
  near(Math.max(...rear.points.map((p) => p[1])), 0.1);
  const lines = movingDistances(
    analysisFootprints(p.scene.objects),
    new Set([ids[0]]),
    [0.25, 0],
  );
  near(lines.find((l) => l.label.startsWith('До мебели'))!.distance, 0.25);
});
test('D16-2 group/ungroup retain world geometry, independent IDs, scaled nested hierarchy and history', () => {
  const p = designFixture();
  p.scene.objects.find((n) => n.id === ids[0])!.rotation = [12, 35, 0];
  const original = ids.map((id) => world(p, id)),
    grouped = groupMany(p, ids, 'Рабочее место'),
    id = grouped.scene.view.selected!;
  ids.forEach((id, i) => sameMatrix(world(grouped, id), original[i]));
  const restored = ungroup(grouped, id);
  ids.forEach((id, i) => sameMatrix(world(restored, id), original[i]));
  const group = grouped.scene.objects.find((n) => n.id === id)!;
  group.rotation = [0, 42, 0];
  group.scale = [1.4, 1, 0.65];
  const distorted = ids.map((id) => world(grouped, id)),
    unscaled = ungroup(grouped, id);
  ids.forEach((id, i) => sameMatrix(world(unscaled, id), distorted[i]));
  const copied = copyMany(grouped, [id]);
  assert.equal(
    new Set(flattenNodes(copied.project.scene.objects).map((x) => x.node.id))
      .size,
    flattenNodes(copied.project.scene.objects).length,
  );
  const moved = translateMany(p, ids, [0.37, -0.25]);
  ids.forEach((id, i) => {
    near(world(moved, id)[12], original[i][12] + 0.37);
    near(world(moved, id)[14], original[i][14] - 0.25);
  });
  const rotated = rotateMany(p, ids, 90),
    before = sceneBounds(
      p.scene.objects.filter((n) => ids.includes(n.id)),
    ).getCenter(new Vector3()),
    after = sceneBounds(
      rotated.scene.objects.filter((n) => ids.includes(n.id)),
    ).getCenter(new Vector3());
  near(before.x, after.x);
  near(before.z, after.z);
  let h = pushHistory({ past: [], present: p, future: [] }, grouped);
  h = undoHistory(h);
  assert.deepEqual(h.present, p);
  h = redoHistory(h);
  assert.deepEqual(h.present, grouped);
  assert.deepEqual(
    importProject(exportProject(grouped)),
    validateProject(grouped),
  );
  const aligned = alignMany(p, [ids[1], ids[0]], 'x', 'min');
  near(
    sceneBounds([aligned.scene.objects.find((n) => n.id === ids[0])!]).min.x,
    3,
  );
  p.scene.objects.find((n) => n.id === ids[0])!.locked = true;
  assert.throws(() => groupMany(p, ids));
  assert.throws(() => translateMany(p, ids, [1, 0]));
});
test('D16-3 navigation preserves eye height, normalized speed, look direction and cannot tunnel through walls', () => {
  const p = designFixture(),
    nodes = p.scene.objects,
    shapes = walkShapes(nodes),
    camera = lookCamera([4, 1.6, 4], 0);
  const straight = walkStep(camera, 1, 0, 1),
    diagonal = walkStep(camera, 1, 1, 1);
  near(straight.position[2], 3);
  near(
    new Vector3(...diagonal.position).distanceTo(
      new Vector3(...camera.position),
    ),
    1,
  );
  near(diagonal.position[1], 1.6);
  near(viewAngles(lookCamera([1, 1.6, 1], 1.2, 0.4)).yaw, 1.2);
  near(viewAngles(lookCamera([1, 1.6, 1], 1.2, 0.4)).pitch, 0.4);
  const blocked = constrainedWalk(
    nodes,
    shapes,
    lookCamera([5, 1.6, 4], Math.PI / 2),
    1,
    0,
    3,
  );
  assert.ok(blocked.position[0] < 5.75);
  assert.equal(canStand(shapes, [2, 2]), false);
  assert.equal(insideRooms(nodes, [-1, 3]), false);
  const start = startWalk(nodes, 1.7, [4, 4]);
  near(start.position[0], 4);
  near(start.position[1], 1.7);
  const source = createPlanProject().scene.objects,
    sourceStart = startWalk(source, 1.6);
  assert.ok(
    canStand(walkShapes(source), [
      sourceStart.position[0],
      sourceStart.position[2],
    ]),
  );
  assert.ok(
    insideRooms(source, [sourceStart.position[0], sourceStart.position[2]]),
  );
});
test('D16-3 profiled lintels use their real height and navigation collides with visible door leaves', () => {
  const p = designFixture(),
    wall = p.scene.objects.find((n) => n.id === 'design-wall')!;
  const shapes = analysisFootprints([wall]).filter((s) => s.kind === 'wall');
  const blocks = wallBlocks(wall);
  const tops = blocks.flatMap((b) => {
    const geo = wallBlockGeometry(b);
    geo.translate(...b.position);
    geo.computeBoundingBox();
    const bounds = [geo.boundingBox!.min.y, geo.boundingBox!.max.y];
    geo.dispose();
    return [bounds];
  });
  shapes.forEach((s) =>
    assert.ok(
      tops.some(
        ([lo, hi]) =>
          Math.abs(lo - s.minY) < 1e-6 && Math.abs(hi - s.maxY) < 1e-6,
      ),
    ),
  );
  assert.ok(shapes.some((s) => Math.abs(s.minY - 2.25) < 1e-6));
  const rear = p.scene.objects.find((n) => n.id === 'design-rear')!,
    door = rear.children[0];
  const leaf = flattenNodes(door.children).find(
    (x) => x.node.geometry.kind === 'box' && x.node.name.includes('Полотно'),
  )?.node;
  assert.ok(leaf, 'fixture must have an actual door leaf');
  const m = nodeWorldMatrix(p.scene.objects, leaf.id)!,
    centre = new Vector3().applyMatrix4(m);
  assert.equal(
    canStand(walkShapes(p.scene.objects), [centre.x, centre.z], 0.03),
    false,
  );
});
test('D16-4 Minsk southern glazing, seasonal altitude, east/west and UTC are consistent', () => {
  const summer = solarPosition({ ...defaultSun, minutes: 791 }),
    winter = solarPosition({ ...defaultSun, date: '2026-12-21', minutes: 788 });
  near(summer.elevation, 59.55, 0.2);
  near(winter.elevation, 12.65, 0.2);
  near(summer.azimuth, 180, 1);
  assert.ok(solarPosition({ ...defaultSun, minutes: 540 }).azimuth < 180);
  assert.ok(solarPosition({ ...defaultSun, minutes: 1020 }).azimuth > 180);
  assert.ok(solarPosition({ ...defaultSun, minutes: 0 }).elevation < 0);
  const utc = solarPosition({ ...defaultSun, utcOffset: 0, minutes: 611 });
  near(utc.azimuth, summer.azimuth, 0.02);
  near(utc.elevation, summer.elevation, 0.02);
  const south = sunDirection({
    ...defaultSun,
    mode: 'manual',
    azimuth: 180,
    elevation: 30,
  });
  near(south.direction[0], -Math.sqrt(3) / 2);
  near(south.direction[1], 0.5);
  near(south.direction[2], 0);
  const leap = solarPosition({ ...defaultSun, date: '2024-02-29' });
  assert.ok(Number.isFinite(leap.azimuth));
});
test('D16-5 physical UVs, direction and wall-face groups preserve vertices', () => {
  const p = new Vector3(2, 1, 3),
    s = new Vector3(2, 1, 3);
  assert.deepEqual(finishUV(p, new Vector3(0, 1, 0), s, 0), [4, -9]);
  const uv = finishUV(p, new Vector3(0, 1, 0), s, 90);
  near(uv[0], 9);
  near(uv[1], 4);
  assert.equal(faceForNormal(new Vector3(0, 0, -1)), 'back');
  assert.equal(faceForNormal(new Vector3(1, 0, 0)), 'edge');
  const node = designFixture().scene.objects.find(
    (n) => n.id === 'design-wall',
  )!;
  node.finish = defaultFinish('tile');
  node.surfaces = { front: { ...defaultFinish('paint'), color: '#112233' } };
  const raw = new BoxGeometry(2, 2.7, 0.2),
    original = raw.toNonIndexed().getAttribute('position').array.slice(),
    geo = finishGeometry(raw, node, new Vector3(1, 1, 1));
  assert.deepEqual(geo.getAttribute('position').array, original);
  assert.deepEqual(
    new Set(geo.groups.map((g) => g.materialIndex)),
    new Set([0, 1, 2, 3]),
  );
  assert.equal(geo.getAttribute('uv').count, 36);
  geo.dispose();
  paintNode(node, '#123456');
  assert.equal(node.finish.color, '#123456');
  assert.equal(node.surfaces.front!.color, '#123456');
  paintNode(node, '#abcdef', 'wood');
  assert.equal(node.finish, undefined);
  assert.equal(node.surfaces, undefined);
});
test('D16 extensions travel with snapshots/JSON and reject malformed data atomically; source stays unchanged', () => {
  const p = designFixture(),
    old = exportProject(p);
  assert.equal(exportProject(importProject(old)), old);
  p.scene.view = {
    ...p.scene.view,
    sunlight: { ...defaultSun, enabled: true },
    snapping: defaultSnap,
    walk: defaultWalk,
  };
  p.scene.viewpoints = [
    { id: 'view-a', name: 'У окна', camera: lookCamera([4, 1.6, 4], 1) },
  ];
  p.scene.objects[0].finish = defaultFinish('oak');
  const snapshot = saveArrangement(p, 'С материалами');
  assert.deepEqual(importProject(exportProject(snapshot)), snapshot);
  const loaded = loadArrangement(snapshot, snapshot.activeArrangement!);
  assert.deepEqual(loaded.scene, snapshot.scene);
  for (const mutate of [
    (p: typeof snapshot) => {
      p.scene.view.sunlight!.date = '2026-02-30';
    },
    (p: typeof snapshot) => {
      p.scene.view.sunlight!.latitude = 100;
    },
    (p: typeof snapshot) => {
      p.scene.view.snapping!.step = 0;
    },
    (p: typeof snapshot) => {
      p.scene.objects[0].finish!.joint = 1;
    },
    (p: typeof snapshot) => {
      p.scene.viewpoints!.push(clone(p.scene.viewpoints![0]));
    },
    (p: typeof snapshot) => {
      p.scene.objects[0].surfaces = { front: defaultFinish() };
    },
  ]) {
    const invalid = clone(snapshot);
    mutate(invalid);
    assert.throws(() => validateProject(invalid));
  }
  assert.equal(exportProject(designFixture()), old);
});
