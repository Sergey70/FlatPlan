import test from 'node:test';
import assert from 'node:assert/strict';
import { baseNode, makeOpening } from '../lib/editor-seed.ts';
import { createPlanProject } from '../lib/plan-project.ts';
import {
  clone,
  defaultView,
  flattenNodes,
  importProject,
  exportProject,
  validateProject,
  saveArrangement,
  loadArrangement,
  pushHistory,
  undoHistory,
  redoHistory,
  type SceneNode,
  type Vec3,
  type EditorProject,
} from '../lib/editor-model.ts';
import {
  analysisFootprints,
  analyzePlan,
  selectedDistances,
  dimensionOutline,
  polygonsOverlap,
  polygonDistance,
} from '../lib/plan-analysis.ts';
import {
  furnitureCatalog,
  createFurniture,
  placeFurniture,
} from '../lib/furniture-catalog.ts';
import { objectDimensions, sceneBounds } from '../lib/editor-geometry.ts';

function box(id: string, position: Vec3, size: Vec3 = [1, 1, 1]) {
  const n = baseNode(id, id, { kind: 'box', size });
  n.position = position;
  return n;
}
function wall() {
  return baseNode(
    'wall',
    'Стена',
    { kind: 'wall', size: [4, 2.7, 0.2] },
    'structure',
  );
}
const issues = (nodes: SceneNode[], gap: number | null = null) =>
  analyzePlan(analysisFootprints(nodes), gap);

test('collision uses rotated projections and vertical overlap, excluding contact and invisible descendants', () => {
  const a = box('a', [0, 0.5, 0], [2, 1, 0.2]),
    b = box('b', [0, 0.5, 0.4], [2, 1, 0.2]);
  a.rotation[1] = b.rotation[1] = 45;
  assert.equal(
    issues([a, b]).length,
    0,
    'Overlapping AABBs do not imply collision',
  );
  b.position[2] = 0.1;
  assert.equal(issues([a, b]).filter((i) => i.kind === 'collision').length, 1);
  b.position[1] = 1.5;
  assert.equal(issues([a, b]).length, 0, 'Touching height intervals');
  b.position[1] = 0.5;
  b.visible = false;
  const group = baseNode('group', 'group', { kind: 'group', size: [2, 2, 2] });
  group.children = [b];
  assert.equal(issues([a, group]).length, 0);
  b.visible = true;
  group.visible = false;
  assert.equal(issues([a, group]).length, 0);
});

test('wall solids respect door voids, windowsills, lintels and transformed paired swing sectors', () => {
  const w = wall(),
    door = makeOpening(1, 2.1, 0.2, 'door');
  door.id = 'door';
  door.geometry.doorSwing = { hinge: 'both', side: 1, offset: 0 };
  w.children = [door];
  const item = box('item', [0, 0.5, 0], [0.3, 1, 0.3]);
  assert.equal(
    issues([w, item]).filter((i) => i.kind === 'collision').length,
    0,
  );
  assert.equal(issues([w, item]).filter((i) => i.kind === 'door').length, 1);
  item.position = [0.3, 0.5, 0.3];
  assert.ok(issues([w, item]).some((i) => i.kind === 'door'));
  w.rotation[1] = 90;
  item.position = [0.3, 0.5, -0.3];
  assert.ok(issues([w, item]).some((i) => i.kind === 'door'));
  w.rotation[1] = 0;
  item.position = [0, 2.4, 0];
  assert.ok(issues([w, item]).some((i) => i.kind === 'collision'));
  const window = makeOpening(1, 1.2, 0.2, 'window');
  window.position[1] = 0.9;
  w.children = [window];
  item.position = [0, 0.4, 0];
  item.geometry.size[1] = 0.5;
  assert.ok(
    issues([w, item]).some((i) => i.kind === 'collision'),
    'Windowsill remains solid',
  );
  item.position[1] = 1.5;
  assert.equal(
    issues([w, item]).length,
    0,
    'Window void remains open at its recorded height',
  );
});

test('circular silhouettes and polygon holes do not become solid bounding rectangles', () => {
  const circle = baseNode('round', 'round', {
    kind: 'cylinder',
    size: [2, 1, 2],
  });
  circle.position[1] = 0.5;
  const corner = box('corner', [0.9, 0.5, 0.9], [0.1, 0.2, 0.1]);
  assert.equal(issues([circle, corner]).length, 0);
  const solid = baseNode('hollow', 'hollow', {
    kind: 'solid',
    size: [4, 1, 4],
    polygon: [
      [-2, -2],
      [2, -2],
      [2, 2],
      [-2, 2],
    ],
    holes: [
      [
        [-1, -1],
        [-1, 1],
        [1, 1],
        [1, -1],
      ],
    ],
  });
  assert.equal(
    issues([solid, box('inside', [0, 0.5, 0], [0.5, 0.5, 0.5])]).length,
    0,
  );
});

