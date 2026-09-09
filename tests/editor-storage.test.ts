import test from 'node:test';
import assert from 'node:assert/strict';
import { createInitialProject } from '../lib/editor-seed.ts';
import {
  clone,
  exportProject,
  importProject,
  clearStoredProject,
  STORAGE_KEY,
  VIEW_STORAGE_KEY,
  ROOM_WORKSPACE_STORAGE_KEY,
  type EditorProject,
  type StoragePort,
} from '../lib/editor-model.ts';
import {
  EditorAutosave,
  readEditorProject,
  serializeProject,
  sameProjectModel,
  StorageConflictError,
  type SaveStatus,
  type SerializedProject,
} from '../lib/editor-storage.ts';

function view(project: EditorProject, x: number): EditorProject {
  return {
    ...project,
    scene: {
      ...project.scene,
      view: {
        ...project.scene.view,
        camera: { position: [x, 9, 12], target: [0, 0, 0] },
      },
    },
  };
}
function fixture(deferred = false) {
  const original = createInitialProject(),
    raw = exportProject(original);
  const values = new Map([
    [STORAGE_KEY, raw],
    [ROOM_WORKSPACE_STORAGE_KEY, '1'],
  ]);
  const writes: { key: string; bytes: number }[] = [],
    statuses: SaveStatus[] = [],
    errors: unknown[] = [];
  const requests: {
    project: EditorProject;
    resolve: (value: SerializedProject) => void;
    reject: (reason: Error) => void;
  }[] = [];
  let timer: (() => void) | null = null,
    failKey: string | null = null;
  const storage: StoragePort & Pick<Storage, 'removeItem'> = {
    getItem: (key) => values.get(key) ?? null,
    setItem(key, value) {
      if (key === failKey) throw new Error('Quota');
      values.set(key, value);
      writes.push({ key, bytes: new TextEncoder().encode(value).byteLength });
    },
    removeItem(key) {
      values.delete(key);
    },
  };
  const saver = new EditorAutosave(storage, {
    project: original,
    saved: original,
    source: raw,
    onStatus: (value) => statuses.push(value),
    onError: (error) => errors.push(error),
    serialize(project) {
      if (deferred)
        return new Promise((resolve, reject) =>
          requests.push({ project, resolve, reject }),
        );
      requests.push({ project, resolve() {}, reject() {} });
      return Promise.resolve(serializeProject(project));
    },
    schedule(run) {
      timer = run;
      return () => {
        if (timer === run) timer = null;
      };
    },
  });
  return {
    original,
    raw,
    values,
    storage,
    saver,
    writes,
    requests,
    statuses,
    errors,
    fail(key: string | null) {
      failKey = key;
    },
    async tick() {
      const run = timer;
      timer = null;
      run?.();
      await Promise.resolve();
    },
    pending: () => timer !== null,
  };
}

test('legacy projects and matching view sidecars load; stale/corrupt views never break the model', () => {
  const f = fixture();
  assert.deepEqual(readEditorProject(f.storage), importProject(f.raw));
  f.saver.update(view(f.original, 8));
  f.saver.flush();
  assert.deepEqual(
    readEditorProject(f.storage)?.scene.view.camera,
    view(f.original, 8).scene.view.camera,
  );
  assert.equal(f.values.get(STORAGE_KEY), f.raw);
  // An older client changes the full document without knowing about the sidecar.
  const other = { ...f.original, name: 'Older client' };
  f.values.set(STORAGE_KEY, exportProject(other));
  assert.deepEqual(
    readEditorProject(f.storage),
    importProject(exportProject(other)),
  );
  f.values.set(STORAGE_KEY, f.raw);
  const sidecar = f.values.get(VIEW_STORAGE_KEY)!;
  for (const bad of [
    '{bad',
    'x'.repeat(65536),
    JSON.stringify({ ...JSON.parse(sidecar), version: 99 }),
    JSON.stringify({
      ...JSON.parse(sidecar),
      view: { ...JSON.parse(sidecar).view, selected: 'missing' },
    }),
  ]) {
    f.values.set(VIEW_STORAGE_KEY, bad);
    assert.deepEqual(readEditorProject(f.storage), importProject(f.raw));
  }
  f.values.set(STORAGE_KEY, '{bad');
  assert.throws(() => readEditorProject(f.storage));
});

