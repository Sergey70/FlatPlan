import test from 'node:test';
import assert from 'node:assert/strict';
import { Box3, Vector3 } from 'three';
import {
  walls,
  rooms,
  wallPoint,
  polygonContains,
  polygonArea,
  roomModelArea,
  roomContains,
} from '../lib/apartment.ts';
import {
  createInitialProject,
  createOpenProject,
  PARTITION_WALL_IDS,
  PARTITION_PRESET_ID,
  togglePartitionWalls,
  applyPartitionedPreset,
  catalogObject,
} from '../lib/editor-seed.ts';
import {
  clone,
  findNode,
  editNode,
  removeNode,
  exportProject,
  importProject,
  pushHistory,
  undoHistory,
  redoHistory,
  type History,
} from '../lib/editor-model.ts';
import {
  localBounds,
  nodeMatrix,
  nodeWorldMatrix,
  wallBlocks,
  planDrawing,
  resizeObject,
  objectDimensions,
} from '../lib/editor-geometry.ts';
const fresh = createInitialProject;
const intersect = (a: Box3, b: Box3) => {
  const size = a.clone().intersect(b).getSize(new Vector3());
  return Math.min(size.x, size.y, size.z) > 1e-5;
};

test('passport glazing gives the separate kitchen and second room their own full windows', () => {
  const p = fresh(),
    west = walls.find((w) => w.id === 'living-west')!;
  assert.equal(west.openings.length, 2);
  assert.deepEqual(
    west.openings.map((o) => [
      +wallPoint(west, o.from)[1].toFixed(2),
      +wallPoint(west, o.to)[1].toFixed(2),
    ]),
    [
      [3.05, 4.95],
      [6.6, 8.4],
    ],
  );
  for (const [i, floorId] of ['floor-room2', 'floor-kitchen'].entries()) {
    const opening = west.openings[i],
      floor = findNode(p.scene.objects, floorId)!;
    for (
      let z = wallPoint(west, opening.from)[1] + 0.03;
      z < wallPoint(west, opening.to)[1] - 0.03;
      z += 0.04
    )
      assert.ok(
        polygonContains(floor.geometry.polygon!, [0.2, z]),
        `${floorId}: window belongs to room`,
      );
  }
  const original = createOpenProject();
  for (const wall of walls.filter((w) =>
    w.openings.some((o) => o.kind === 'window'),
  ))
    assert.deepEqual(
      findNode(p.scene.objects, `wall-${wall.id}`),
      findNode(original.scene.objects, `wall-${wall.id}`),
    );
  const glazed = p.scene.objects.flatMap((w) =>
    w.children
      .filter((o) => o.geometry.openingType === 'window')
      .map((o) =>
        localBounds(o).applyMatrix4(nodeWorldMatrix(p.scene.objects, o.id)!),
      ),
  );
  for (const id of PARTITION_WALL_IDS) {
    const wall = findNode(p.scene.objects, id)!;
    const bounds = localBounds(wall).applyMatrix4(nodeMatrix(wall));
    assert.ok(
      glazed.every((window) => !intersect(window, bounds)),
      id,
    );
  }
  assert.equal(
    planDrawing(p.scene.objects, p.scene.view).filter(
      (part) =>
        findNode(p.scene.objects, part.id)?.geometry.openingType === 'window',
    ).length,
    5,
  );
});

test('split floors cover the passport footprint continuously and both new rooms open into the hall', () => {
  const p = fresh(),
    original = rooms.find((r) => r.id === 'living')!;
  const floors = ['floor-kitchen', 'floor-room2', 'floor-living'].map((id) =>
    findNode(p.scene.objects, id)!,
  );
  assert.ok(
    Math.abs(
      floors.reduce((sum, n) => sum + polygonArea(n.geometry.polygon!), 0) -
        roomModelArea(original),
    ) < 1e-6,
  );
  for (let x = 0.017; x < 7.13; x += 0.071)
    for (let z = 2.663; z < 9; z += 0.073) {
      const count = floors.filter((n) =>
        polygonContains(n.geometry.polygon!, [x, z]),
      ).length;
      assert.equal(count, roomContains(original, [x, z]) ? 1 : 0, `${x},${z}`);
    }
  for (const [wallId, roomId] of [
    [PARTITION_WALL_IDS[0], 'floor-kitchen'],
    [PARTITION_WALL_IDS[2], 'floor-room2'],
  ]) {
    const door = findNode(p.scene.objects, wallId)!.children[0],
      position = new Vector3().applyMatrix4(
        nodeWorldMatrix(p.scene.objects, door.id)!,
      );
    assert.ok(
      polygonContains(findNode(p.scene.objects, roomId)!.geometry.polygon!, [
        position.x - 0.2,
        position.z,
      ]),
    );
    assert.ok(
      polygonContains(
        findNode(p.scene.objects, 'floor-living')!.geometry.polygon!,
        [position.x + 0.2, position.z],
      ),
    );
  }
  const hall = findNode(p.scene.objects, 'floor-living')!.geometry.polygon!;
  for (const point of [
    [7, 6.6],
    [5.88, 2.8],
    [5.83, 7],
    [4.8, 4.4],
    [4.8, 6.6],
  ] as [number, number][])
    assert.ok(
      polygonContains(hall, point),
      'shared access from entrance to each door',
    );
});

