import assert from 'node:assert/strict';
import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { createPlanProject } from '../lib/plan-project.ts';
import { buildElevations, buildDrawingSet } from '../lib/drawing-sheets.ts';
import { createElectricalPoint } from '../lib/electrical.ts';
import { findNode } from '../lib/editor-model.ts';
import { defaultFinish } from '../lib/design-types.ts';
async function storage(page) {
  return page.evaluate(() =>
    Object.fromEntries(
      Object.keys(localStorage).map((k) => [k, localStorage.getItem(k)]),
    ),
  );
}
export async function checkDrawings(browser, url, out, h) {
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
    const fixture = createPlanProject(),
      roomIds = ['plan-floor-room-036', 'plan-floor-room-037'];
    const elevation = buildElevations(fixture.scene, [
      'plan-floor-room-037',
    ]).find((e) => e.max[0] - e.min[0] > 4);
    const point = elevation.origin
      .clone()
      .addScaledVector(elevation.u, (elevation.min[0] + elevation.max[0]) / 2)
      .addScaledVector(elevation.v, 0.95 - elevation.origin.y)
      .addScaledVector(elevation.normal, 0.03);
    const socket = createElectricalPoint(
      'socket',
      point.toArray(),
      'Кухонная техника',
    );
    socket.name = 'Розетка над столешницей';
    fixture.scene.objects.push(socket);
    const wall = findNode(
      fixture.scene.objects,
      elevation.parts.find((p) => p.kind === 'wall').id,
    );
    wall.finish = {
      ...defaultFinish('tile'),
      color: '#ded8c7',
      width: 0.6,
      height: 0.3,
    };
    await h.call(page, 'import_editor_project', {
      json: JSON.stringify(fixture),
    });
    await h.saved(page);
    const before = await h.project(page),
      beforeStorage = await storage(page);
    await h.panel(page, 'Ремонт');
    await page.getByRole('button', { name: 'Чертежи', exact: true }).click();
    await page
      .getByRole('button', { name: 'Открыть чертежи', exact: true })
      .click();
    const dialog = page.getByRole('dialog', {
      name: 'Комплект чертежей',
      exact: true,
    });
    await dialog.waitFor();
    const select = dialog.getByLabel('Лист чертежей', { exact: true });
    const expected = buildDrawingSet(fixture.scene, fixture.name, roomIds);
    assert.equal(await select.locator('option').count(), expected.length);
    await page.screenshot({
      path: path.join(out, 'renovation-017-drawings-plan.png'),
    });
    const entry = expected.find(
      (s) => s.title === elevation.name && s.kind === 'elevation',
    );
    await select.selectOption(entry.id);
    await page.waitForFunction(() => {
      const image = document.querySelector('.ed-draw-sheet');
      return image?.complete && image.naturalWidth > 500;
    });
    await page.screenshot({
      path: path.join(out, 'renovation-017-drawings-elevation.png'),
    });
    const svgDownload = page.waitForEvent('download');
    await dialog
      .getByRole('link', { name: 'Скачать выбранный лист SVG', exact: true })
      .click();
    const svgFile = await svgDownload;
    const svgPath = path.join(out, 'renovation-017-elevation.svg');
    await svgFile.saveAs(svgPath);
    const svg = await readFile(svgPath, 'utf8');
    assert.ok(svg.includes('Розетка') && svg.includes('95'));
    assert.ok(svg.includes('Положение стены'));
    const imageWidth = await dialog
      .locator('.ed-draw-sheet')
      .evaluate((el) => el.getBoundingClientRect().width);
    await dialog
      .getByRole('button', { name: 'Увеличить лист', exact: true })
      .click();
    assert.ok(
      (await dialog
        .locator('.ed-draw-sheet')
        .evaluate((el) => el.getBoundingClientRect().width)) >
        imageWidth * 1.4,
    );
    await dialog
      .getByRole('button', { name: 'Уменьшить лист', exact: true })
      .click();
    const downloadButton = dialog.getByRole('button', {
      name: /^Скачать комплект PDF/,
    });
    await downloadButton.click();
    await dialog
      .getByRole('button', { name: 'Отменить экспорт PDF', exact: true })
      .click();
    await dialog.getByText('Экспорт отменён.', { exact: true }).waitFor();
    // A browser failure is visible, retry remains available and nothing is saved.
    await page.evaluate(() => {
      window.__drawingContext = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function (kind, ...args) {
        return kind === '2d'
          ? null
          : window.__drawingContext.call(this, kind, ...args);
      };
    });
    await downloadButton.click();
    await dialog
      .getByRole('alert')
      .filter({ hasText: 'Браузер не предоставил холст' })
      .waitFor();
    await page.evaluate(() => {
      HTMLCanvasElement.prototype.getContext = window.__drawingContext;
      delete window.__drawingContext;
    });
    const pdfDownload = page.waitForEvent('download', { timeout: 180000 });
    await downloadButton.click();
    const pdf = await pdfDownload;
    const pdfPath = path.join(out, 'renovation-017-drawings.pdf');
    await pdf.saveAs(pdfPath);
    const bytes = await readFile(pdfPath);
    assert.ok(bytes.subarray(0, 8).toString().startsWith('%PDF-1.4'));
    assert.ok(bytes.length > 100000);
    assert.ok(bytes.toString('latin1').includes(`/Count ${expected.length}`));
    await dialog
      .getByRole('button', { name: 'Закрыть чертежи', exact: true })
      .click();
    await h.saved(page);
    assert.deepEqual(await h.project(page), before);
    assert.deepEqual(await storage(page), beforeStorage);
    // Reopen after an edit must use fresh geometry, not the previous dialog snapshot.
    const changed = structuredClone(before);
    findNode(changed.scene.objects, wall.id).finish.color = '#ed983a';
    await h.call(page, 'import_editor_project', {
      json: JSON.stringify(changed),
    });
    await h.saved(page);
    await page
      .getByRole('button', { name: 'Открыть чертежи', exact: true })
      .click();
    await select.selectOption(entry.id);
    const fresh = await dialog.locator('.ed-draw-sheet').getAttribute('src');
    assert.ok(decodeURIComponent(fresh).includes('#ed983a'));
    await page.keyboard.press('Escape');
    assert.equal(await dialog.count(), 0);
    assert.deepEqual(errors, []);
    console.log(
      `PASS R17-5 desktop: ${expected.length} real apartment PDF sheets, exact edited wall/height, SVG, cancel/error/retry, source/storage unchanged and fresh reopen`,
    );
  } catch (error) {
    await page.screenshot({
      path: path.join(out, 'renovation-017-drawings-failure.png'),
    });
    console.log(errors);
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
    await h.saved(phone);
    const before = await h.project(phone);
    await h.panel(phone, 'Ремонт');
    await phone.getByRole('button', { name: 'Чертежи', exact: true }).tap();
    await phone
      .getByRole('button', { name: 'Открыть чертежи', exact: true })
      .tap();
    const dialog = phone.getByRole('dialog', {
      name: 'Комплект чертежей',
      exact: true,
    });
    await dialog.waitFor();
    for (const width of [360, 390, 768]) {
      await phone.setViewportSize({ width, height: 844 });
      await h.noOverflow(phone);
      await phone.screenshot({
        path: path.join(out, `renovation-017-drawings-${width}.png`),
      });
    }
    await dialog.getByLabel('Кухня', { exact: true }).uncheck();
    await dialog.getByLabel('Санузел', { exact: true }).uncheck();
    assert.equal(
      await dialog
        .getByLabel('Лист чертежей', { exact: true })
        .locator('option')
        .count(),
      4,
    );
    await dialog
      .getByRole('button', { name: 'Следующий лист', exact: true })
      .tap();
    assert.equal(
      await dialog.getByLabel('Лист чертежей', { exact: true }).inputValue(),
      'furniture',
    );
    const download = phone.waitForEvent('download');
    await dialog.getByRole('button', { name: /^Скачать комплект PDF/ }).tap();
    const file = await download;
    await file.saveAs(path.join(out, 'renovation-017-drawings-mobile.pdf'));
    const close = dialog.getByRole('button', {
      name: 'Закрыть чертежи',
      exact: true,
    });
    const box = await close.boundingBox();
    assert.ok(box.y >= 0 && box.y + box.height <= 844);
    await close.tap();
    assert.deepEqual(await h.project(phone), before);
    console.log(
      'PASS R17-5 mobile: 360/390/768, room selection, sheet navigation, actual PDF download, reachable close and project preservation',
    );
  } finally {
    await mobile.close();
  }
}
