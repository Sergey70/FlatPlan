import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createInitialProject,
  createOpenProject,
  catalogObject,
  catalog,
} from '../lib/editor-seed.ts';
import {
  clone,
  findNode,
  flattenNodes,
  editNode,
  duplicateNode,
  removeNode,
  paintNode,
  saveArrangement,
  loadArrangement,
  validateProject,
  importProject,
  exportProject,
  persistProject,
  readStoredProject,
  clearStoredProject,
  STORAGE_KEY,
  MAX_FILE_BYTES,
  pushHistory,
  undoHistory,
  redoHistory,
  type EditorProject,
  type History,
  type Vec3,
} from '../lib/editor-model.ts';
import {
  nodeDimensions,
  objectDimensions,
  resizeObject,
  nodeColor,
  resizeNode,
  wallBlocks,
  createNodeGeometry,
  nodeWorldMatrix,
  planDrawing,
} from '../lib/editor-geometry.ts';
import { Vector3 } from 'three';
import { registerEditorTools } from '../lib/editor-webmcp.ts';
const fresh = createInitialProject;
const close = (a: number, b: number) =>
  assert.ok(Math.abs(a - b) < 1e-5, `${a} != ${b}`);

test('editor seed has complete editable geometry, two arrangements and a real bathtub', () => {
  const p = fresh(),
    nodes = flattenNodes(p.scene.objects);
  assert.ok(nodes.length > 200);
  assert.equal(new Set(nodes.map((n) => n.node.id)).size, nodes.length);
  const tub = nodes.find((n) => n.node.name === 'Ванна 170 × 75')!.node;
  const dimensions = nodeDimensions(tub);
  close(dimensions[0], 0.75);
  close(dimensions[2], 1.7);
  assert.ok(tub.children.length >= 5);
  assert.ok(!nodes.some((n) => /душ/i.test(n.node.name)));
  assert.equal(p.arrangements.length, 2);
  assert.equal(p.activeArrangement, 'kitchen-by-bathroom-v2');
  assert.equal(
    p.scene.objects.filter((n) => n.id.startsWith('wall-proposed-')).length,
    3,
  );
  assert.ok(
    !p.arrangements[1].scene.objects.some((n) =>
      n.id.startsWith('wall-proposed-'),
    ),
  );
  for (const item of catalog) {
    const object = catalogObject(item.id);
    assert.ok(object.id);
    assert.ok(nodeDimensions(object).every((n) => n > 0));
  }
});

test('exact dimensions, parent transforms and per-part colors remain independent', () => {
  let p = fresh();
  const sofa = p.scene.objects.find((n) => n.name === 'Диван')!;
  const part = sofa.children.find((n) => n.material === 'fabric')!;
  const peer = clone(sofa.children.find((n) => n.id !== part.id)!);
  p = editNode(p, sofa.id, (n) => {
    resizeNode(n, [3.125, 1.2, 1.7]);
    n.position = [1.125, 0.075, 6.875];
    n.rotation = [0, 37, 0];
  });
  const scaled = findNode(p.scene.objects, sofa.id)!;
  nodeDimensions(scaled).forEach((n, i) => close(n, [3.125, 1.2, 1.7][i]));
  p = editNode(p, part.id, (n) => {
    paintNode(n, '#123456');
    resizeNode(n, [0.7, 0.4, 0.5]);
  });
  const changed = findNode(p.scene.objects, part.id)!;
  assert.equal(changed.color, '#123456');
  assert.equal(changed.role, undefined);
  nodeDimensions(changed).forEach((n, i) => close(n, [0.7, 0.4, 0.5][i]));
  assert.deepEqual(findNode(p.scene.objects, peer.id), peer);
  const matrix = nodeWorldMatrix(p.scene.objects, part.id)!;
  assert.ok(
    new Vector3().applyMatrix4(matrix).toArray().every(Number.isFinite),
  );
  assert.equal(nodeColor(changed, { palette: 'contrast' }), '#123456');
});

