import test from 'node:test';
import assert from 'node:assert/strict';
import { Vector3 } from 'three';
import {
  createPlanProject,
  createPlanScene,
  planLayouts,
  applyPlanSource,
  hasPlanSource,
  DEFAULT_PLAN_ID,
} from '../lib/plan-project.ts';
import { createInitialProject as legacyProject } from '../lib/editor-seed.ts';
import {
  clone,
  findNode,
  flattenNodes,
  exportProject,
  importProject,
  editNode,
  type Vec3,
} from '../lib/editor-model.ts';
import {
  nodeWorldMatrix,
  wallProfile,
  wallBlocks,
  wallBlockGeometry,
  nodeDimensions,
  objectDimensions,
  resizeObject,
  planDrawing,
} from '../lib/editor-geometry.ts';
import { polygonArea } from '../lib/apartment.ts';
import { itemHeight, itemBottom } from '../lib/plan-furniture.ts';
const close = (a: number, b: number, tolerance = 1e-6) =>
  assert.ok(Math.abs(a - b) < tolerance, `${a} != ${b}`);

test('.plan import preserves all five drawings plus loose items and opens the right apartment', () => {
  const p = createPlanProject();
  assert.equal(p.activeArrangement, DEFAULT_PLAN_ID);
  assert.equal(p.arrangements.length, 6);
  assert.equal(
    p.scene.objects.filter((n) => n.geometry.kind === 'wall').length,
    37,
  );
  assert.equal(
    flattenNodes(p.scene.objects).filter(
      ({ node: n }) => n.geometry.openingType === 'window',
    ).length,
    4,
  );
  assert.equal(
    flattenNodes(p.scene.objects).filter(
      ({ node: n }) => n.geometry.openingType === 'door',
    ).length,
    5,
  );
  assert.equal(
    planLayouts.reduce((a, l) => a + l.walls.length, 0),
    106,
  );
  assert.equal(
    planLayouts.reduce((a, l) => a + l.items.length, 0),
    122,
  );
  assert.equal(p.arrangements.at(-1)!.scene.objects.length, 8);
  assert.deepEqual(importProject(exportProject(p)), p);
});
test('every wall centreline, mitred corner, opening span and sill matches source coordinates', () => {
  for (const layout of planLayouts) {
    const scene = createPlanScene(layout);
    for (const wall of layout.walls) {
      const node = findNode(scene.objects, `plan-${wall.id}`)!;
      const matrix = nodeWorldMatrix(scene.objects, node.id)!;
      close(node.geometry.size[1], 2.7);
      close(node.geometry.size[2], wall.thickness / 100);
      const corners = wallProfile(node).map(([x, z]) =>
        new Vector3(x, 0, z).applyMatrix4(matrix),
      );
      corners.forEach((p, i) => {
        close(p.x, wall.profile[i][0] / 100);
        close(p.z, wall.profile[i][1] / 100);
      });
      const span = node.geometry.size[0];
      for (const [x, point] of [
        [-span / 2, wall.start],
        [span / 2, wall.end],
      ] as [number, [number, number]][]) {
        const p = new Vector3(x, 0, 0).applyMatrix4(matrix);
        close(p.x, point[0] / 100);
        close(p.z, point[1] / 100);
      }
      for (const hole of wall.holes) {
        const opening = findNode(node.children, `plan-${hole.id}`)!;
        const p = new Vector3(...opening.position).applyMatrix4(matrix);
        close(p.x, hole.center[0] / 100);
        close(p.z, hole.center[1] / 100);
        close(p.y, hole.bottom / 100);
        close(opening.geometry.size[0], hole.width / 100);
        close(opening.geometry.size[1], hole.height / 100);
        assert.equal(
          opening.geometry.openingType,
          hole.group === 'windows' ? 'window' : 'door',
        );
      }
      for (const block of wallBlocks(node)) {
        assert.ok(block.profile && polygonArea(block.profile) > 0);
        const geometry = wallBlockGeometry(block);
        geometry.computeBoundingBox();
        assert.ok(Number.isFinite(geometry.boundingBox!.min.x));
        geometry.dispose();
      }
    }
  }
});
test('all recorded furniture footprints, rotations, nonzero heights and mounting levels survive conversion', () => {
  for (const layout of planLayouts) {
    const scene = createPlanScene(layout);
    for (const item of layout.items) {
      const node = findNode(scene.objects, `plan-${item.id}`)!;
      assert.deepEqual(node.position, [
        item.center[0] / 100,
        itemBottom(item, layout.height / 100),
        item.center[1] / 100,
      ]);
      close(node.rotation[1], -item.angle);
      const dimensions = nodeDimensions(node);
      close(dimensions[0], item.width / 100, 2e-6);
      close(dimensions[2], item.depth / 100, 2e-6);
      close(dimensions[1], itemHeight(item), 2e-6);
    }
  }
});
test('room polygons keep source areas and small service contours do not become room labels', () => {
  for (const layout of planLayouts) {
    const scene = createPlanScene(layout);
    for (const room of layout.rooms) {
      const node = findNode(scene.objects, `plan-floor-${room.id}`)!;
      assert.deepEqual(
        node.geometry.polygon,
        room.polygon.map((p) => p.map((n) => n / 100)),
      );
      close(polygonArea(node.geometry.polygon!), room.area, 0.00501);
      assert.equal(node.geometry.kind, room.micro ? 'solid' : 'floor');
    }
  }
});
test('profiled wall resizing scales mitres and keeps openings independently editable through JSON', () => {
  let p = createPlanProject();
  const wall = p.scene.objects.find(
    (n) => n.geometry.kind === 'wall' && n.children.length,
  )!;
  const before = clone(wall);
  const wanted: Vec3 = [wall.geometry.size[0] + 0.5, 2.9, 0.15];
  p = editNode(p, wall.id, (n) => resizeObject(p.scene.objects, n, wanted));
  const changed = findNode(p.scene.objects, wall.id)!;
  assert.deepEqual(changed.geometry.wallProfile, before.geometry.wallProfile);
  assert.deepEqual(changed.children, before.children);
  objectDimensions(p.scene.objects, changed).forEach((d, i) =>
    close(d, wanted[i]),
  );
  assert.deepEqual(importProject(exportProject(p)), p);
  const projected = planDrawing(p.scene.objects, p.scene.view);
  assert.equal(projected.filter((p) => p.kind === 'opening').length, 4);
});
test('source upgrade preserves every old variant and the complete current scene, with bounded failure', () => {
  const old = legacyProject();
  old.name = 'Личный проект';
  const before = clone(old);
  const p = applyPlanSource(old);
  assert.deepEqual(old, before);
  assert.ok(hasPlanSource(p));
  assert.equal(p.name, old.name);
  assert.equal(p.activeArrangement, DEFAULT_PLAN_ID);
  for (const a of old.arrangements)
    assert.deepEqual(
      p.arrangements.find((b) => b.id === a.id),
      a,
    );
  assert.deepEqual(
    p.arrangements.find((a) => a.name === 'До обновления по файлу .plan')!
      .scene,
    old.scene,
  );
  // Deleting all starter variants is a user edit, not a reason to repeat the upgrade on reload.
  const empty = clone(p);
  empty.arrangements = [];
  empty.activeArrangement = null;
  assert.ok(hasPlanSource(importProject(exportProject(empty))));
  const again = applyPlanSource(p);
  for (const a of p.arrangements)
    assert.ok(
      again.arrangements.some(
        (b) => JSON.stringify(b.scene) === JSON.stringify(a.scene),
      ),
    );
  const full = clone(old);
  full.arrangements = Array.from({ length: 30 }, (_, i) => ({
    ...clone(old.arrangements[0]),
    id: `v-${i}`,
  }));
  full.activeArrangement = 'v-0';
  const snapshot = clone(full);
  assert.throws(() => applyPlanSource(full), /30/);
  assert.deepEqual(full, snapshot);
});
