import test from 'node:test';
import assert from 'node:assert/strict';
import {
  apartment,
  rooms,
  roomArea,
  roomModelArea,
  roomContains,
  walls,
  wallLength,
  wallPoint,
  palettes,
  defaultOptions,
} from '../lib/apartment.ts';
import { createFloorGeometry } from '../lib/apartment-geometry.ts';
import { parseViewPatch } from '../lib/view-state.ts';

test('passport areas distinguish the physical loggia from its accounted area', () => {
  const area = (id: string) => roomArea(rooms.find((room) => room.id === id)!);
  assert.ok(
    Math.abs(area('living') + area('bedroom') - apartment.livingArea) < 1e-9,
  );
  assert.ok(
    Math.abs(
      area('living') +
        area('bedroom') +
        area('bathroom') -
        apartment.insideArea,
    ) < 1e-9,
  );
  const loggia = rooms.find((room) => room.id === 'balcony')!;
  assert.equal(loggia.reportedArea, 3.4);
  assert.equal(loggia.accountedArea, 2.4);
  assert.equal(
    apartment.insideArea + loggia.accountedArea!,
    apartment.accountedArea,
  );
  assert.equal(apartment.accountedArea, 60.5);
  assert.equal(apartment.approximate, true);
  assert.equal(defaultOptions.furniture, false);
});

test('room footprints exclude the bathroom corner, service enclosure and column', () => {
  const room = (id: string) => rooms.find((room) => room.id === id)!;
  assert.ok(roomContains(room('living'), [3, 5]));
  assert.ok(!roomContains(room('living'), [6, 8]));
  assert.ok(!roomContains(room('living'), [4.2, 5.8]));
  assert.ok(!roomContains(room('living'), [0.15, 5.8]));
  assert.ok(roomContains(room('bathroom'), [6, 8]));
  assert.ok(!roomContains(room('bathroom'), [4.4, 8]));
  assert.ok(roomContains(room('balcony'), [0.5, 1]));
  assert.ok(roomContains(room('bedroom'), [3, 1]));
  // Bounds may overlap for concave rooms; actual occupied areas must not.
  for (let x = -0.1; x < 7.3; x += 0.07)
    for (let z = -0.2; z < 9.2; z += 0.07) {
      const occupied = rooms.filter((room) => roomContains(room, [x, z]));
      assert.ok(occupied.length <= 1, `Overlapping floors at ${x},${z}`);
    }
});

test('rendered floor triangles preserve concavities, holes, meter scale and upward normals', () => {
  for (const room of rooms) {
    const geometry = createFloorGeometry(room);
    const positions = geometry.getAttribute('position'),
      normals = geometry.getAttribute('normal');
    const index = geometry.getIndex()!;
    let area = 0;
    for (let i = 0; i < index.count; i += 3) {
      const a = new Vector3().fromBufferAttribute(positions, index.getX(i));
      const b = new Vector3().fromBufferAttribute(positions, index.getX(i + 1));
      const c = new Vector3().fromBufferAttribute(positions, index.getX(i + 2));
      const center = a.clone().add(b).add(c).divideScalar(3);
      assert.ok(
        roomContains(room, [center.x, center.z]),
        `${room.id}: triangle outside usable floor`,
      );
      area += b.clone().sub(a).cross(c.clone().sub(a)).length() / 2;
    }
    assert.ok(Math.abs(area - roomModelArea(room)) < 0.0001);
    // Areas transcribed from the document are authoritative; rounded dimensions need not reproduce them exactly.
    assert.ok(Math.abs(area - room.reportedArea) < 0.3);
    for (let i = 0; i < positions.count; i++) {
      assert.ok(Math.abs(positions.getY(i)) < 1e-6);
      assert.ok(normals.getY(i) > 0.999);
    }
    geometry.dispose();
  }
});

test('wall openings are valid and connect the intended spaces', () => {
  for (const wall of walls) {
    assert.ok(wall.thickness > 0 && wallLength(wall) > 0);
    let end = 0;
    for (const opening of wall.openings) {
      assert.ok(
        opening.from >= end &&
          opening.from < opening.to &&
          opening.to <= wallLength(wall),
      );
      assert.ok(
        opening.bottom >= 0 &&
          opening.bottom < opening.top &&
          opening.top <= apartment.ceiling,
      );
      end = opening.to;
    }
  }
  for (const [id, expected] of [
    ['bedroom-divider', ['bedroom', 'living']],
    ['balcony-door', ['balcony', 'bedroom']],
    ['bathroom-top', ['bathroom', 'living']],
    ['east', ['living']],
  ] as const) {
    const wall = walls.find((wall) => wall.id === id)!;
    const opening = wall.openings.find((opening) => opening.kind === 'door')!;
    const [x, z] = wallPoint(wall, (opening.from + opening.to) / 2);
    const offset = wall.thickness / 2 + 0.04;
    const dx = ((wall.to[1] - wall.from[1]) / wallLength(wall)) * offset;
    const dz = (-(wall.to[0] - wall.from[0]) / wallLength(wall)) * offset;
    const adjacent = [
      ...new Set(
        rooms
          .filter(
            (room) =>
              roomContains(room, [x + dx, z + dz]) ||
              roomContains(room, [x - dx, z - dz]),
          )
          .map((room) => room.id),
      ),
    ].sort();
    assert.deepEqual(adjacent, [...expected].sort(), id);
  }
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
    { room: 'hall' },
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
