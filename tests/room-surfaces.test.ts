import test from 'node:test';
import assert from 'node:assert/strict';
import { baseNode, makeOpening } from '../lib/editor-seed.ts';
import { createPlanProject } from '../lib/plan-project.ts';
import { measuredRooms, measureSurfaces } from '../lib/room-surfaces.ts';
const near = (a: number, b: number, eps = 1e-6) =>
  assert.ok(Math.abs(a - b) < eps, `${a} != ${b}`);
const floor = (id: string, polygon: [number, number][]) => {
  const n = baseNode(
    id,
    `Пол — ${id}`,
    { kind: 'floor', size: [6, 0.04, 4], polygon, holes: [] },
    'structure',
  );
  n.position[1] = -0.04;
  return n;
};
test('R17-5/6 floor areas preserve concavity, holes, rotation and scale', () => {
  const n = floor('room', [
    [0, 0],
    [4, 0],
    [4, 2],
    [2, 2],
    [2, 4],
    [0, 4],
  ]);
  n.geometry.holes = [
    [
      [0.5, 0.5],
      [1.5, 0.5],
      [1.5, 1.5],
      [0.5, 1.5],
    ],
  ];
  near(measuredRooms([n])[0].floorArea, 11);
  n.scale = [1.5, 2, 0.8];
  n.rotation = [0, 37, 0];
  near(measuredRooms([n])[0].floorArea, 13.2);
});
test('R17-5/6 internal wall surfaces subtract actual windows and doors; skirting excludes floor openings only', () => {
  const room = floor('room', [
    [-3, 0.1],
    [3, 0.1],
    [3, 4],
    [-3, 4],
  ]);
  const wall = baseNode(
    'wall',
    'Стена',
    { kind: 'wall', size: [6, 2.7, 0.2] },
    'structure',
  );
  const door = makeOpening(0.8, 2.1, 0.2, 'door');
  door.position = [-1.5, 0, 0];
  const window = makeOpening(1.2, 1.4, 0.2, 'window');
  window.position = [1.2, 0.8, 0];
  wall.children = [door, window];
  const result = measureSurfaces({ objects: [room, wall] });
  near(result.rooms[0].wallArea, 6 * 2.7 - 0.8 * 2.1 - 1.2 * 1.4);
  near(result.rooms[0].skirting, 5.2);
  near(result.unassignedWallArea, result.rooms[0].wallArea);
  window.visible = false;
  near(
    measureSurfaces({ objects: [room, wall] }).rooms[0].wallArea,
    6 * 2.7 - 0.8 * 2.1,
  );
});
test('R17-5/6 one long wall is divided between room contours instead of assigned by its centroid', () => {
  const a = floor('a', [
      [-3, 0.1],
      [-1, 0.1],
      [-1, 3],
      [-3, 3],
    ]),
    b = floor('b', [
      [-1, 0.1],
      [3, 0.1],
      [3, 3],
      [-1, 3],
    ]);
  const wall = baseNode(
    'wall',
    'Стена',
    { kind: 'wall', size: [6, 2.7, 0.2] },
    'structure',
  );
  const result = measureSurfaces({ objects: [a, b, wall] });
  near(result.rooms.find((r) => r.id === 'a')!.wallArea, 2 * 2.7);
  near(result.rooms.find((r) => r.id === 'b')!.wallArea, 4 * 2.7);
  near(result.rooms.find((r) => r.id === 'a')!.skirting, 2);
  near(result.rooms.find((r) => r.id === 'b')!.skirting, 4);
});
test('R17-5/6 source room surfaces are finite, respect .plan areas and leave exterior sides out of interior totals', () => {
  const source = createPlanProject(),
    result = measureSurfaces(source.scene);
  const kitchen = result.rooms.find((r) => r.name === 'Кухня')!,
    bedroom = result.rooms.find((r) => r.name === 'Спальня')!;
  near(kitchen.floorArea, 21.43, 0.02);
  near(bedroom.floorArea, 13.55, 0.02);
  assert.ok(kitchen.wallArea > 25 && kitchen.skirting > 10);
  assert.ok(result.unassignedWallArea > 20);
  for (const room of result.rooms)
    assert.ok(
      Number.isFinite(room.wallArea) &&
        room.wallArea >= 0 &&
        room.skirting >= 0,
    );
  assert.deepEqual(source, createPlanProject());
});
