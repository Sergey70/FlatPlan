import assert from 'node:assert/strict';
import path from 'node:path';
import { createRoomProposalProject } from '../lib/room-proposal.ts';
import { defaultSun } from '../lib/design-types.ts';
import { suggestedStudy } from '../lib/workplace-sun.ts';
export async function checkSunStudy(browser, url, out, h) {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
  });
  await h.installTools(context);
  const page = await context.newPage(),
    errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const run = async (p) => {
    await p
      .getByRole('button', { name: 'Рассчитать солнце', exact: true })
      .click();
    await p
      .locator('.ed-study-result')
      .waitFor({ state: 'visible', timeout: 30000 });
  };
  const setup = () => {
    const source = createRoomProposalProject();
    source.scene.view.mode = '2d';
    source.scene.view.sunlight = { ...defaultSun, date: '2026-12-21' };
    return source;
  };
  const open = async (p) => {
    await h.panel(p, 'Ремонт');
    await p.getByRole('button', { name: 'Солнце', exact: true }).click();
  };
  try {
    await page.goto(url);
    await h.loaded(page);
    const source = setup();
    await h.call(page, 'import_editor_project', {
      json: JSON.stringify(source),
    });
    await open(page);
    assert.equal(await page.locator('.ed-study-target').count(), 3);
    assert.equal((await h.project(page)).scene.workplaceStudy, undefined);
    await run(page);
    assert.ok(
      await page
        .getByText('После поворота найдены пересечения', { exact: false })
        .isVisible(),
    );
    const rows = page.locator('[data-study-scenario]');
    assert.equal(await rows.count(), 4);
    assert.equal(await rows.nth(0).locator('td').first().innerText(), '150');
    assert.equal(await page.locator('.ed-study-heatmap rect').count(), 25);
    const planBox = await page.locator('.ed-study-plan').boundingBox(),
      heatBox = await page.locator('.ed-study-heatmap').boundingBox();
    assert.ok(planBox.width >= 200 && planBox.height >= 200);
    assert.ok(heatBox.width >= 100 && heatBox.height >= 100);
    assert.ok(
      (await page.locator('.ed-study-heatmap rect[fill="#e89a24"]').count()) >
        0,
    );
    await page.locator('.ed-study-result').scrollIntoViewIfNeeded();
    await page.screenshot({
      path: path.join(out, 'renovation-017-sun-winter-desktop.png'),
    });
    await page.locator('.ed-study-plan').scrollIntoViewIfNeeded();
    await page.screenshot({
      path: path.join(out, 'renovation-017-sun-points-desktop.png'),
    });
    await page
      .getByLabel('Поверхность отчёта', { exact: true })
      .selectOption('1');
    assert.equal(await rows.nth(0).locator('td').first().innerText(), '90');
    await rows.nth(1).getByRole('button').click();
    assert.equal(
      await rows.nth(1).getByRole('button').getAttribute('aria-pressed'),
      'true',
    );
    await page.locator('.ed-study-time').last().click();
    assert.equal(
      await page.locator('.ed-study-time').last().getAttribute('aria-pressed'),
      'true',
    );
    await page
      .locator('summary')
      .getByText('Шторы и жалюзи', { exact: true })
      .click();
    await h.editField(page, 'Рулонная штора закрыта, %', 100);
    assert.equal(await page.locator('.ed-study-result').count(), 0);
    await run(page);
    assert.equal(
      await page
        .locator('[data-study-scenario="roller"] td')
        .first()
        .innerText(),
      '0',
    );
    const after = await h.project(page);
    assert.deepEqual(after.scene.objects, source.scene.objects);
    assert.deepEqual(after.arrangements, source.arrangements);
    assert.equal(after.scene.workplaceStudy.shades.roller, 1);
    await h.call(page, 'editor_history', { action: 'undo' });
    assert.equal(
      (await h.project(page)).scene.workplaceStudy.shades.roller,
      0.5,
    );
    await h.call(page, 'editor_history', { action: 'redo' });
    assert.equal((await h.project(page)).scene.workplaceStudy.shades.roller, 1);
    await h.saved(page);
    const persisted = await h.project(page);
    await page.reload();
    await h.loaded(page);
    await h.saved(page);
    assert.deepEqual(await h.project(page), persisted);
    await open(page);
    await page.getByRole('button', { name: 'Лето', exact: true }).click();
    await run(page);
    assert.equal(
      await page
        .locator('[data-study-scenario="current"] td')
        .first()
        .innerText(),
      '0',
    );
    await page
      .getByRole('button', { name: 'Убрать поверхность 3', exact: true })
      .click();
    assert.equal(
      (await h.project(page)).scene.workplaceStudy.targets.length,
      2,
    );
    await page
      .getByLabel('Добавить поверхность для солнца', { exact: true })
      .selectOption('proposal-monitor-2-screen');
    await page
      .getByRole('button', { name: 'Добавить в анализ', exact: true })
      .click();
    assert.equal(
      (await h.project(page)).scene.workplaceStudy.targets.length,
      3,
    );
    const pending = await h.project(page);
    pending.scene.workplaceStudy.start = 0;
    pending.scene.workplaceStudy.end = 1440;
    pending.scene.workplaceStudy.step = 15;
    await h.call(page, 'import_editor_project', {
      json: JSON.stringify(pending),
    });
    assert.equal(
      await page.getByLabel('Конец работы', { exact: true }).inputValue(),
      '00:00',
    );
    await page
      .getByRole('button', { name: 'Рассчитать солнце', exact: true })
      .click();
    await page
      .getByRole('button', { name: 'Отменить расчёт', exact: true })
      .click();
    await page
      .getByRole('alert')
      .filter({ hasText: 'Расчёт отменён.' })
      .waitFor();
    assert.ok(
      await page
        .getByRole('button', { name: 'Рассчитать солнце', exact: true })
        .isEnabled(),
    );
    assert.deepEqual(errors, []);
    console.log(
      'PASS R17-4 desktop: actual winter desk/two monitors, four scenarios, turning conflicts, shading, stale results, surface editing, history/reload, summer and cancellation',
    );
  } catch (e) {
    await page.screenshot({
      path: path.join(out, 'renovation-017-sun-failure.png'),
    });
    console.log(
      (await page.locator('.ed-panel').innerText()).slice(-4500),
      errors,
    );
    throw e;
  } finally {
    await context.close();
  }
  const mobile = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  await h.installTools(mobile);
  const phone = await mobile.newPage();
  try {
    await phone.goto(url);
    await h.loaded(phone);
    const source = setup();
    source.scene.workplaceStudy = suggestedStudy(source.scene.objects);
    await h.call(phone, 'import_editor_project', {
      json: JSON.stringify(source),
    });
    await open(phone);
    await phone.getByLabel('Начало работы', { exact: true }).fill('10:00');
    assert.equal((await h.project(phone)).scene.workplaceStudy.start, 600);
    await run(phone);
    for (const width of [360, 390, 768]) {
      await phone.setViewportSize({ width, height: 844 });
      await phone.locator('.ed-study-result').scrollIntoViewIfNeeded();
      await h.noOverflow(phone);
      const diagramBox = await phone.locator('.ed-study-plan').boundingBox();
      assert.ok(diagramBox.width >= 200 && diagramBox.height >= 200);
      await phone.screenshot({
        path: path.join(out, `renovation-017-sun-${width}.png`),
      });
    }

    await phone.setViewportSize({ width: 390, height: 844 });
    await phone.locator('.ed-study-heatmap').scrollIntoViewIfNeeded();
    await phone.screenshot({
      path: path.join(out, 'renovation-017-sun-points-mobile.png'),
    });
    await phone
      .getByLabel('Поверхность отчёта', { exact: true })
      .selectOption('2');
    await phone.locator('[data-study-scenario="blinds"] button').tap();
    assert.equal(
      await phone
        .locator('[data-study-scenario="blinds"] button')
        .getAttribute('aria-pressed'),
      'true',
    );
    await h.saved(phone);
    const p = await h.project(phone);
    await phone.reload();
    await h.loaded(phone);
    await h.saved(phone);
    assert.deepEqual(await h.project(phone), p);
    console.log(
      'PASS R17-4 touch: work hours, scenario/target controls, 360/390/768 report and reload',
    );
  } finally {
    await mobile.close();
  }
}
