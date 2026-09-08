import test from 'node:test';
import assert from 'node:assert/strict';
import { Vector3 } from 'three';
import { createPlanProject } from '../lib/plan-project.ts';
import { baseNode } from '../lib/editor-seed.ts';
import {
  clone,
  findNode,
  flattenNodes,
  exportProject,
  importProject,
  validateProject,
  saveArrangement,
  loadArrangement,
  pushHistory,
  undoHistory,
  redoHistory,
} from '../lib/editor-model.ts';
import {
  nodeWorldMatrix,
  nodeMatrix,
  planDrawing,
} from '../lib/editor-geometry.ts';
import { analysisFootprints } from '../lib/plan-analysis.ts';
import { walkShapes } from '../lib/walkthrough.ts';
import {
  configureMechanism,
  configurePart,
  operateMechanisms,
  poseMechanism,
  mechanismCollisions,
  removeMechanisms,
} from '../lib/mechanisms.ts';
import type { MechanismPreset } from '../lib/renovation-types.ts';
const near = (a: number, b: number, eps = 1e-7) =>
  assert.ok(Math.abs(a - b) < eps, `${a} != ${b}`);
const matrixNear = (a: number[], b: number[]) =>
  a.forEach((n, i) => near(n, b[i]));
const motions = (p: ReturnType<typeof createPlanProject>, id: string) =>
  flattenNodes([findNode(p.scene.objects, id)!])
    .map((n) => n.node)
    .filter((n) => n.mechanism);

test('R17-2 hinge retains its world anchor through scaled/rotated parents, slides use local axes, repeated close is reversible', () => {
  const p = createPlanProject(),
    root = baseNode('operation-fixture', 'Тестовый шкаф', {
      kind: 'group',
      size: [2, 2, 1],
    });
  root.position = [12, 0.5, 4];
  root.rotation = [10, 37, 2];
  root.scale = [1.5, 0.9, 0.75];
  const leaf = baseNode('operation-leaf', 'Дверца', {
    kind: 'box',
    size: [0.6, 1.8, 0.02],
  });
  leaf.position = [0, 0.9, 0.5];
  leaf.rotation = [8, 10, 0];
  leaf.scale = [1.2, 0.9, 0.8];
  root.children.push(leaf);
  p.scene.objects.push(root);
  const configured = configurePart(p, leaf.id, {
    kind: 'hinge',
    axis: 'y',
    pivot: [-0.3, 0, 0],
    extent: -110,
    progress: 0,
  });
  const origin = nodeWorldMatrix(configured.scene.objects, leaf.id)!,
    fixed = new Vector3(-0.3, 0, 0).applyMatrix4(origin);
  let current = configured;
  for (const amount of [1, 0.37, 0.82, 0, 1, 0]) {
    current = operateMechanisms(current, leaf.id, amount);
    const point = new Vector3(-0.3, 0, 0).applyMatrix4(
      nodeWorldMatrix(current.scene.objects, leaf.id)!,
    );
    near(point.distanceTo(fixed), 0);
  }
  matrixNear(
    nodeWorldMatrix(current.scene.objects, leaf.id)!.elements,
    origin.elements,
  );
  const sliding = configurePart(p, leaf.id, {
    kind: 'slide',
    axis: 'z',
    pivot: [0, 0, 0],
    extent: 0.5,
    progress: 0,
  });
  const before = nodeWorldMatrix(sliding.scene.objects, leaf.id)!,
    expected = new Vector3(0, 0, 0.5).applyMatrix4(before);
  const opened = operateMechanisms(sliding, leaf.id, 1),
    actual = new Vector3().applyMatrix4(
      nodeWorldMatrix(opened.scene.objects, leaf.id)!,
    );
  near(actual.distanceTo(expected), 0);
  assert.throws(() => operateMechanisms(opened, leaf.id, 1.1));
});

test('R17-2 every supplied door closes in its opening and opens around its existing hinge without moving source walls or other furniture', () => {
  const source = createPlanProject();
  for (const { node: opening } of flattenNodes(source.scene.objects).filter(
    (x) => x.node.geometry.doorSwing,
  )) {
    const p = configureMechanism(source, opening.id, 'door');
    for (const leaf of motions(p, opening.id))
      matrixNear(
        nodeMatrix(leaf).elements,
        nodeMatrix(findNode(source.scene.objects, leaf.id)!).elements,
      );
    const closed = operateMechanisms(p, opening.id, 0),
      opened = operateMechanisms(p, opening.id, 1);
    for (const leaf of motions(closed, opening.id)) {
      near(leaf.rotation[1], 0);
      near(leaf.position[2], opening.geometry.doorSwing!.offset);
      const point = new Vector3(...leaf.mechanism!.pivot).applyMatrix4(
        nodeWorldMatrix(closed.scene.objects, leaf.id)!,
      );
      const other = findNode(opened.scene.objects, leaf.id)!;
      near(
        point.distanceTo(
          new Vector3(...other.mechanism!.pivot).applyMatrix4(
            nodeWorldMatrix(opened.scene.objects, leaf.id)!,
          ),
        ),
        0,
      );
      near(Math.abs(other.rotation[1]), 90);
    }
    const restore = operateMechanisms(opened, opening.id, 0.5);
    for (const leaf of motions(restore, opening.id))
      matrixNear(
        nodeMatrix(leaf).elements,
        nodeMatrix(findNode(source.scene.objects, leaf.id)!).elements,
      );
    for (const root of source.scene.objects.filter(
      (n) => n.category === 'furniture',
    ))
      assert.deepEqual(findNode(opened.scene.objects, root.id), root);
    assert.deepEqual(opened.arrangements, source.arrangements);
  }
  assert.equal(
    flattenNodes(source.scene.objects).filter((x) => x.node.mechanism).length,
    0,
  );
});