test('wall resizing preserves openings and clips wall volume correctly', () => {
  let p = fresh();
  const wall = p.scene.objects.find((n) => n.id === 'wall-bedroom-back')!;
  const originalOpening = clone(wall.children[0]);
  p = editNode(p, wall.id, (n) => resizeNode(n, [7.165, 3.2, 0.5]));
  const changed = findNode(p.scene.objects, wall.id)!;
  assert.deepEqual(changed.children[0], originalOpening);
  const volume = wallBlocks(changed).reduce(
    (sum, b) => sum + b.size[0] * b.size[1] * b.size[2],
    0,
  );
  close(
    volume,
    7.165 * 3.2 * 0.5 -
      originalOpening.geometry.size[0] * originalOpening.geometry.size[1] * 0.5,
  );
  const smaller = clone(p);
  assert.throws(() =>
    editNode(smaller, wall.id, (n) => resizeNode(n, [1, 1, 0.2])),
  );
  assert.deepEqual(p, smaller);
});

test('floor geometry has editable thickness and true concave holes', () => {
  const p = createOpenProject(),
    floor = findNode(p.scene.objects, 'floor-living')!;
  const geometry = createNodeGeometry(floor)!;
  geometry.computeBoundingBox();
  close(geometry.boundingBox!.getSize(new Vector3()).y, 0.04);
  geometry.dispose();
  const before = planDrawing(p.scene.objects, p.scene.view).find(
    (n) => n.id === floor.id,
  )!;
  assert.equal(before.holes.length, 1);
  const changed = editNode(p, floor.id, (n) => {
    n.position = [0.25, 0.1, -0.5];
    resizeNode(n, [8.13, 0.08, 7.35]);
  });
  const after = planDrawing(changed.scene.objects, changed.scene.view).find(
    (n) => n.id === floor.id,
  )!;
  assert.notDeepEqual(before.points, after.points);
  assert.equal(after.holes.length, 1);
});

test('full JSON round-trip and browser reload retain nested edits, arrangements and exact camera', () => {
  let p = fresh();
  const bath = flattenNodes(p.scene.objects).find(
    (n) => n.node.name === 'Ванна 170 × 75',
  )!.node;
  p = editNode(p, bath.children[0].id, (n) => {
    n.color = '#aabbcc';
    n.role = undefined;
    n.position[0] = 0.123;
  });
  p.scene.view = {
    ...p.scene.view,
    mode: '2d',
    planZoom: 1.728,
    night: true,
    palette: 'warm',
    selected: bath.children[0].id,
    camera: { position: [-4.123, 5.5, 12.9], target: [2.1, 0.75, 6.4] },
  };
  p = saveArrangement(p, 'Мой вариант');
  const serialized = exportProject(p);
  assert.deepEqual(importProject(serialized), p);
  let stored: string | null = null;
  const storage = {
    getItem: (key: string) => (key === STORAGE_KEY ? stored : null),
    setItem: (key: string, value: string) => {
      assert.equal(key, STORAGE_KEY);
      stored = value;
    },
  };
  persistProject(storage, p);
  assert.deepEqual(readStoredProject(storage), p);
  assert.deepEqual(p.arrangements.at(-1)!.scene, p.scene);
  assert.throws(
    () =>
      persistProject(
        {
          getItem: () => null,
          setItem: () => {
            throw new Error('Quota exceeded');
          },
        },
        p,
      ),
    /Quota/,
  );
});

test('permanent reset removes only editor data, including corrupt saves, and reports storage errors', () => {
  for (const value of [exportProject(fresh()), '{broken', null]) {
    const entries = new Map([['other-project', 'keep']]);
    if (value !== null) entries.set(STORAGE_KEY, value);
    clearStoredProject({
      removeItem: (key) => {
        entries.delete(key);
      },
    });
    assert.deepEqual([...entries], [['other-project', 'keep']]);
    clearStoredProject({
      removeItem: (key) => {
        entries.delete(key);
      },
    });
    assert.deepEqual([...entries], [['other-project', 'keep']]);
  }
  assert.throws(
    () =>
      clearStoredProject({
        removeItem: () => {
          throw new Error('Storage access denied');
        },
      }),
    /Storage access denied/,
  );
});

