import assert from 'node:assert/strict';
import path from 'node:path';
import { createPlanProject, DEFAULT_PLAN_ID } from '../lib/plan-project.ts';
import { createDefaultProject } from '../lib/editor-project.ts';
import { ROOM_WORKSPACE_STORAGE_KEY } from '../lib/editor-model.ts';
import { ROOM_REPLACED_IDS } from '../lib/room-proposal.ts';
import { sameGeometry } from './browser-source-plan.mjs';
import * as h from './browser-helpers.mjs';

export async function checkRoomWorkspace(browser, url, out) {
  for (const mode of ['fresh', 'saved', 'edited', 'deleted', 'custom']) {
    const context = await browser.newContext({
      viewport: { width: 1365, height: 960 },
    });
    await h.installTools(context);
    const raw = createPlanProject();
    if (mode === 'saved') {
      raw.scene.objects.find((n) => n.id === 'plan-item-024').position[0] +=
        0.2;
      raw.arrangements.push({
        id: 'custom',
        name: 'Мой старый вариант',
        scene: structuredClone(raw.scene),
      });
    }
    if (mode === 'edited')
      raw.scene.objects.find((n) => n.id === 'plan-item-070').rotation[1] += 90;
    if (mode === 'deleted')
      raw.scene.objects = raw.scene.objects.filter(
        (n) => n.id !== 'plan-item-070',
      );
    if (mode === 'custom') {
      raw.arrangements.push({
        id: 'custom',
        name: 'Мой вариант',
        scene: structuredClone(raw.scene),
      });
      raw.activeArrangement = 'custom';
    }
    if (mode !== 'fresh')
      await context.addInitScript((value) => {
        if (!localStorage.getItem('room018-seeded')) {
          localStorage.setItem('flatplan.editor.v1', value);
          localStorage.setItem('room018-seeded', '1');
        }
      }, JSON.stringify(raw));
    const page = await context.newPage(),
      errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    try {
      await page.goto(mode === 'fresh' ? `${url}?layout=plan-2` : url);
      await h.loaded(page);
      await h.saved(page);
      const current = await h.project(page);
      if (mode === 'fresh' || mode === 'saved') {
        for (const id of ROOM_REPLACED_IDS)
          assert.ok(!current.scene.objects.some((n) => n.id === id));
        for (const id of [
          'plan-proposal-desk',
          'plan-proposal-chair',
          'proposal-monitor-1',
          'proposal-monitor-2',
          'proposal-computer',
        ])
          assert.ok(
            current.scene.objects.some((n) => n.id === id),
            id,
          );
        const expected = createDefaultProject();
        if (mode === 'saved')
          expected.scene.objects.find(
            (n) => n.id === 'plan-item-024',
          ).position[0] += 0.2;
        sameGeometry(current.scene.objects, expected.scene.objects);
      } else sameGeometry(current.scene.objects, raw.scene.objects);
      sameGeometry(
        current.arrangements.find((a) => a.id === DEFAULT_PLAN_ID).scene
          .objects,
        createDefaultProject().scene.objects,
      );
      if (mode === 'saved' || mode === 'custom')
        sameGeometry(current.arrangements.at(-1), raw.arrangements.at(-1));
      assert.equal(
        await page.evaluate(
          (key) => localStorage.getItem(key),
          ROOM_WORKSPACE_STORAGE_KEY,
        ),
        '1',
      );
      await page.reload();
      await h.loaded(page);
      await h.saved(page);
      sameGeometry(await h.project(page), current);
      if (mode === 'fresh') {
        await page.screenshot({ path: path.join(out, 'room-018-main-3d.png') });
        await h.call(page, 'configure_editor_view', {
          mode: '2d',
          labels: true,
        });
        await page.screenshot({ path: path.join(out, 'room-018-main-2d.png') });
        // An explicit source opening stays raw across reload, and can be undone.
        await h.panel(page, 'Объекты');
        await page
          .getByRole('button', { name: 'Открыть исходный .plan', exact: true })
          .click();
        await h.saved(page);
        sameGeometry((await h.project(page)).scene.objects, raw.scene.objects);
        await page.reload();
        await h.loaded(page);
        await h.saved(page);
        sameGeometry((await h.project(page)).scene.objects, raw.scene.objects);
        // Explicit imports are portable exact data, even when they contain old furniture.
        await h.call(page, 'import_editor_project', {
          json: JSON.stringify(raw),
        });
        await h.saved(page);
        await page.reload();
        await h.loaded(page);
        await h.saved(page);
        sameGeometry((await h.project(page)).scene.objects, raw.scene.objects);
        await h.panel(page, 'Файл');
        await page
          .getByText('Новый проект по файлу .plan', { exact: true })
          .click();
        await page
          .getByRole('button', { name: 'Создать заново', exact: true })
          .click();
        await h.saved(page);
        sameGeometry(
          (await h.project(page)).scene.objects,
          createDefaultProject().scene.objects,
        );
        for (const width of [360, 390, 768]) {
          await page.setViewportSize({ width, height: 844 });
          await h.noOverflow(page);
        }
      }
      assert.deepEqual(errors, []);
    } finally {
      await context.close();
    }
  }
  console.log(
    'ROOM-018: main default/deep link, saved-room upgrade, user edits/deletions/custom variants, original source/import, reload and new project passed.',
  );
}
