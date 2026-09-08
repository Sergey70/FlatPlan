import assert from 'node:assert/strict';
import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { createPlanProject } from '../lib/plan-project.ts';
import { estimateScene } from '../lib/estimate.ts';
export async function checkEstimate(browser, url, out, h) {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
  });
  await h.installTools(context);
  const page = await context.newPage(),
    errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  try {
    await page.goto(url);
    await h.loaded(page);
    await h.call(page, 'import_editor_project', {
      json: JSON.stringify(createPlanProject()),
    });
    await h.panel(page, 'Ремонт');
    await page.getByRole('button', { name: 'Смета', exact: true }).click();
    assert.ok(
      await page.getByText('Не заданы цены:', { exact: false }).isVisible(),
    );
    const initial = await h.project(page),
      beforeGeometry = initial.scene.objects;
    const first = page
      .getByRole('region', { name: 'Материалы и смета', exact: true })
      .locator('details')
      .filter({ has: page.locator('summary', { hasText: /^Пол ·/ }) })
      .first();
    await first.locator('summary').click();
    await h.editField(page, 'Цена за единицу 1', 25);
    await h.editField(page, 'м² на единицу покупки 1', 2.2);
    await h.editField(page, 'Кратность покупки 1', 1);
    const unit = page.getByRole('textbox', {
      name: 'Единица покупки 1',
      exact: true,
    });
    await unit.fill('упак.');
    await unit.press('Tab');
    let p = await h.project(page);
    assert.equal(p.scene.estimate.rates[0].price, 25);
    assert.equal(p.scene.estimate.rates[0].coverage, 2.2);
    assert.ok(estimateScene(p.scene).total > 0);
    assert.deepEqual(p.scene.objects, beforeGeometry);
    await h.call(page, 'manage_editor_arrangement', {
      action: 'save',
      name: 'Исходная цена',
    });
    const oldId = (await h.project(page)).activeArrangement;
    await h.editField(page, 'Цена за единицу 1', 50);
    p = await h.project(page);
    const full = estimateScene(p.scene);
    const compare = page
      .locator('summary')
      .getByText('Сравнить стоимость с вариантом', { exact: true });
    await compare.click();
    await page
      .getByLabel('Вариант для сравнения сметы', { exact: true })
      .selectOption(oldId);
    assert.ok(await page.getByText('Разница:', { exact: false }).isVisible());
    await page.screenshot({
      path: path.join(out, 'renovation-017-estimate-desktop.png'),
    });
    const kitchen = full.measured.rooms.find((r) => r.name === 'Кухня');
    await page
      .getByLabel('Помещение для сметы', { exact: true })
      .selectOption(kitchen.id);
    assert.ok(
      await page.getByRole('cell', { name: '21,43', exact: true }).isVisible(),
    );
    const download = page.waitForEvent('download');
    await page
      .getByRole('button', { name: 'Скачать ведомость CSV', exact: true })
      .click();
    const file = await download;
    const csvPath = path.join(out, 'renovation-017-materials.csv');
    await file.saveAs(csvPath);
    const csv = await readFile(csvPath, 'utf8');
    assert.ok(csv.startsWith('\ufeff'));
    assert.ok(csv.includes('Стоимость, BYN'));
    assert.ok(csv.includes('упак.'));
    await h.saved(page);
    p = await h.project(page);
    await page.reload();
    await h.loaded(page);
    await h.saved(page);
    assert.deepEqual(await h.project(page), p);
    assert.deepEqual(errors, []);
    console.log(
      'PASS R17-6 desktop: manual price/coverage/packs, unchanged geometry, independent variant cost comparison, kitchen volumes, CSV and reload',
    );
  } catch (error) {
    await page.screenshot({
      path: path.join(out, 'renovation-017-estimate-failure.png'),
    });
    console.log(
      (await page.locator('.ed-panel').innerText()).slice(0, 5000),
      errors,
    );
    throw error;
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
    await h.panel(phone, 'Ремонт');
    await phone.getByRole('button', { name: 'Смета', exact: true }).tap();
    await h.editField(phone, 'Запас материалов, %', 15);
    assert.equal((await h.project(phone)).scene.estimate.waste, 15);
    for (const width of [360, 390, 768]) {
      await phone.setViewportSize({ width, height: 844 });
      await h.noOverflow(phone);
      await phone.screenshot({
        path: path.join(out, `renovation-017-estimate-${width}.png`),
      });
    }
    console.log(
      'PASS R17-6 mobile: editable waste and 360/390/768 estimate controls',
    );
  } finally {
    await mobile.close();
  }
}