test('model identity ignores view changes but detects document metadata, scene and saved arrangements', () => {
  const p = createInitialProject();
  assert.ok(sameProjectModel(p, view(p, 7)));
  for (const next of [
    { ...p, name: 'renamed' },
    { ...p, sourceRevision: 'new' },
    { ...p, activeArrangement: null },
    { ...p, arrangements: [...p.arrangements] },
    { ...p, scene: { ...p.scene, objects: [...p.scene.objects] } },
    { ...p, scene: { ...p.scene, measurements: [] } },
  ])
    assert.equal(sameProjectModel(p, next), false);
});

test('navigation coalesces into one small write with zero full serialization; repeated flush is a no-op', async () => {
  const f = fixture();
  f.saver.update(f.original);
  f.saver.interaction('scene', true);
  for (let i = 0; i < 100; i++) {
    f.saver.update(view(f.original, i));
    await f.tick();
  }
  assert.equal(f.writes.length, 0);
  assert.equal(f.requests.length, 0);
  f.saver.interaction('scene', false);
  await f.tick();
  assert.deepEqual(
    f.writes.map((w) => w.key),
    [VIEW_STORAGE_KEY],
  );
  assert.ok(f.writes[0].bytes < 2048);
  assert.equal(f.requests.length, 0);
  assert.equal(f.values.get(STORAGE_KEY), f.raw);
  assert.equal(
    readEditorProject(f.storage)?.scene.view.camera?.position[0],
    99,
  );
  f.saver.flush();
  f.saver.flush();
  await f.tick();
  assert.equal(f.writes.length, 1);
  assert.equal(f.statuses.at(-1), 'saved');
});

test('model edits coalesce; preparation runs once and writes wait until all gestures finish', async () => {
  const f = fixture(true);
  for (let i = 0; i < 30; i++)
    f.saver.update({ ...f.original, name: `Edit ${i}` });
  await f.tick();
  assert.equal(f.requests.length, 1);
  f.saver.interaction('scene', true);
  f.saver.interaction('plan', true);
  f.saver.update(view(f.requests[0].project, 21));
  f.requests[0].resolve(serializeProject(f.requests[0].project));
  await Promise.resolve();
  await f.tick();
  assert.equal(f.writes.length, 0);
  f.saver.interaction('scene', false);
  await f.tick();
  assert.equal(f.writes.length, 0);
  f.saver.interaction('plan', false);
  await f.tick();
  assert.equal(f.requests.length, 1);
  assert.equal(f.writes.filter((w) => w.key === STORAGE_KEY).length, 1);
  assert.equal(readEditorProject(f.storage)?.name, 'Edit 29');
  assert.equal(
    readEditorProject(f.storage)?.scene.view.camera?.position[0],
    21,
  );
});

test('stale worker results cannot overwrite later edits; latest model is subsequently saved', async () => {
  const f = fixture(true);
  f.saver.update({ ...f.original, name: 'old' });
  await f.tick();
  f.saver.update({ ...f.original, name: 'latest' });
  await f.tick();
  f.requests[0].resolve(serializeProject(f.requests[0].project));
  await Promise.resolve();
  assert.equal(f.writes.length, 0);
  await f.tick();
  assert.equal(f.requests.length, 2);
  f.requests[1].resolve(serializeProject(f.requests[1].project));
  await Promise.resolve();
  await f.tick();
  assert.equal(readEditorProject(f.storage)?.name, 'latest');
});

