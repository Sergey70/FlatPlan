import test from 'node:test';
import assert from 'node:assert/strict';
import { createProjectSerializer } from '../lib/project-serializer.ts';
import { createInitialProject } from '../lib/editor-seed.ts';
import { importProject } from '../lib/editor-model.ts';

test('saving still validates and serializes when Worker is unavailable or construction fails', async () => {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'Worker');
  try {
    for (const Worker of [
      undefined,
      class {
        constructor() {
          throw new Error('Blocked');
        }
      },
    ]) {
      Object.defineProperty(globalThis, 'Worker', {
        configurable: true,
        value: Worker,
      });
      const serializer = createProjectSerializer(),
        project = createInitialProject();
      assert.equal(
        importProject((await serializer.serialize(project)).json).name,
        project.name,
      );
      await assert.rejects(
        serializer.serialize({ ...project, version: 99 } as never),
      );
      serializer.dispose();
    }
  } finally {
    if (descriptor) Object.defineProperty(globalThis, 'Worker', descriptor);
    else Reflect.deleteProperty(globalThis, 'Worker');
  }
});

test('worker load failures resolve pending saves through validation fallback; disposal rejects unfinished work', async () => {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'Worker');
  let worker: FakeWorker;
  class FakeWorker {
    onerror?: (event: { preventDefault(): void }) => void;
    onmessage?: (event: unknown) => void;
    onmessageerror?: () => void;
    terminated = false;
    constructor() {
      worker = this;
    }
    postMessage() {}
    terminate() {
      this.terminated = true;
    }
  }
  Object.defineProperty(globalThis, 'Worker', {
    configurable: true,
    value: FakeWorker,
  });
  try {
    const serializer = createProjectSerializer(),
      project = createInitialProject();
    const saved = serializer.serialize(project);
    worker!.onerror?.({ preventDefault() {} });
    assert.equal(importProject((await saved).json).name, project.name);
    assert.equal(worker!.terminated, true);
    serializer.dispose();
    const second = createProjectSerializer(),
      pending = second.serialize(project);
    second.dispose();
    await assert.rejects(pending, /отменено/);
    assert.equal(worker!.terminated, true);
  } finally {
    if (descriptor) Object.defineProperty(globalThis, 'Worker', descriptor);
    else Reflect.deleteProperty(globalThis, 'Worker');
  }
});