test('default furniture clears added wall bodies and 70 cm approaches to both new doors', () => {
  const p = fresh(),
    furniture = p.scene.objects
      .filter((n) => n.category === 'furniture')
      .map((n) => ({
        name: n.name,
        box: localBounds(n).applyMatrix4(nodeMatrix(n)),
      }));
  for (const id of PARTITION_WALL_IDS) {
    const wall = findNode(p.scene.objects, id)!;
    for (const block of wallBlocks(wall)) {
      const box = new Box3(
        new Vector3(...block.size).multiplyScalar(-0.5),
        new Vector3(...block.size).multiplyScalar(0.5),
      )
        .translate(new Vector3(...block.position))
        .applyMatrix4(nodeMatrix(wall));
      for (const item of furniture)
        assert.ok(!intersect(box, item.box), `${wall.name}: ${item.name}`);
    }
    for (const door of wall.children) {
      const width = door.geometry.size[0];
      const approach = new Box3(
        new Vector3(-width / 2, 0.06, -0.7),
        new Vector3(width / 2, 2, 0.7),
      ).applyMatrix4(nodeWorldMatrix(p.scene.objects, door.id)!);
      for (const item of furniture)
        assert.ok(
          !intersect(approach, item.box),
          `${door.name} approach: ${item.name}`,
        );
    }
  }
});

test('proposed walls can be hidden, moved, deleted, restored, supplemented and transferred', () => {
  let p = fresh();
  const id = PARTITION_WALL_IDS[1];
  p = editNode(p, id, (n) => {
    n.position[2] += 0.25;
    n.color = '#123456';
  });
  const edited = clone(findNode(p.scene.objects, id)!);
  p.scene.view.selected = id;
  const off = togglePartitionWalls(p, false);
  assert.equal(off.scene.view.selected, null);
  assert.ok(
    PARTITION_WALL_IDS.every((id) => !findNode(off.scene.objects, id)!.visible),
  );
  const on = togglePartitionWalls(off, true);
  assert.deepEqual(findNode(on.scene.objects, id), edited);
  let h: History = { past: [], present: p, future: [] };
  h = pushHistory(h, off);
  assert.deepEqual(undoHistory(h).present, p);
  assert.deepEqual(redoHistory(undoHistory(h)).present, off);
  const deleted = removeNode(p, id);
  assert.equal(findNode(deleted.scene.objects, id), undefined);
  assert.ok(findNode(togglePartitionWalls(deleted, true).scene.objects, id));
  const extra = catalogObject('wall');
  extra.position = [5.5, 0, 4];
  deleted.scene.objects.push(extra);
  assert.deepEqual(importProject(exportProject(deleted)), deleted);
});

test('switching an existing edited project to the new preset retains every old variant and a complete current-scene backup', () => {
  const old = createOpenProject();
  old.name = 'Мой проект';
  old.scene.objects.find((n) => n.name === 'Диван')!.color = '#123456';
  old.scene.view.planOffset = [0.3, 0.4];
  const before = clone(old);
  const next = applyPartitionedPreset(old);
  assert.deepEqual(old, before);
  assert.equal(next.name, old.name);
  assert.equal(next.activeArrangement, PARTITION_PRESET_ID);
  assert.deepEqual(
    next.arrangements.slice(0, old.arrangements.length),
    old.arrangements,
  );
  assert.deepEqual(
    next.arrangements.find((a) => a.name === 'До переноса кухни к санузлу')!
      .scene,
    old.scene,
  );
  assert.ok(findNode(next.scene.objects, 'floor-kitchen'));
  assert.deepEqual(importProject(exportProject(next)), next);
});

