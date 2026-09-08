import test from 'node:test';
import assert from 'node:assert/strict';
import { Vector3 } from 'three';
import previousSofa from './fixtures/kitchen-sofa-010.json' with { type: 'json' };
import {
  createPlanProject,
  applyPlanSource,
  PLAN_REVISION,
  DEFAULT_PLAN_ID,
} from '../lib/plan-project.ts';
import {
  clone,
  findNode,
  validateProject,
  exportProject,
  importProject,
} from '../lib/editor-model.ts';
import { nodeWorldMatrix } from '../lib/editor-geometry.ts';
const sofaId = 'plan-item-024';

test('kitchen sofa back meets the source partition attachment and seats face into the kitchen', () => {
  const p = createPlanProject(),
    sofa = findNode(p.scene.objects, sofaId)!;
  const back = sofa.children.find((n) => n.name === 'Спинка')!;
  const world = new Vector3().applyMatrix4(
    nodeWorldMatrix(p.scene.objects, back.id)!,
  );
  // Independently transcribed source projection.y (60.567 cm), normalized by -545.3698 cm.
  const rearEdge = (60.567 + 545.3698) / 100;
  assert.ok(Math.abs(world.z - back.geometry.size[2] / 2 - rearEdge) < 1e-9);
  for (const seat of sofa.children.filter(
    (n) => n.name === 'Подушка сиденья',
  )) {
    const position = new Vector3().applyMatrix4(
      nodeWorldMatrix(p.scene.objects, seat.id)!,
    );
    assert.ok(position.z > sofa.position[2]);
    assert.ok(position.z > world.z);
  }
  const { children, ...root } = sofa;
  const { children: oldChildren, ...oldRoot } = previousSofa;
  assert.deepEqual(root, oldRoot); // Placement, dimensions, rotation and style stay exact.
  for (const child of children) {
    const old = oldChildren.find((n) => n.id === child.id)!;
    if (['Спинка', 'Подушка сиденья'].includes(child.name)) {
      assert.deepEqual({ ...child, position: old.position }, old);
      assert.deepEqual(child.position, [
        old.position[0],
        old.position[1],
        -old.position[2],
      ]);
    } else assert.deepEqual(child, old);
  }
});

test('PLAN-010 sofa update preserves current/saved user edits and older source upgrades', () => {
  for (const revision of ['plan-008', 'plan-009', 'plan-010']) {
    const old = createPlanProject();
    old.sourceRevision = revision;
    const right = old.arrangements.find((a) => a.id === DEFAULT_PLAN_ID)!;
    for (const scene of [old.scene, right.scene])
      scene.objects = scene.objects.map((n) =>
        n.id === sofaId ? clone(previousSofa) : n,
      ) as typeof scene.objects;
    const sofa = findNode(old.scene.objects, sofaId)!;
    sofa.position[0] += 0.2;
    sofa.rotation[1] = 175;
    sofa.scale[0] = 1.1;
    sofa.children[1].color = '#123456';
    old.scene.view.palette = 'contrast';
    const before = clone(old),
      updated = applyPlanSource(validateProject(old));
    assert.deepEqual(old, before);
    assert.equal(updated.sourceRevision, PLAN_REVISION);
    assert.equal(updated.arrangements.length, old.arrangements.length);
    const expected = clone(old);
    const canonical = findNode(createPlanProject().scene.objects, sofaId)!;
    for (const scene of [
      expected.scene,
      expected.arrangements.find((a) => a.id === DEFAULT_PLAN_ID)!.scene,
    ]) {
      const target = findNode(scene.objects, sofaId)!;
      for (const child of target.children)
        child.position = clone(
          canonical.children.find((n) => n.id === child.id)!.position,
        );
    }
    expected.sourceRevision = PLAN_REVISION;
    assert.deepEqual(updated, expected);
    assert.deepEqual(importProject(exportProject(updated)), updated);
  }
  const customized = createPlanProject();
  customized.sourceRevision = 'plan-010';
  const back = findNode(customized.scene.objects, sofaId)!.children[1];
  back.position[2] = 0.3;
  assert.equal(
    findNode(applyPlanSource(customized).scene.objects, sofaId)!.children[1]
      .position[2],
    0.3,
  );
});
