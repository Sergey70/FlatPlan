import test from 'node:test';
import assert from 'node:assert/strict';
import {
  apartment,
  rooms,
  roomArea,
  palettes,
  defaultOptions,
} from '../lib/apartment.ts';
import { parseViewPatch } from '../lib/view-state.ts';

test('demo rooms tile the apartment without overlaps, gaps or out-of-bounds rectangles', () => {
  assert.equal(new Set(rooms.map((room) => room.id)).size, rooms.length);
  for (const room of rooms) {
    assert.ok(room.width > 0 && room.depth > 0 && room.x >= 0 && room.z >= 0);
    assert.ok(room.x + room.width <= apartment.width + 1e-9);
    assert.ok(room.z + room.depth <= apartment.depth + 1e-9);
    for (const other of rooms) {
      if (room === other) continue;
      const x =
        Math.min(room.x + room.width, other.x + other.width) -
        Math.max(room.x, other.x);
      const z =
        Math.min(room.z + room.depth, other.z + other.depth) -
        Math.max(room.z, other.z);
      assert.ok(x <= 1e-9 || z <= 1e-9, `${room.id} overlaps ${other.id}`);
    }
  }
  assert.ok(
    Math.abs(
      rooms.reduce((sum, room) => sum + roomArea(room), 0) -
        apartment.width * apartment.depth,
    ) < 1e-9,
  );
});

test('every material theme supplies valid renderer colors and the default exists', () => {
  assert.ok(Object.hasOwn(palettes, defaultOptions.palette));
  for (const palette of Object.values(palettes))
    for (const key of ['wood', 'fabric', 'stone', 'wall', 'accent'] as const)
      assert.match(palette[key], /^#[\da-f]{6}$/i);
});

test('view changes accept false, all room/palette IDs, and reset to the entire apartment', () => {
  for (const room of rooms)
    assert.deepEqual(parseViewPatch({ room: room.id, labels: false }), {
      room: room.id,
      labels: false,
    });
  for (const palette of Object.keys(palettes))
    assert.deepEqual(parseViewPatch({ palette }), { palette });
  assert.deepEqual(parseViewPatch({ view: '2d', room: null, night: false }), {
    view: '2d',
    room: null,
    night: false,
  });
});

test('invalid view patches fail before a caller can apply partial state', () => {
  for (const input of [
    null,
    [],
    'natural',
    { room: 'kitchen' },
    { palette: 'toString' },
    { view: 'walkthrough' },
    { labels: 'false' },
    { night: 1 },
    { furniture: true, unexpected: true },
    JSON.parse('{"__proto__":{}}'),
  ])
    assert.throws(() => parseViewPatch(input));
  const original = { ...defaultOptions };
  assert.throws(() =>
    Object.assign(
      original,
      parseViewPatch({ labels: false, palette: 'missing' }),
    ),
  );
  assert.deepEqual(original, defaultOptions);
});

import { Vector3, PerspectiveCamera } from 'three';
import { apartmentBounds, fitCamera } from '../lib/camera-fit.ts';
import { createTapTracker } from '../lib/tap-tracker.ts';

test('whole-apartment view fits portrait phones, narrow tablets and wide desktops', () => {
  for (const aspect of [390 / 557, 519 / 911, 1, 1.6, 2.5]) {
    const fit = fitCamera(apartmentBounds, aspect);
    const camera = new PerspectiveCamera(36, aspect, 0.1, 100);
    camera.position.copy(fit.position);
    camera.lookAt(fit.target);
    camera.updateMatrixWorld();
    for (const x of [apartmentBounds.min[0], apartmentBounds.max[0]])
      for (const y of [apartmentBounds.min[1], apartmentBounds.max[1]])
        for (const z of [apartmentBounds.min[2], apartmentBounds.max[2]]) {
          const projected = new Vector3(x, y, z).project(camera);
          assert.ok(
            Math.abs(projected.x) <= 0.851 && Math.abs(projected.y) <= 0.701,
            `clipped corner at aspect ${aspect}: ${projected.toArray()}`,
          );
        }
  }
});

test('pinch, cancelled pointer, drag and right click do not select a room', () => {
  const taps = createTapTracker();
  taps.down(1, 10, 10, 0);
  taps.down(2, 40, 10, 0);
  assert.equal(taps.up(2, 40, 10), false);
  assert.equal(taps.up(1, 10, 10), false);
  taps.down(3, 10, 10, 0);
  taps.cancel(3);
  assert.equal(taps.up(3, 10, 10), false);
  taps.down(4, 10, 10, 0);
  assert.equal(taps.up(4, 30, 10), false);
  taps.down(5, 10, 10, 2);
  assert.equal(taps.up(5, 10, 10), false);
  taps.down(6, 10, 10, 0);
  assert.equal(taps.up(6, 12, 12), true);
});
