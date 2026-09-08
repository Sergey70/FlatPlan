import assert from 'node:assert/strict';
import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { createRoomProposalProject } from '../lib/room-proposal.ts';
import { measuredRooms } from '../lib/room-surfaces.ts';
import { findNode } from '../lib/editor-model.ts';
import { defaultFinish } from '../lib/design-types.ts';
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
async function memory(page) {
  return page.evaluate(() =>
    Object.fromEntries(
      Object.keys(localStorage).map((k) => [k, localStorage.getItem(k)]),
    ),
  );
}
async function downloadResult(page, figure, file, width = 1280) {
  const wait = page.waitForEvent('download');
  await figure.getByRole('link', { name: 'Скачать PNG', exact: true }).click();
  await (await wait).saveAs(file);
  const bytes = await readFile(file);
  assert.equal(bytes.subarray(1, 4).toString(), 'PNG');
  assert.equal(bytes.readUInt32BE(16), width);
  assert.equal(bytes.readUInt32BE(20), Math.round((width * 2) / 3));
  const pixels = await figure.locator('img').evaluate(async (image) => {
    await image.decode();
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 43;
    const context = canvas.getContext('2d');
    context.drawImage(image, 0, 0, 64, 43);
    const data = context.getImageData(0, 0, 64, 43).data;
    const values = [];
    for (let i = 0; i < data.length; i += 4)
      values.push((data[i] + data[i + 1] + data[i + 2]) / 3);
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    return {
      mean,
      bright: values.filter((v) => v > 35).length / values.length,
      deviation: Math.sqrt(
        values.reduce((a, b) => a + (b - mean) ** 2, 0) / values.length,
      ),
    };
  });
  assert.ok(
    pixels.mean > 40 && pixels.bright > 0.3 && pixels.deviation > 5,
    `Blank or unusably dark daytime render: ${JSON.stringify(pixels)}`,
  );
  return hash(bytes);
}
async function ready(dialog) {
  await dialog.locator('[data-render-ready="true"]').waitFor();
}
async function complete(dialog) {
  // GitHub's software renderer completed the real four-view batch in just over
  // three minutes. Allow bounded CI headroom without changing render quality.
  await dialog.getByText(/^Готово:/).waitFor({
    timeout: process.env.CI ? 600000 : 180000,
  });
}
export async function checkPresentation(browser, url, out, h) {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
  });
  await h.installTools(context);
  const page = await context.newPage(),
    errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  let releaseTexture = () => {};
  try {
    await page.goto(url);
    await h.loaded(page);
    const fixture = createRoomProposalProject();
    await h.call(page, 'import_editor_project', {
      json: JSON.stringify(fixture),
    });
    await h.saved(page);
    const before = await h.project(page),
      beforeStorage = await memory(page);
    await h.panel(page, 'Ремонт');
    await page
      .getByRole('button', { name: 'Изображения', exact: true })
      .click();
    // Hold a real prerequisite so cancellation has a stable opportunity on both
    // hardware WebGL and slower CI software rendering; do not race a finished PNG.
    const textureGate = new Promise((resolve) => {
      releaseTexture = resolve;
    });
    let textureRequested;
    const requestSeen = new Promise((resolve) => {
      textureRequested = resolve;
    });
    let textureContinued;
    const routeComplete = new Promise((resolve) => {
      textureContinued = resolve;
    });
    const holdTexture = async (route) => {
      textureRequested();
      await textureGate;
      await route.continue();
      textureContinued();
    };
    await page.route('**/textures/oak.jpg', holdTexture);
    await page
      .getByRole('button', { name: 'Открыть изображения', exact: true })
      .click();
    const dialog = page.getByRole('dialog', {
      name: 'Изображения текущей модели',
      exact: true,
    });
    await ready(dialog);
    await requestSeen;
    await dialog
      .getByLabel('Размер изображения', { exact: true })
      .selectOption('1280');
    await dialog
      .getByRole('button', { name: 'Создать изображение', exact: true })
      .click();
    await dialog
      .getByRole('button', { name: 'Отменить создание', exact: true })
      .click();
    await dialog
      .getByText(
        'Создание изображений отменено. Готовые снимки доступны ниже.',
        { exact: true },
      )
      .waitFor();
    assert.equal(await dialog.locator('.ed-render-results figure').count(), 0);
    releaseTexture();
    await routeComplete;
    await page.unroute('**/textures/oak.jpg', holdTexture);
    const rooms = measuredRooms(fixture.scene.objects),
      names = ['Кухня', 'Комната 1', 'Спальня', 'Санузел'];
    let firstHash;
    for (const [index, name] of names.entries()) {
      const room = rooms.find((r) => r.name === name);
      await dialog
        .getByLabel('Помещение для изображений', { exact: true })
        .selectOption(room.id);
      assert.equal(
        await dialog
          .getByLabel('Ракурс изображения', { exact: true })
          .locator('option')
          .count(),
        5,
      );
      await dialog
        .getByRole('button', {
          name: 'Создать ракурсы помещения (4)',
          exact: true,
        })
        .click();
      await complete(dialog);
      const figures = dialog.locator('.ed-render-results figure'),
        count = await figures.count();
      assert.ok(count >= 4 && count <= 12);
      const hashes = [];
      for (let i = 0; i < 4; i++)
        hashes.push(
          await downloadResult(
            page,
            figures.nth(count - 4 + i),
            path.join(out, `renovation-017-render-${index + 1}-${i + 1}.png`),
          ),
        );
      assert.equal(new Set(hashes).size, 4);
      if (index === 0) firstHash = hashes[0];
      await page.screenshot({
        path: path.join(out, `renovation-017-render-room-${index + 1}.png`),
      });
      console.log(
        `PASS R17-1 ${name}: four distinct actual 1280×853 PNG exports`,
      );
    }
    await dialog
      .getByLabel('Размер изображения', { exact: true })
      .selectOption('2560');
    await dialog
      .getByRole('button', { name: 'Создать изображение', exact: true })
      .click();
    await complete(dialog);
    await downloadResult(
      page,
      dialog.locator('.ed-render-results figure').last(),
      path.join(out, 'renovation-017-render-2560.png'),
      2560,
    );
    await dialog
      .getByRole('button', { name: 'Закрыть изображения', exact: true })
      .click();
    await h.saved(page);
    assert.deepEqual(await h.project(page), before);
    assert.deepEqual(await memory(page), beforeStorage);
    const changed = structuredClone(before);
    findNode(
      changed.scene.objects,
      rooms.find((r) => r.name === 'Кухня').id,
    ).finish = { ...defaultFinish('tile'), color: '#237db0' };
    await h.call(page, 'import_editor_project', {
      json: JSON.stringify(changed),
    });
    await h.saved(page);
    const editedBefore = await h.project(page);
    await page
      .getByRole('button', { name: 'Открыть изображения', exact: true })
      .click();
    await ready(dialog);
    await dialog
      .getByLabel('Размер изображения', { exact: true })
      .selectOption('1280');
    await dialog
      .getByLabel('Ракурс изображения', { exact: true })
      .selectOption({ index: 1 });
    await dialog
      .getByRole('button', { name: 'Создать изображение', exact: true })
      .click();
    await complete(dialog);
    const editedHash = await downloadResult(
      page,
      dialog.locator('.ed-render-results figure').last(),
      path.join(out, 'renovation-017-render-edited.png'),
    );
    assert.notEqual(editedHash, firstHash);
    await page.keyboard.press('Escape');
    assert.deepEqual(await h.project(page), editedBefore);
    // Texture failures are surfaced, with safe close/reopen recovery.
    await page.route('**/textures/oak.jpg', (route) => route.abort());
    await page
      .getByRole('button', { name: 'Открыть изображения', exact: true })
      .click();
    await ready(dialog);
    await dialog.getByRole('alert').waitFor();
    await dialog
      .getByRole('button', { name: 'Создать изображение', exact: true })
      .click();
    await dialog
      .getByRole('alert')
      .filter({ hasText: 'Не удалось загрузить текстуру' })
      .waitFor();
    await page.keyboard.press('Escape');
    await page.unroute('**/textures/oak.jpg');
    assert.deepEqual(errors, []);
    console.log(
      'PASS R17-1 desktop: cancel, 12-image limit, current edited finish, actual PNG size, storage preservation and texture failure handling',
    );
  } catch (error) {
    await page.screenshot({
      path: path.join(out, 'renovation-017-render-failure.png'),
    });
    console.log(
      errors,
      await page
        .locator('.ed-render-dialog')
        .innerText()
        .catch(() => ''),
    );
    throw error;
  } finally {
    releaseTexture();
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
    await phone.getByRole('button', { name: 'Изображения', exact: true }).tap();
    await phone
      .getByRole('button', { name: 'Открыть изображения', exact: true })
      .tap();
    const dialog = phone.getByRole('dialog', {
      name: 'Изображения текущей модели',
      exact: true,
    });
    await ready(dialog);
    for (const width of [360, 390, 768]) {
      await phone.setViewportSize({ width, height: 844 });
      await h.noOverflow(phone);
      await phone.screenshot({
        path: path.join(out, `renovation-017-render-${width}.png`),
      });
    }
    await dialog
      .getByRole('button', { name: 'Создать изображение', exact: true })
      .tap();
    await complete(dialog);
    await downloadResult(
      phone,
      dialog.locator('.ed-render-results figure').last(),
      path.join(out, 'renovation-017-render-mobile.png'),
    );
    const close = dialog.getByRole('button', {
      name: 'Закрыть изображения',
      exact: true,
    });
    const box = await close.boundingBox();
    assert.ok(box.y >= 0 && box.y + box.height <= 844);
    await close.tap();
    assert.deepEqual(await h.project(phone), before);
    console.log(
      'PASS R17-1 mobile: 360/390/768, actual PNG download, reachable close and project preservation',
    );
  } finally {
    await mobile.close();
  }
}