test('variants are independent full snapshots and reopening restores the correct edited scene', () => {
  let p = fresh();
  p = saveArrangement(p, 'A');
  const a = p.activeArrangement!;
  const snapshot = clone(p.scene);
  const sofa = p.scene.objects.find((n) => n.name === 'Диван')!;
  p = editNode(p, sofa.id, (n) => {
    n.position[0] += 1;
    paintNode(n, '#554433');
  });
  p = saveArrangement(p, 'B');
  const b = p.activeArrangement!,
    modified = clone(p.scene);
  assert.deepEqual(p.arrangements.find((n) => n.id === a)!.scene, snapshot);
  assert.deepEqual(loadArrangement(p, a).scene, snapshot);
  assert.deepEqual(loadArrangement(p, b).scene, modified);
});

test('undo/redo preserves subtree identities across edit, duplicate, delete and import', () => {
  const initial = fresh();
  let h: History = { past: [], present: initial, future: [] };
  const sofa = initial.scene.objects.find((n) => n.name === 'Диван')!;
  const edited = editNode(initial, sofa.children[0].id, (n) =>
    paintNode(n, '#102030'),
  );
  h = pushHistory(h, edited);
  const copied = duplicateNode(h.present, sofa.id);
  h = pushHistory(h, copied);
  const copyId = copied.scene.view.selected!;
  assert.notEqual(copyId, sofa.id);
  assert.equal(
    new Set(flattenNodes(copied.scene.objects).map((n) => n.node.id)).size,
    flattenNodes(copied.scene.objects).length,
  );
  h = pushHistory(h, removeNode(h.present, copyId));
  h = undoHistory(h);
  assert.deepEqual(h.present, copied);
  h = undoHistory(h);
  assert.deepEqual(h.present, edited);
  h = redoHistory(h);
  assert.deepEqual(h.present, copied);
  h = pushHistory(h, importProject(exportProject(initial)));
  assert.equal(h.future.length, 0);
  h = undoHistory(h);
  assert.deepEqual(h.present, copied);
});

test('invalid imports reject atomically before storage or original state changes', () => {
  const initial = fresh(),
    unchanged = clone(initial);
  const mutations: Array<(p: EditorProject) => void> = [
    (p) => {
      p.version = 999 as 1;
    },
    (p) => {
      p.scene.objects.push(clone(p.scene.objects[0]));
    },
    (p) => {
      p.scene.view.selected = 'missing';
    },
    (p) => {
      p.activeArrangement = 'missing';
    },
    (p) => {
      p.scene.objects[0].scale[0] = NaN;
    },
    (p) => {
      p.scene.objects[0].color = 'url(https://example.com)';
    },
    (p) => {
      p.scene.objects[0].geometry.polygon = [
        [0, 0],
        [1, 1],
        [0, 1],
        [1, 0],
      ];
    },
    (p) => {
      p.scene.objects[0].geometry.polygon = [
        [0, 0],
        [1, 0],
        [2, 0],
      ];
    },
    (p) => {
      p.scene.objects[0].geometry.holes = [
        [
          [50, 50],
          [51, 50],
          [51, 51],
          [50, 51],
        ],
      ];
    },
    (p) => {
      const wall = p.scene.objects.find(
        (n) => n.geometry.kind === 'wall' && n.children.length,
      )!;
      wall.children[0].position[2] = 100;
    },
    (p) => {
      const wall = p.scene.objects.find(
        (n) => n.geometry.kind === 'wall' && n.children.length,
      )!;
      wall.children[0].scale[0] = 100;
    },
    (p) => {
      const wall = p.scene.objects.find(
        (n) => n.geometry.kind === 'wall' && n.children.length,
      )!;
      wall.children[0].rotation = [0, 90, 0];
    },
    (p) => {
      p.scene.view.camera = { position: [1, 1, 1], target: [1, 1, 1] };
    },
  ];
  for (const change of mutations) {
    const bad = clone(initial);
    change(bad);
    assert.throws(() => validateProject(bad));
    assert.deepEqual(initial, unchanged);
  }
  for (const value of ['{broken', '[]', 'null', 'x'.repeat(MAX_FILE_BYTES + 1)])
    assert.throws(() => importProject(value));
  const malicious = JSON.parse(exportProject(initial));
  malicious.scene.objects[0].geometry = JSON.parse(
    '{"__proto__":{},"kind":"box","size":[1,1,1]}',
  );
  assert.throws(() => validateProject(malicious));
});

