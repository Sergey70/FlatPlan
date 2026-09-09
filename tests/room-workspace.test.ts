import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createDefaultProject,
  upgradeRoomWorkspace,
  persistEditorProject,
} from '../lib/editor-project.ts';
import { createPlanProject, DEFAULT_PLAN_ID } from '../lib/plan-project.ts';
import {
  createRoomProposalProject,
  ROOM_REPLACED_IDS,
} from '../lib/room-proposal.ts';
import {
  clone,
  findNode,
  exportProject,
  importProject,
  clearStoredProject,
  STORAGE_KEY,
  ROOM_WORKSPACE_STORAGE_KEY,
} from '../lib/editor-model.ts';

const workspace = (
  objects: ReturnType<typeof createDefaultProject>['scene']['objects'],
) => {
  for (const id of ROOM_REPLACED_IDS)
    assert.equal(findNode(objects, id), undefined);
  for (const id of [
    'plan-proposal-desk',
    'plan-proposal-chair',
    'proposal-monitor-1',
    'proposal-monitor-2',
    'proposal-computer',
  ])
    assert.ok(findNode(objects, id), id);
};

test('main default and starter use the accepted room while raw source and gallery remain independent', () => {
  const raw = createPlanProject(),
    before = clone(raw);
  const p = createDefaultProject();
  workspace(p.scene.objects);
  assert.deepEqual(p.scene, createRoomProposalProject().scene);
  assert.deepEqual(
    p.scene,
    p.arrangements.find((a) => a.id === DEFAULT_PLAN_ID)!.scene,
  );
  assert.deepEqual(p.arrangements.slice(1), raw.arrangements.slice(1));
  assert.deepEqual(createPlanProject(), before);
  assert.deepEqual(upgradeRoomWorkspace(p), p);
  assert.deepEqual(importProject(exportProject(p)), p);
});

test('old save upgrades only starter room, preserving outside edits, scene settings, selections and custom variants', () => {
  const raw = createPlanProject();
  raw.scene.objects.find((n) => n.id === 'plan-item-024')!.position[0] += 0.2;
  raw.scene.view.palette = 'contrast';
  raw.scene.view.selected = findNode(
    raw.scene.objects,
    'plan-item-070',
  )!.children[0].id;
  raw.scene.measurements = [{ id: 'measure', from: [0, 0], to: [1, 0] }];
  raw.arrangements.push({
    id: 'custom',
    name: 'Мой вариант',
    scene: clone(raw.scene),
  });
  const before = clone(raw),
    result = upgradeRoomWorkspace(raw);
  workspace(result.scene.objects);
  for (const n of before.scene.objects.filter(
    (n) => !ROOM_REPLACED_IDS.includes(n.id),
  ))
    assert.deepEqual(findNode(result.scene.objects, n.id), n);
  assert.equal(result.scene.view.palette, 'contrast');
  assert.equal(result.scene.view.selected, null);
  assert.deepEqual(result.scene.measurements, before.scene.measurements);
  assert.deepEqual(result.arrangements.at(-1), before.arrangements.at(-1));
  assert.deepEqual(raw, before);
  result.scene.objects = result.scene.objects.filter(
    (n) => n.id !== 'proposal-monitor-2',
  );
  assert.deepEqual(
    upgradeRoomWorkspace(result),
    result,
    'deleted new monitor is never restored',
  );
});

test('edited, removed or added room furniture and active custom variants are not overwritten', () => {
  for (const kind of ['moved', 'deleted', 'added', 'custom', 'bed']) {
    const p = createPlanProject();
    if (kind === 'moved')
      findNode(p.scene.objects, 'plan-item-070')!.position[0] += 0.1;
    if (kind === 'deleted')
      p.scene.objects = p.scene.objects.filter((n) => n.id !== 'plan-item-070');
    if (kind === 'added') {
      const desk = clone(
        findNode(
          createRoomProposalProject().scene.objects,
          'plan-proposal-desk',
        )!,
      );
      p.scene.objects.push(desk);
    }
    if (kind === 'bed') {
      const bed = p.scene.objects.find((n) => n.id === 'plan-item-069')!;
      bed.rotation[1] += 90;
    }
    if (kind === 'custom') {
      p.arrangements.push({
        id: 'my-room',
        name: 'Моя комната',
        scene: clone(p.scene),
      });
      p.activeArrangement = 'my-room';
    }
    const before = clone(p),
      updated = upgradeRoomWorkspace(p);
    assert.deepEqual(updated.scene, before.scene, kind);
    workspace(
      updated.arrangements.find((a) => a.id === DEFAULT_PLAN_ID)!.scene.objects,
    );
  }
});

test('upgrade does not restore removed starter variants or alter an active bathroom', () => {
  const p = createPlanProject();
  p.activeArrangement = p.arrangements[1].id;
  p.scene = clone(p.arrangements[1].scene);
  p.arrangements = p.arrangements.slice(1);
  assert.deepEqual(upgradeRoomWorkspace(p), p);
});

test('browser upgrade marker follows successful project save and is cleared with project data', () => {
  const entries = new Map<string, string>([['other-project', 'keep']]);
  const storage = {
    getItem: (key: string) => entries.get(key) ?? null,
    setItem: (key: string, value: string) => {
      entries.set(key, value);
    },
  };
  persistEditorProject(storage, createDefaultProject());
  assert.ok(entries.has(STORAGE_KEY));
  assert.equal(entries.get(ROOM_WORKSPACE_STORAGE_KEY), '1');
  clearStoredProject({
    removeItem: (key) => {
      entries.delete(key);
    },
  });
  assert.deepEqual([...entries], [['other-project', 'keep']]);
  assert.throws(
    () =>
      persistEditorProject(
        {
          ...storage,
          setItem: (key, value) => {
            if (key === STORAGE_KEY) throw new Error('quota');
            entries.set(key, value);
          },
        },
        createDefaultProject(),
      ),
    /quota/,
  );
  assert.equal(entries.has(ROOM_WORKSPACE_STORAGE_KEY), false);
});