test('clearance lengths remain physical metres through scaling, rotation and JSON', () => {
  const chair = createFurniture('office-chair', [0.8, 1.2, 0.8]);
  placeFurniture(chair, [0, 0]);
  chair.rotation[1] = 180;
  chair.clearance = { front: 0, back: 0.6 };
  const shapes = analysisFootprints([chair]),
    zone = shapes.find((s) => s.kind === 'clearance')!;
  const zz = zone.points.map((p) => p[1]);
  assert.ok(Math.abs(Math.max(...zz) - Math.min(...zz) - 0.6) < 1e-6);
  assert.ok(Math.min(...zz) > 0.39, 'Back zone rotates to positive Z');
  assert.ok(
    issues([chair, box('obstacle', [0, 0.5, 0.85], [0.2, 1, 0.2])]).some(
      (i) => i.kind === 'clearance',
    ),
  );
  assert.equal(
    issues([chair]).length,
    0,
    'Its own parts never block its clearance',
  );
});

test('nearest dimensions update after movement and small abutments are not called passages', () => {
  const a = box('a', [0, 0.5, 0]),
    b = box('b', [1.5, 0.5, 0]);
  const shapes = analysisFootprints([a, b]);
  assert.equal(selectedDistances([a, b], shapes, a.id)[0].distance, 0.5);
  assert.equal(issues([a, b], 0.8).filter((i) => i.kind === 'gap').length, 1);
  b.position[0] = 1.02;
  assert.equal(issues([a, b], 0.8).length, 0);
  a.rotation[1] = 45;
  assert.ok(Math.abs(dimensionOutline([a], a.id)[0].distance - 1) < 1e-6);
  const p: [number, number][] = [
    [0, 0],
    [1, 0],
    [1, 1],
    [0, 1],
  ];
  assert.equal(
    polygonsOverlap(
      p,
      p.map(([x, z]) => [x + 1, z]),
    ),
    false,
  );
  assert.equal(
    polygonDistance(
      p,
      p.map(([x, z]) => [x + 2, z]),
    ).distance,
    1,
  );
});

test('gap lines do not cross a third obstacle away from their midpoint', () => {
  const a = box('gap-a', [0, 0.5, 0]);
  const b = box('gap-b', [2, 0.5, 0]);
  const obstacle = box('obstacle', [0.7, 0.5, 0], [0.1, 1, 2]);
  assert.ok(issues([a, b], 1.5).some((i) => i.kind === 'gap'));
  assert.ok(
    !issues([a, b, obstacle], 1.5).some(
      (i) => i.kind === 'gap' && i.ids.includes(a.id) && i.ids.includes(b.id),
    ),
  );
});

test('catalog items have independent IDs and exact editable sizes and floor placement', () => {
  for (const c of furnitureCatalog) {
    const size: Vec3 = [1.8, 1.3, 0.8],
      item = createFurniture(c.id, size);
    placeFurniture(item, [5, 6], 0.75);
    objectDimensions([item], item).forEach((d, i) =>
      assert.ok(Math.abs(d - size[i]) < 1e-6, `${c.id}/${i}`),
    );
    const bounds = sceneBounds([item]);
    assert.ok(Math.abs(bounds.min.y - 0.75) < 1e-6);
    assert.ok(Math.abs((bounds.min.x + bounds.max.x) / 2 - 5) < 1e-6);
    assert.ok(Math.abs((bounds.min.z + bounds.max.z) / 2 - 6) < 1e-6);
    const ids = flattenNodes([item, createFurniture(c.id)]).map(
      (n) => n.node.id,
    );
    assert.equal(new Set(ids).size, ids.length);
    validateProject({
      ...createPlanProject(),
      scene: { objects: [item], view: defaultView() },
    });
  }
  assert.throws(() => createFurniture('desk', [NaN, 1, 1]), /Габариты/);
});

test('optional dimensions and clearance survive variants, undo/redo and JSON without changing old projects', () => {
  const original = createPlanProject(),
    project = clone(original);
  project.scene.measurements = [{ id: 'm1', from: [1, 2], to: [4, 6] }];
  project.scene.objects.push(createFurniture('office-chair'));
  assert.deepEqual(importProject(exportProject(project)), project);
  const variant = saveArrangement(project, 'С размерами');
  assert.deepEqual(
    loadArrangement(variant, variant.arrangements.at(-1)!.id).scene
      .measurements,
    project.scene.measurements,
  );
  const history = pushHistory(
    { past: [], present: original, future: [] },
    project,
  );
  assert.deepEqual(undoHistory(history).present, original);
  assert.deepEqual(redoHistory(undoHistory(history)).present, project);
  assert.ok(!('measurements' in original.scene));
  assert.ok(original.scene.objects.every((n) => !('clearance' in n)));
  assert.deepEqual(importProject(exportProject(original)), original);
});

test('invalid measurement/clearance extensions fail atomically with bounded limits', () => {
  const original = createPlanProject();
  for (const bad of [
    [{ id: 'x', from: [1, 1], to: [1, 1] }],
    [{ id: 'x', from: [NaN, 1], to: [2, 2] }],
    Array.from({ length: 101 }, (_, i) => ({
      id: String(i),
      from: [0, 0],
      to: [1, 1],
    })),
    [
      { id: 'x', from: [0, 0], to: [1, 1] },
      { id: 'x', from: [0, 0], to: [2, 2] },
    ],
  ]) {
    const project = clone(original);
    project.scene.measurements = bad as EditorProject['scene']['measurements'];
    assert.throws(() => validateProject(project));
  }
  const project = clone(original);
  project.scene.objects[0].clearance = { front: -1, back: 0 };
  assert.throws(() => validateProject(project));
  assert.deepEqual(original, createPlanProject());
});
