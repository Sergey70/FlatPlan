import test from 'node:test';
import assert from 'node:assert/strict';
import previous from './fixtures/plan-009.json' with { type: 'json' };
import {
  createPlanProject,
  applyPlanSource,
  PLAN_REVISION,
  DEFAULT_PLAN_ID,
  planLayouts,
} from '../lib/plan-project.ts';
import {
  clone,
  findNode,
  flattenNodes,
  validateProject,
  exportProject,
  importProject,
} from '../lib/editor-model.ts';
import {
  doorSwingArcs,
  roomLabelPosition,
  nodeWorldMatrix,
} from '../lib/editor-geometry.ts';
import { Vector3 } from 'three';
import { baseNode } from '../lib/editor-seed.ts';
import { planDrawing } from '../lib/editor-geometry.ts';
import { polygonArea } from '../lib/apartment.ts';
const close = (a: number, b: number) =>
  assert.ok(Math.abs(a - b) < 1e-7, `${a} != ${b}`);

test('2D round furniture uses the mesh silhouette instead of a rectangular bounding box', () => {
  const table = baseNode('round-table', 'Круглый стол', {
    kind: 'cylinder',
    size: [1, 0.1, 1],
  });
  table.position = [2, 0.7, 3];
  const [part] = planDrawing([table], { palette: 'natural', furniture: true });
  assert.ok(part.points.length > 12);
  assert.ok(Math.abs(polygonArea(part.points) - Math.PI / 4) < 0.01);
  for (const [x, z] of part.points) close(Math.hypot(x - 2, z - 3), 0.5);
});

test('actual PLAN-009 saved geometry updates to the matching new source, including deletion and reload', () => {
  const old = validateProject(previous),
    before = clone(old);
  const actual = applyPlanSource(old),
    seed = createPlanProject();
  assert.deepEqual(old, before);
  assert.equal(actual.sourceRevision, PLAN_REVISION);
  assert.equal(actual.arrangements.length, 4);
  for (const a of actual.arrangements) {
    const expected = seed.arrangements.find((b) => b.id === a.id)!;
    for (const node of a.scene.objects)
      assert.deepEqual(node, findNode(expected.scene.objects, node.id));
  }
  for (const node of actual.scene.objects)
    assert.deepEqual(node, findNode(seed.scene.objects, node.id));
  assert.deepEqual(importProject(exportProject(actual)), actual);
  const retired = old.arrangements.at(-1)!;
  old.activeArrangement = retired.id;
  old.scene = clone(retired.scene);
  assert.equal(applyPlanSource(old).activeArrangement, DEFAULT_PLAN_ID);
});

test('source refresh preserves changed positions, dimensions, materials, deletions and custom loose objects', () => {
  const old = validateProject(previous);
  const edited = findNode(old.scene.objects, 'plan-item-068')!;
  edited.position[0] += 0.32;
  edited.children[0].color = '#123456';
  const wall = findNode(old.scene.objects, 'plan-wall-097')!;
  wall.geometry.size[1] = 2.93;
  old.scene.view.palette = 'contrast';
  const custom = clone(old.arrangements.at(-1)!);
  custom.scene.objects[0].position[0] += 1;
  old.arrangements[old.arrangements.length - 1] = custom;
  const deletedId = old.scene.objects.find(
    (n) => n.geometry.kind === 'floor',
  )!.id;
  old.scene.objects = old.scene.objects.filter((n) => n.id !== deletedId);
  const result = applyPlanSource(old);
  const item = findNode(result.scene.objects, edited.id)!;
  assert.deepEqual(item.position, edited.position);
  assert.equal(item.children[0].color, '#123456');
  close(item.geometry.size[0], 0.5023800000000001);
  assert.equal(findNode(result.scene.objects, wall.id)!.geometry.size[1], 2.93);
  assert.equal(result.scene.view.palette, 'contrast');
  assert.equal(findNode(result.scene.objects, deletedId), undefined);
  assert.deepEqual(result.arrangements.at(-1), custom);
  const saved = result.arrangements.find((a) => a.id === DEFAULT_PLAN_ID)!;
  assert.deepEqual(
    findNode(saved.scene.objects, edited.id),
    findNode(createPlanProject().scene.objects, edited.id),
  );
});