test('the kitchen occupies the former TV wall and the dining group leaves a clear working aisle', () => {
  const p = fresh(),
    kitchen = p.scene.objects.find((n) => n.name === 'Кухня')!,
    dining = p.scene.objects.find((n) => n.name === 'Обеденная группа')!,
    top = kitchen.children.find((n) => n.name === 'Столешница кухни')!,
    fridge = kitchen.children.find((n) => n.name === 'Холодильник')!;
  const k = localBounds(top).applyMatrix4(
      nodeWorldMatrix(p.scene.objects, top.id)!,
    ),
    d = localBounds(dining).applyMatrix4(nodeMatrix(dining)),
    f = localBounds(fridge).applyMatrix4(
      nodeWorldMatrix(p.scene.objects, fridge.id)!,
    );
  assert.ok(k.min.z > 7.1 && k.max.z < 9, 'worktop along the bathroom wall');
  assert.ok(k.max.x < 4.15 && k.max.x > 4, 'worktop at the former TV position');
  assert.ok(k.min.x - d.max.x >= 0.9, `working aisle: ${k.min.x - d.max.x}`);
  assert.ok(f.max.z < 9 && f.max.x < k.min.x, 'separate fridge beside the run');
  const tv = p.scene.objects.find((n) => n.name === 'Тумба и телевизор')!;
  assert.ok(tv.position[2] < 5.875, 'TV belongs to the upper room');
});

test('bathroom wall extension joins the column and can be resized independently with its door', () => {
  let p = fresh();
  const id = PARTITION_WALL_IDS[0],
    wall = findNode(p.scene.objects, id)!,
    bathroom = clone(findNode(p.scene.objects, 'wall-bathroom-left')!);
  assert.ok(Math.abs(wall.geometry.size[0] - 1) < 1e-8);
  assert.equal(wall.geometry.size[2], 0.11);
  assert.deepEqual(wall.position, [4.205, 0, 6.6]);
  p = editNode(p, id, (n) =>
    resizeObject(p.scene.objects, n, [1.6, 2.9, 0.15]),
  );
  const changed = findNode(p.scene.objects, id)!;
  assert.deepEqual(
    objectDimensions(p.scene.objects, changed),
    [1.6, 2.9, 0.15],
  );
  assert.equal(changed.children[0].geometry.openingType, 'door');
  assert.deepEqual(findNode(p.scene.objects, bathroom.id), bathroom);
  assert.deepEqual(importProject(exportProject(p)), p);
});

test('restoring a deleted wall in an older arrangement uses that arrangement geometry', () => {
  const p = fresh(),
    id = PARTITION_WALL_IDS[0];
  p.activeArrangement = 'separate-kitchen-v1';
  p.arrangements[0].id = p.activeArrangement;
  const oldWall = findNode(p.arrangements[0].scene.objects, id)!;
  oldWall.position = [4.205, 0, 4.125];
  oldWall.geometry.size[0] = 3.05;
  const restored = togglePartitionWalls(removeNode(p, id), true);
  assert.deepEqual(findNode(restored.scene.objects, id), oldWall);
  oldWall.visible = false;
  const shown = togglePartitionWalls(removeNode(p, id), true);
  assert.equal(findNode(shown.scene.objects, id)!.visible, true);
  const next = applyPartitionedPreset(restored);
  assert.equal(next.activeArrangement, PARTITION_PRESET_ID);
  assert.deepEqual(next.arrangements[0], restored.arrangements[0]);
});

test('2D window symbols are drawn above their projected opaque frames', () => {
  const p = fresh(),
    drawing = planDrawing(p.scene.objects, p.scene.view);
  for (const wall of p.scene.objects)
    for (const window of wall.children.filter(
      (n) => n.geometry.openingType === 'window',
    )) {
      const index = drawing.findIndex((part) => part.id === window.id);
      assert.ok(index >= 0);
      assert.equal(drawing[index].color, '#92c5d8');
      for (const child of window.children)
        assert.ok(
          drawing.findIndex((part) => part.id === child.id) < index,
          'frame must not hide the glazing symbol',
        );
    }
});
