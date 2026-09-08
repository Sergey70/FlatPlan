import { defaultFinish } from '../lib/design-types.ts';
import test from 'node:test';
import assert from 'node:assert/strict';
import { clone, findNode } from '../lib/editor-model.ts';
import { baseNode } from '../lib/editor-seed.ts';
import { groupMany, rotateMany } from '../lib/arrangement-tools.ts';
import { designFixture } from './design-fixture.ts';
import { createPlanProject } from '../lib/plan-project.ts';
import {
  compareArrangements,
  comparisonObjects,
  comparisonBounds,
  arrangementMetrics,
} from '../lib/arrangement-comparison.ts';
test('R17-7 comparison detects moved/deleted/added walls and furniture and compares current transforms without changing either source', () => {
  const a = designFixture().scene,
    b = clone(a),
    before = clone(a);
  findNode(b.objects, 'design-a')!.position[0] += 0.4;
  findNode(b.objects, 'design-wall')!.geometry.size[1] = 3;
  b.objects = b.objects.filter((n) => n.id !== 'design-b');
  const added = baseNode('comparison-new', 'Новый предмет', {
    kind: 'box',
    size: [0.5, 1, 0.6],
  });
  added.position = [5, 0.5, 5];
  b.objects.push(added);
  const result = compareArrangements(a, b);
  assert.equal(result.length, 4);
  assert.equal(result.find((c) => c.id === 'design-a')!.kind, 'changed');
  assert.equal(result.find((c) => c.id === 'design-wall')!.kind, 'changed');
  assert.equal(result.find((c) => c.id === 'design-b')!.kind, 'removed');
  assert.equal(result.find((c) => c.id === added.id)!.kind, 'added');
  assert.deepEqual(a, before);
  assert.deepEqual(compareArrangements(a, a), []);
  findNode(b.objects, added.id)!.visible = false;
  assert.ok(!compareArrangements(a, b).some((c) => c.id === added.id));
});
test('R17-7 organizational groups preserve identities; rotation compares physical world transforms and aggregates parts', () => {
  const source = designFixture();
  const detail = baseNode('comparison-handle', 'Ручка', {
    kind: 'box',
    size: [0.03, 0.2, 0.02],
  });
  detail.position[2] = 0.51;
  findNode(source.scene.objects, 'design-a')!.children.push(detail);
  const grouped = groupMany(source, ['design-a', 'design-b']);
  assert.deepEqual(compareArrangements(source.scene, grouped.scene), []);
  const rotated = rotateMany(grouped, [grouped.scene.view.selected!], 45);
  const changes = compareArrangements(source.scene, rotated.scene);
  assert.deepEqual(
    new Set(changes.map((c) => c.id)),
    new Set(['design-a', 'design-b']),
  );
  const changedPart = clone(source.scene);
  findNode(changedPart.objects, detail.id)!.position[1] += 0.3;
  assert.deepEqual(
    compareArrangements(source.scene, changedPart).map((c) => c.id),
    ['design-a'],
  );
});
test('R17-7 material/palette and inherited visibility affect comparison; camera, locks and labels do not', () => {
  const a = designFixture().scene,
    b = clone(a),
    node = findNode(b.objects, 'design-a')!;
  b.view.camera = { position: [1, 8, 9], target: [3, 0, 3] };
  node.locked = true;
  node.name = 'Новая подпись';
  assert.deepEqual(compareArrangements(a, b), []);
  node.color = '#ff0000';
  assert.equal(compareArrangements(a, b)[0].kind, 'changed');
  node.visible = false;
  assert.equal(compareArrangements(a, b)[0].kind, 'removed');
  const source = createPlanProject().scene,
    themed = clone(source);
  themed.view.palette = 'contrast';
  assert.ok(compareArrangements(source, themed).length > 5);
});
test('R17-7 display tints are optional private copies, quantities use actual geometry, costs stay explicit and union bounds include both sides', () => {
  const a = designFixture().scene,
    b = clone(a);
  const table = findNode(b.objects, 'design-a')!;
  table.position[0] = 8;
  const before = clone(b);
  const changes = compareArrangements(a, b),
    display = comparisonObjects(b, changes, 'b', true);
  assert.notEqual(findNode(display, 'design-a')!.color, table.color);
  assert.deepEqual(findNode(display, 'design-a')!.position, table.position);
  assert.strictEqual(comparisonObjects(b, changes, 'b', false), b.objects);
  const bounds = comparisonBounds(a, b);
  assert.ok(bounds.max[0] >= 8.5);
  const metrics = arrangementMetrics(a, 0.8);
  assert.equal(metrics.floor, 36);
  assert.equal(metrics.total, 0);
  assert.ok(metrics.unpriced > 0);
  assert.ok(metrics.issues.some((i) => i.kind === 'gap'));
  assert.deepEqual(b, before);
});

test('R17-7 an explicit finish hides unused base colors and palette roles from the visual comparison', () => {
  const a = designFixture().scene,
    node = findNode(a.objects, 'design-a')!;
  node.role = 'wood';
  node.finish = defaultFinish('oak');
  const b = clone(a);
  findNode(b.objects, node.id)!.color = '#ff0000';
  assert.deepEqual(compareArrangements(a, b), []);
  findNode(b.objects, node.id)!.finish!.color = '#123456';
  assert.deepEqual(
    compareArrangements(a, b).map((c) => c.id),
    [node.id],
  );
});