test('source room-label anchors survive transforms and JSON, including concave kitchen and bedroom', () => {
  const p = createPlanProject();
  for (const room of planLayouts[0].rooms.filter((r) => !r.micro)) {
    const node = findNode(p.scene.objects, `plan-floor-${room.id}`)!;
    assert.deepEqual(
      roomLabelPosition(node),
      room.center.map((n) => n / 100),
    );
    node.position[0] = 1.2;
    node.position[2] = -0.6;
    node.rotation[1] = 90;
    const anchor = roomLabelPosition(node);
    close(anchor[0], room.center[1] / 100 + 1.2);
    close(anchor[1], -room.center[0] / 100 - 0.6);
  }
  assert.deepEqual(importProject(exportProject(p)), p);
  const invalid = clone(p);
  invalid.scene.objects[0].geometry.labelAnchor = [Infinity, 0];
  assert.throws(() => validateProject(invalid));
});

test('door hinge ends, swing sides, leaves and frame offsets reproduce the supplied drawing', () => {
  const p = createPlanProject();
  const doors = flattenNodes(p.scene.objects).filter(
    ({ node }) => node.geometry.doorSwing,
  );
  assert.equal(doors.length, 6); // Five doors plus paired balcony doors.
  for (const { node } of doors) {
    const arcs = doorSwingArcs(node),
      swing = node.geometry.doorSwing!;
    assert.equal(arcs.length, swing.hinge === 'both' ? 2 : 1);
    assert.equal(
      node.children.filter((c) => c.name === 'Дверное полотно').length,
      arcs.length,
    );
    const radius = node.geometry.size[0] / arcs.length;
    for (const arc of arcs) {
      close(arc[0][1], swing.offset);
      close(arc.at(-1)![1] - arc[0][1], radius * swing.side);
    }
    assert.equal(node.position[2], 0); // Cutout stays in the wall centre plane.
  }
  for (const [id, side, hinge] of [
    ['plan-opening-094-1', -1, 'start'], // Entrance: upper hinge, outward to the right.
    ['plan-opening-097-1', -1, 'start'], // Bedroom: lower hinge, inward to the left.
    ['plan-opening-044-1', 1, 'both'], // Closet: both leaves towards the corridor.
  ] as const) {
    const door = findNode(p.scene.objects, id)!;
    assert.equal(door.geometry.doorSwing!.side, side);
    assert.equal(door.geometry.doorSwing!.hinge, hinge);
  }
  for (const wall of planLayouts[0].walls)
    for (const hole of wall.holes) {
      const node = findNode(p.scene.objects, `plan-${hole.id}`)!;
      if (!node.geometry.doorSwing) continue;
      const frame = new Vector3(
        0,
        0,
        node.geometry.doorSwing.offset,
      ).applyMatrix4(nodeWorldMatrix(p.scene.objects, node.id)!);
      close(frame.x, hole.frameCenter[0] / 100);
      close(frame.z, hole.frameCenter[1] / 100);
    }
});

test('both beds retain source footprints with the head on the short end beside the nightstands', () => {
  const p = createPlanProject();
  for (const item of planLayouts[0].items.filter((i) =>
    /^bed_(single|double)$/.test(i.type),
  )) {
    const node = findNode(p.scene.objects, `plan-${item.id}`)!;
    const head = node.children.find((n) => n.name === 'Изголовье')!;
    const position = new Vector3().applyMatrix4(
      nodeWorldMatrix(p.scene.objects, head.id)!,
    );
    assert.ok(position.z < node.position[2] - 0.8);
    assert.equal(node.geometry.size[0], item.width / 100);
    assert.equal(node.geometry.size[2], item.depth / 100);
  }
});
