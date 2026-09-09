import assert from 'node:assert/strict';
import path from 'node:path';
import { createDefaultProject } from '../lib/editor-project.ts';

export async function checkAutosave(browser, url, out, h) {
  const context = await browser.newContext({
    viewport: { width: 1365, height: 900 },
  });
  await h.installTools(context);
  await context.addInitScript((json) => {
    if (!localStorage.getItem('flatplan.editor.v1')) {
      localStorage.setItem('flatplan.editor.v1', json);
      localStorage.setItem('flatplan.room-workspace.v1', '1');
    }
    window.__saveMetrics = {
      writes: [],
      serializations: 0,
      replies: 0,
      commits: 0,
    };
    const setItem = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (this === localStorage)
        window.__saveMetrics.writes.push({
          key,
          bytes: new TextEncoder().encode(value).byteLength,
        });
      return setItem.call(this, key, value);
    };
    const post = Worker.prototype.postMessage;
    Worker.prototype.postMessage = function (...args) {
      if (args[0]?.project) {
        window.__saveMetrics.serializations++;
        this.addEventListener(
          'message',
          (event) => {
            if (event.data?.data?.json) window.__saveMetrics.replies++;
          },
          { once: true },
        );
      }
      return post.apply(this, args);
    };
    window.__REACT_DEVTOOLS_GLOBAL_HOOK__ = {
      supportsFiber: true,
      inject() {
        return 1;
      },
      onCommitFiberRoot() {
        window.__saveMetrics.commits++;
      },
      onCommitFiberUnmount() {},
    };
  }, JSON.stringify(createDefaultProject()));
  const page = await context.newPage(),
    errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const metrics = () => page.evaluate(() => window.__saveMetrics);
  const clear = () =>
    page.evaluate(() => {
      window.__saveMetrics.writes = [];
      window.__saveMetrics.serializations = 0;
      window.__saveMetrics.replies = 0;
    });
  const frame = () =>
    page.evaluate(
      () =>
        new Promise((r) =>
          requestAnimationFrame(() => requestAnimationFrame(r)),
        ),
    );
  const camera = async () => (await h.status(page)).view.camera;
  const raw = () =>
    page.evaluate(() => localStorage.getItem('flatplan.editor.v1'));
  try {
    await page.goto(url);
    await h.loaded(page);
    await h.saved(page);
    await page.waitForTimeout(1200);
    assert.ok(
      (await metrics()).commits > 0,
      'React commit instrumentation is active',
    );
    const base = await raw();
    const canvas = page.locator('.ed-canvas canvas');
    const box = await canvas.boundingBox();
    const start = { x: box.x + box.width * 0.6, y: box.y + box.height * 0.45 };
    async function beginOrbit() {
      await page.mouse.move(start.x, start.y);
      await page.mouse.down();
      await frame();
    }
    async function rotate() {
      for (let i = 1; i <= 16; i++) {
        await page.mouse.move(start.x + i * 5, start.y + i * 2);
        await page.waitForTimeout(80);
      }
    }
    await clear();
    const before = await camera();
    await beginOrbit();
    const commits = (await metrics()).commits;
    await rotate();
    assert.notDeepEqual(
      await camera(),
      before,
      'Live camera is readable before mouse release',
    );
    assert.equal(
      (await metrics()).commits,
      commits,
      'Orbit frames do not render the React editor',
    );
    assert.deepEqual(
      (await metrics()).writes,
      [],
      'No storage writes during orbit',
    );
    assert.equal((await metrics()).serializations, 0);
    await page.mouse.up();
    await frame();
    await h.saved(page);
    const orbitCamera = await camera(),
      orbitMetrics = await metrics();
    assert.equal(await raw(), base, 'Orbit does not rewrite the full document');
    assert.equal(orbitMetrics.serializations, 0);
    assert.equal(orbitMetrics.writes.length, 1);
    assert.equal(orbitMetrics.writes[0].key, 'flatplan.view.v1');
    assert.ok(orbitMetrics.writes[0].bytes < 3000);
    await page.reload();
    await h.loaded(page);
    await h.saved(page);
    assert.deepEqual(
      await camera(),
      orbitCamera,
      'Final orbit camera survives reload',
    );

    await h.panel(page, 'Варианты');
    await page
      .locator('details:not([open]) > summary')
      .filter({ hasText: 'Прогулка и ракурсы' })
      .click();
    await page
      .getByRole('button', { name: 'Начать прогулку', exact: true })
      .click();
    await page.keyboard.press('Escape');
    assert.deepEqual(
      await camera(),
      orbitCamera,
      'Without reload, exiting walk restores the exact preceding orbit',
    );
    await page
      .getByRole('button', { name: 'Начать прогулку', exact: true })
      .click();
    await h.saved(page);
    await clear();
    const walkBefore = await camera();
    await page.keyboard.down('ArrowRight');
    await page.keyboard.down('KeyW');
    await frame();
    const walkCommits = (await metrics()).commits;
    await page.waitForTimeout(1500);
    assert.notDeepEqual(await camera(), walkBefore);
    assert.equal(
      (await metrics()).commits,
      walkCommits,
      'Walk frames do not render the React editor',
    );
    assert.equal((await metrics()).serializations, 0);
    assert.deepEqual((await metrics()).writes, []);
    await page.keyboard.up('KeyW');
    await page.keyboard.up('ArrowRight');
    await frame();
    await h.saved(page);
    const walkCamera = await camera();
    assert.equal(await raw(), base);
    assert.equal((await metrics()).serializations, 0);
    assert.equal((await metrics()).writes.length, 1);
    await page.reload();
    await h.loaded(page);
    await h.saved(page);
    assert.deepEqual(
      await camera(),
      walkCamera,
      'Final walk camera survives reload',
    );
    // Capture the actual live camera even if a tab closes in the middle of mouse-look.
    await clear();
    await beginOrbit();
    await rotate();
    const live = await camera();
    await page.evaluate(() => {
      window.dispatchEvent(new Event('beforeunload'));
      window.dispatchEvent(new Event('pagehide'));
    });
    assert.deepEqual(
      await page.evaluate(
        () => JSON.parse(localStorage.getItem('flatplan.view.v1')).view.camera,
      ),
      live,
    );
    assert.equal((await metrics()).writes.length, 1);
    assert.equal((await metrics()).serializations, 0);
    await page.mouse.up();
    await page.keyboard.press('Escape');
    await h.saved(page);
    assert.deepEqual(
      await camera(),
      before,
      'After reload, exiting walk restores the exact default overview (the previous orbit is session-only)',
    );

    // Content edits still save automatically, coalesced and postponed by a long orbit.
    await clear();
    const node = (await h.project(page)).scene.objects.find(
      (n) => !n.locked && n.geometry.kind === 'group',
    );
    assert.ok(node);
    // Dispatch one edit burst without introducing idle frames between edits.
    await page.evaluate((id) => {
      for (const name of ['Draft one', 'Draft two', 'Saved final'])
        window.__flatplanTools.edit_editor_object.execute({
          action: 'update',
          id,
          name,
        });
    }, node.id);
    await beginOrbit();
    await rotate();
    assert.deepEqual((await metrics()).writes, []);
    assert.equal((await metrics()).serializations, 0);
    await page.mouse.up();
    await h.saved(page);
    const modelMetrics = await metrics();
    assert.equal(
      modelMetrics.replies,
      1,
      'Worker successfully prepares the full save',
    );
    assert.equal(
      modelMetrics.serializations,
      1,
      'One background serialization for the edit burst',
    );
    assert.equal(
      modelMetrics.writes.filter((w) => w.key === 'flatplan.editor.v1').length,
      1,
    );
    assert.equal(
      JSON.parse(await raw()).scene.objects.find((n) => n.id === node.id).name,
      'Saved final',
    );
    await h.call(page, 'save_editor_project');
    await h.call(page, 'save_editor_project');
    assert.deepEqual(
      await metrics(),
      { ...modelMetrics, commits: (await metrics()).commits },
      'Unchanged manual saves do no storage/worker work',
    );
    await page.reload();
    await h.loaded(page);
    await h.saved(page);
    assert.equal(
      (await h.project(page)).scene.objects.find((n) => n.id === node.id).name,
      'Saved final',
    );
    await page.screenshot({ path: path.join(out, 'perf-021-autosave.png') });
    assert.deepEqual(errors, []);
    console.log(
      `PERF-021: orbit/walk 0 React commits, 0 full saves; one ${orbitMetrics.writes[0].bytes}-byte view save vs ${Buffer.byteLength(base)}-byte model; model edits one worker/one full write; live lifecycle flush/reload passed`,
    );
  } finally {
    await context.close();
  }
  const blocked = await browser.newContext({
    viewport: { width: 1365, height: 900 },
  });
  await h.installTools(blocked);
  await blocked.addInitScript(() => {
    Object.defineProperty(window, 'localStorage', {
      get() {
        throw new DOMException('Storage disabled', 'SecurityError');
      },
    });
  });
  const blockedPage = await blocked.newPage(),
    blockedErrors = [];
  blockedPage.on('pageerror', (error) => blockedErrors.push(error.message));
  try {
    await blockedPage.goto(url);
    await h.loaded(blockedPage);
    assert.equal((await h.status(blockedPage)).status.storagePaused, true);
    assert.equal((await h.status(blockedPage)).status.saveStatus, 'error');
    assert.ok(
      (await h.project(blockedPage)).scene.objects.length > 0,
      'Blocked storage still permits project export',
    );
    await h.panel(blockedPage, 'Файл');
    await blockedPage
      .getByRole('button', {
        name: 'Продолжить с текущим проектом',
        exact: true,
      })
      .click();
    assert.equal((await h.status(blockedPage)).status.storagePaused, true);
    assert.deepEqual(blockedErrors, []);
    console.log(
      'PERF-021: blocked localStorage preserves the editor, export and recovery error state',
    );
  } finally {
    await blocked.close();
  }
}
