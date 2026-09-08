import test from 'node:test';
import assert from 'node:assert/strict';
import { createPlanProject } from '../lib/plan-project.ts';
import { createRoomProposalProject } from '../lib/room-proposal.ts';
import { presentationViews } from '../lib/presentation-views.ts';
import { measuredRooms, roomContains } from '../lib/room-surfaces.ts';
import { analysisFootprints } from '../lib/plan-analysis.ts';
import { canStand } from '../lib/walkthrough.ts';
import { clone } from '../lib/editor-model.ts';
import { baseNode } from '../lib/editor-seed.ts';
test('R17-1 four distinct free room viewpoints use actual source and furnished proposal without modifying them', () => {
  for (const project of [createPlanProject(), createRoomProposalProject()]) {
    const before = clone(project);
    for (const room of measuredRooms(project.scene.objects)) {
      const shots = presentationViews(project.scene, room.id);
      assert.equal(shots.length, 4, room.name);
      const obstacles = analysisFootprints(
        project.scene.objects,
        'solids',
      ).filter(
        (s) =>
          (s.kind === 'wall' || s.kind === 'furniture') &&
          s.maxY > room.elevation + 0.12 &&
          s.minY < room.elevation + 1.65,
      );
      for (const shot of shots) {
        const [x, y, z] = shot.camera.position;
        assert.ok(roomContains(room, [x, z]));
        assert.ok(canStand(obstacles, [x, z], 0.13));
        assert.ok(Math.abs(y - room.elevation - 1.55) < 1e-6);
        assert.ok(
          roomContains(room, [shot.camera.target[0], shot.camera.target[2]]),
        );
      }
      assert.equal(
        new Set(shots.map((s) => JSON.stringify(s.camera.position))).size,
        4,
      );
    }
    assert.deepEqual(project, before);
  }
});
test('R17-1 moved furniture displaces proposed cameras; blocked rooms do not invent viewpoints', () => {
  const project = createPlanProject(),
    room = measuredRooms(project.scene.objects).find(
      (r) => r.name === 'Спальня',
    )!;
  const shots = presentationViews(project.scene, room.id),
    box = baseNode('camera-block', 'Шкаф', { kind: 'box', size: [1, 2.6, 1] });
  box.position = [
    shots[0].camera.position[0],
    1.3,
    shots[0].camera.position[2],
  ];
  project.scene.objects.push(box);
  assert.notDeepEqual(
    presentationViews(project.scene, room.id)[0].camera.position,
    shots[0].camera.position,
  );
  box.geometry.size = [100, 20, 100];
  box.position = [0, 0, 0];
  assert.equal(presentationViews(project.scene, room.id).length, 0);
  assert.equal(presentationViews(project.scene, 'unknown').length, 0);
});
test('R17-1 kitchen cameras stay in the main room and look through its actual L-shaped contour', () => {
  const project = createPlanProject(),
    room = measuredRooms(project.scene.objects).find(
      (r) => r.name === 'Кухня',
    )!;
  for (const shot of presentationViews(project.scene, room.id)) {
    assert.ok(shot.camera.position[2] > 5.8);
    assert.ok(
      shot.camera.position[0] < 4.35,
      'The source kitchen view must stay out of the narrow entry passage.',
    );
    for (let i = 0; i < 11; i++) {
      const t = i / 10;
      assert.ok(
        roomContains(room, [
          shot.camera.position[0] +
            (shot.camera.target[0] - shot.camera.position[0]) * t,
          shot.camera.position[2] +
            (shot.camera.target[2] - shot.camera.position[2]) * t,
        ]),
      );
    }
  }
});