const presets: [MechanismPreset, string][] = [
  ['cabinet', 'plan-item-060'],
  ['drawer', 'plan-item-063'],
  ['fridge', 'plan-item-028'],
  ['dishwasher', 'plan-item-045'],
  ['oven', 'plan-item-054'],
  ['sofa', 'plan-item-024'],
];
for (const [preset, id] of presets)
  test(`R17-2 ${preset} source assembly operates in plan/solid geometry, preserves other roots and round-trips independently`, () => {
    const source = createPlanProject(),
      p = configureMechanism(source, id, preset),
      root = findNode(p.scene.objects, id)!;
    assert.ok(motions(p, id).length);
    assert.deepEqual(
      root.position,
      findNode(source.scene.objects, id)!.position,
    );
    assert.deepEqual(
      root.rotation,
      findNode(source.scene.objects, id)!.rotation,
    );
    const open = operateMechanisms(p, id, 1),
      again = operateMechanisms(open, id, 0);
    assert.notDeepEqual(
      planDrawing([findNode(open.scene.objects, id)!], open.scene.view),
      planDrawing([root], p.scene.view),
    );
    for (const { node } of flattenNodes([root]))
      matrixNear(
        nodeWorldMatrix(again.scene.objects, node.id)!.elements,
        nodeWorldMatrix(p.scene.objects, node.id)!.elements,
      );
    assert.deepEqual(importProject(exportProject(open)), validateProject(open));
    for (const other of source.scene.objects.filter((n) => n.id !== id))
      assert.deepEqual(findNode(open.scene.objects, other.id), other);
    const saved = saveArrangement(open, 'Открытая техника');
    assert.ok(saved.activeArrangement);
    assert.throws(() => configureMechanism(p, id, preset));
  });

test('R17-2 operating pose detects a blocked drawer/door and differs from full door sweep checks', () => {
  let p = createPlanProject();
  const sourceDoor = flattenNodes(p.scene.objects).find(
    (x) => x.node.geometry.doorSwing?.hinge === 'start',
  )!.node;
  p = configureMechanism(p, sourceDoor.id, 'door');
  const open = operateMechanisms(p, sourceDoor.id, 1),
    leaf = motions(open, sourceDoor.id)[0];
  const shape = analysisFootprints(open.scene.objects, 'solids').find(
    (s) => s.nodeId === leaf.id,
  )!;
  const c = shape.points.reduce(
    (p, q) => [
      p[0] + q[0] / shape.points.length,
      p[1] + q[1] / shape.points.length,
    ],
    [0, 0],
  );
  const blocker = baseNode('operation-blocker', 'Помеха двери', {
    kind: 'box',
    size: [0.12, 0.8, 0.12],
  });
  blocker.position = [c[0], 0.6, c[1]];
  open.scene.objects.push(blocker);
  assert.ok(
    mechanismCollisions(open.scene.objects, sourceDoor.id).some(
      (c) => c.obstacleId === blocker.id,
    ),
  );
  const closed = operateMechanisms(open, sourceDoor.id, 0);
  assert.ok(
    !mechanismCollisions(closed.scene.objects, sourceDoor.id).some(
      (c) => c.obstacleId === blocker.id,
    ),
  );
  assert.ok(walkShapes(open.scene.objects).some((s) => s.nodeId === leaf.id));
  assert.ok(
    !analysisFootprints(open.scene.objects).some((s) => s.nodeId === leaf.id),
  );
  assert.deepEqual(
    analysisFootprints(open.scene.objects).filter((s) => s.kind === 'door'),
    analysisFootprints(closed.scene.objects).filter((s) => s.kind === 'door'),
  );
});

test('R17-2 schema rejects unsafe mechanisms, locking/history/variant reload and manual pose freezing are preserved', () => {
  const source = createPlanProject(),
    id = 'plan-item-045',
    p = configureMechanism(source, id, 'dishwasher'),
    opened = operateMechanisms(p, id, 1);
  let history = pushHistory({ past: [], present: p, future: [] }, opened);
  assert.deepEqual(undoHistory(history).present, p);
  history = redoHistory(undoHistory(history));
  assert.deepEqual(history.present, opened);
  const a = saveArrangement(p, 'Закрыто'),
    b = saveArrangement(opened, 'Открыто');
  b.arrangements.push(a.arrangements.at(-1)!);
  const imported = importProject(exportProject(b));
  assert.equal(
    motions(loadArrangement(imported, a.activeArrangement!), id)[0].mechanism!
      .progress,
    0,
  );
  assert.equal(
    motions(loadArrangement(imported, b.activeArrangement!), id)[0].mechanism!
      .progress,
    1,
  );
  const frozen = removeMechanisms(opened, id);
  assert.equal(motions(frozen, id).length, 0);
  matrixNear(
    nodeWorldMatrix(frozen.scene.objects, motions(opened, id)[0].id)!.elements,
    nodeWorldMatrix(opened.scene.objects, motions(opened, id)[0].id)!.elements,
  );
  const locked = clone(p);
  findNode(locked.scene.objects, id)!.locked = true;
  assert.throws(() => operateMechanisms(locked, id, 1));
  for (const bad of [
    { extent: 0 },
    { extent: Infinity },
    { progress: 2 },
    { axis: 'q' },
    { pivot: [0, 0, NaN] },
  ]) {
    const altered = clone(p);
    Object.assign(motions(altered, id)[0].mechanism!, bad);
    assert.throws(() => validateProject(altered));
  }
  const part = clone(motions(p, id)[0]);
  assert.throws(() => poseMechanism(part, NaN));
  assert.deepEqual(validateProject(source), source);
});