test('WebMCP rejects invalid color/material atomically and respects removal locks', () => {
  let project = fresh();
  const tools = new Map<string, { execute(input: unknown): unknown }>();
  const original = Object.getOwnPropertyDescriptor(globalThis, 'document');
  Object.defineProperty(globalThis, 'document', {
    configurable: true,
    value: {
      modelContext: {
        registerTool(tool: { name: string; execute(input: unknown): unknown }) {
          tools.set(tool.name, tool);
        },
      },
    },
  });
  const cleanup = registerEditorTools({
    read: () => project,
    commit: (p) => {
      project = p;
    },
    view: () => {},
    undo: () => {},
    redo: () => {},
    save: () => {},
    status: () => ({}),
  });
  try {
    const id = project.scene.objects.find((n) => n.name === 'Диван')!.id;
    for (const patch of [
      { material: '' },
      { material: null },
      { material: false },
      { color: null },
      { color: 'bad' },
    ]) {
      const before = clone(project);
      assert.throws(() =>
        tools
          .get('edit_editor_object')!
          .execute({ action: 'update', id, position: [5, 0, 5], ...patch }),
      );
      assert.deepEqual(project, before);
    }
    tools
      .get('edit_editor_object')!
      .execute({ action: 'update', id, locked: true });
    const locked = clone(project);
    assert.throws(() =>
      tools.get('edit_editor_object')!.execute({ action: 'remove', id }),
    );
    assert.deepEqual(project, locked);
    tools
      .get('edit_editor_object')!
      .execute({ action: 'update', id, locked: false });
    tools.get('edit_editor_object')!.execute({ action: 'remove', id });
    assert.equal(findNode(project.scene.objects, id), undefined);
    tools
      .get('configure_editor_view')!
      .execute({ planZoom: 2.5, planOffset: [-1.234, 2.345] });
  } finally {
    cleanup();
    if (original) Object.defineProperty(globalThis, 'document', original);
    else Reflect.deleteProperty(globalThis, 'document');
  }
});

test('plan pan and zoom survive file/storage transfer, older v1 defaults to centered plan', () => {
  const p = fresh();
  p.scene.view.planZoom = 2.25;
  p.scene.view.planOffset = [-1.234, 2.345];
  assert.deepEqual(importProject(exportProject(p)), p);
  const older = JSON.parse(exportProject(p));
  delete older.scene.view.planOffset;
  assert.deepEqual(validateProject(older).scene.view.planOffset, [0, 0]);
  for (const bad of [[NaN, 0], [201, 0], [1], [0, 0, 0], null]) {
    const broken = clone(p);
    Reflect.set(broken.scene.view, 'planOffset', bad);
    assert.throws(() => validateProject(broken));
  }
});

test('physical part dimensions stay exact inside scaled and rotated parents', () => {
  let p = fresh();
  const sofa = p.scene.objects.find((n) => n.name === 'Диван')!,
    id = sofa.children[0].id;
  p = editNode(p, sofa.id, (n) => {
    n.scale = [2, 1.5, 0.7];
    n.rotation = [0, 37, 0];
  });
  p = editNode(p, id, (n) => {
    n.rotation = [10, 25, 5];
    resizeObject(p.scene.objects, n, [0.775, 0.235, 0.615]);
  });
  const part = findNode(p.scene.objects, id)!;
  objectDimensions(p.scene.objects, part).forEach((n, i) =>
    close(n, [0.775, 0.235, 0.615][i]),
  );
  assert.notDeepEqual(
    nodeDimensions(part),
    objectDimensions(p.scene.objects, part),
  );
  assert.deepEqual(importProject(exportProject(p)), p);
});