test('manual save captures live view during work, invalidates old preparation, and is idempotent', async () => {
  const f = fixture(true);
  f.saver.update({ ...f.original, name: 'changed' });
  await f.tick();
  f.saver.interaction('scene', true);
  f.saver.update(view(f.requests[0].project, 28));
  f.saver.flush();
  const before = [...f.writes];
  f.requests[0].resolve(serializeProject(f.requests[0].project));
  await Promise.resolve();
  f.saver.flush();
  f.saver.interaction('scene', false);
  await f.tick();
  assert.deepEqual(f.writes, before);
  assert.equal(
    readEditorProject(f.storage)?.scene.view.camera?.position[0],
    28,
  );
});

test('reset deletes model/view/upgrade marker and invalidates pending writes, including failed workers', async () => {
  for (const reject of [false, true]) {
    const f = fixture(true);
    f.saver.update({ ...f.original, name: 'obsolete' });
    await f.tick();
    f.values.set(VIEW_STORAGE_KEY, 'old');
    clearStoredProject(f.storage);
    assert.equal(f.values.size, 0);
    f.saver.reset({ ...f.original, name: 'new project' });
    if (reject) f.requests[0].reject(new Error('obsolete failure'));
    else f.requests[0].resolve(serializeProject(f.requests[0].project));
    await Promise.resolve();
    await f.tick();
    assert.equal(f.errors.length, 0);
    assert.equal(f.requests.length, 2);
    f.requests[1].resolve(serializeProject(f.requests[1].project));
    await Promise.resolve();
    await f.tick();
    assert.equal(readEditorProject(f.storage)?.name, 'new project');
  }
});

test('pause and disposal reject pending worker results without later writes', async () => {
  for (const action of ['pause', 'dispose'] as const) {
    const f = fixture(true);
    f.saver.update({ ...f.original, name: 'obsolete' });
    await f.tick();
    f.saver[action]();
    f.requests[0].resolve(serializeProject(f.requests[0].project));
    await Promise.resolve();
    await f.tick();
    f.saver.flush();
    assert.equal(f.writes.length, 0);
  }
});

test('quota failure preserves original model; partial view failure retries without another model write', () => {
  for (const key of [
    STORAGE_KEY,
    VIEW_STORAGE_KEY,
    ROOM_WORKSPACE_STORAGE_KEY,
  ]) {
    const f = fixture();
    if (key === ROOM_WORKSPACE_STORAGE_KEY) f.values.delete(key);
    f.fail(key);
    f.saver.update({ ...f.original, name: 'new' });
    f.saver.flush();
    assert.equal(f.statuses.at(-1), 'error');
    assert.equal(f.errors.length, 1);
    assert.equal(
      readEditorProject(f.storage)?.name,
      key === STORAGE_KEY ? f.original.name : 'new',
    );
    f.fail(null);
    f.saver.flush();
    assert.equal(readEditorProject(f.storage)?.name, 'new');
    assert.equal(f.writes.filter((w) => w.key === STORAGE_KEY).length, 1);
    assert.equal(f.statuses.at(-1), 'saved');
  }
});

test('cross-tab conflicts protect new data and explicit recovery resumes saving', () => {
  const f = fixture();
  const remote = exportProject({ ...f.original, name: 'remote' });
  f.values.set(STORAGE_KEY, remote);
  f.saver.update({ ...f.original, name: 'local' });
  f.saver.flush();
  assert.ok(f.errors[0] instanceof StorageConflictError);
  assert.equal(f.values.get(STORAGE_KEY), remote);
  f.saver.reset({ ...f.original, name: 'explicit local' });
  f.saver.flush();
  assert.equal(readEditorProject(f.storage)?.name, 'explicit local');
  f.saver.external(null);
  assert.equal(f.statuses.at(-1), 'error');
});

test('explicit import replaces an old sidecar even if full project bytes match', () => {
  const f = fixture();
  f.saver.update(view(f.original, 42));
  f.saver.flush();
  f.saver.reset(clone(f.original));
  f.saver.flush();
  assert.deepEqual(
    readEditorProject(f.storage)?.scene.view,
    f.original.scene.view,
  );
});
