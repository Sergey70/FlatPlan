import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Vector3 } from 'three';
import { createPlanProject, planLayouts } from '../lib/plan-project.ts';
import { validateProject, findNode } from '../lib/editor-model.ts';
import { sceneBounds } from '../lib/editor-geometry.ts';
import { polygonContains } from '../lib/apartment.ts';
import {
  createRoomProposalScene,
  createRoomProposalProject,
  createGalleryScene,
  ROOM_REPLACED_IDS,
  ROOM_PROPOSAL_ID,
  ROOM_PROPOSAL_REVISION,
} from '../lib/room-proposal.ts';
import { renderGalleryPlan } from '../scripts/export-gallery-plans.mjs';
import { gallerySceneKey } from '../scripts/gallery-scene-key.mjs';

test('room proposal preserves source geometry, bed, all other rooms and original arrangements', () => {
  const original = createPlanProject();
  const before = structuredClone(original);
  const proposal = createRoomProposalScene();
  for (const node of original.scene.objects) {
    assert.deepEqual(
      proposal.objects.find((n) => n.id === node.id),
      ROOM_REPLACED_IDS.includes(node.id) ? undefined : node,
      node.id,
    );
  }
  assert.deepEqual(original, before);
  assert.deepEqual(createPlanProject(), before);
  for (const shot of ['kitchen', 'kitchen-reverse', 'bedroom'])
    assert.deepEqual(createGalleryScene('plan-2', shot), original.scene);
  for (const shot of ['room', 'overview'])
    assert.deepEqual(createGalleryScene('plan-2', shot), proposal);
  const project = createRoomProposalProject();
  assert.equal(project.activeArrangement, ROOM_PROPOSAL_ID);
  assert.deepEqual(
    project.scene,
    validateProject({ ...original, scene: proposal }).scene,
  );
  assert.deepEqual(project.arrangements.slice(0, 4), original.arrangements);
  assert.deepEqual(
    validateProject(JSON.parse(JSON.stringify(project))),
    project,
  );
  assert.deepEqual(project.scene, project.arrangements.at(-1)!.scene);
  assert.equal(
    gallerySceneKey(
      JSON.parse(
        readFileSync(
          new URL(
            `../public/gallery/${ROOM_PROPOSAL_REVISION}/room-workspace.json`,
            import.meta.url,
          ),
          'utf8',
        ),
      ),
    ),
    gallerySceneKey(project),
  );
  assert.equal(
    readFileSync(
      new URL(
        `../public/gallery/${ROOM_PROPOSAL_REVISION}/plans/plan-2.svg`,
        import.meta.url,
      ),
      'utf8',
    ),
    renderGalleryPlan('plan-2', true),
  );
});

test('desk and chair face each other, screens are sideways to glazing and circulation stays clear', () => {
  const scene = createRoomProposalScene();
  const desk = findNode(scene.objects, 'plan-proposal-desk')!;
  const chair = findNode(scene.objects, 'plan-proposal-chair')!;
  assert.deepEqual(desk.geometry.size, [1.6, 0.75, 0.7]);
  const facing = new Vector3(0, 0, 1).applyAxisAngle(
    new Vector3(0, 1, 0),
    (chair.rotation[1] * Math.PI) / 180,
  );
  const towardsDesk = new Vector3()
    .fromArray(desk.position)
    .sub(new Vector3().fromArray(chair.position))
    .normalize();
  assert.ok(
    facing.dot(towardsDesk) > 0.999,
    'Chair faces desk, not the walkway',
  );
  const layout = planLayouts.find((l) => l.id === 'plan-2')!;
  const room = layout.rooms.find((r) => r.area === 14.91)!;
  const glazing = layout.walls
    .flatMap((w) => w.holes)
    .find((h) => h.id === 'opening-089-1')!;
  const tangent = new Vector3(
    glazing.toPoint[0] - glazing.fromPoint[0],
    0,
    glazing.toPoint[1] - glazing.fromPoint[1],
  ).normalize();
  const glazingNormal = new Vector3(tangent.z, 0, -tangent.x);
  const monitors = scene.objects.filter((n) =>
    /^proposal-monitor-\d$/.test(n.id),
  );
  assert.equal(monitors.length, 2);
  for (const monitor of monitors) {
    const screenNormal = new Vector3(0, 0, 1).applyAxisAngle(
      new Vector3(0, 1, 0),
      (monitor.rotation[1] * Math.PI) / 180,
    );
    assert.ok(
      Math.abs(screenNormal.dot(glazingNormal)) < 0.01,
      'Screens perpendicular to glazing',
    );
    assert.ok(
      screenNormal.dot(facing) < -0.999,
      'Screens face the seated user',
    );
    const box = sceneBounds([monitor], true);
    assert.ok(
      box.min.y >= 0.75 && box.max.y < 1.4,
      'Monitors supported on the desk',
    );
  }
  const added = scene.objects.filter(
    (n) => !createPlanProject().scene.objects.some((s) => s.id === n.id),
  );
  for (const node of added) {
    const box = sceneBounds([node], true);
    for (const x of [box.min.x, box.max.x])
      for (const z of [box.min.z, box.max.z])
        assert.ok(polygonContains(room.polygon, [x * 100, z * 100]), node.name);
    assert.ok(
      box.min.x > 2.5 && box.max.x < 4.3,
      'Clear of balcony door swing and entrance',
    );
    assert.ok(box.max.z < 1.85, 'At least 1.05 m passage to the opposite wall');
  }
  assert.ok(
    !sceneBounds([desk], true).intersectsBox(sceneBounds([chair], true)),
    'Chair outside desk footprint',
  );
  assert.ok(findNode(scene.objects, 'proposal-computer'));
});
