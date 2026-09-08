import assert from 'node:assert/strict';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { designFixture } from './design-fixture.ts';
import { clone, findNode, validateProject } from '../lib/editor-model.ts';
import { baseNode } from '../lib/editor-seed.ts';
import { createRoomProposalProject } from '../lib/room-proposal.ts';
import { defaultEstimate } from '../lib/renovation-types.ts';
import { estimateScene } from '../lib/estimate.ts';
function fixture() {
  const p = designFixture(),
    original = clone(p.scene);
  findNode(p.scene.objects, 'design-a').position[0] += 0.4;
  findNode(p.scene.objects, 'design-wall').geometry.size[1] = 2.9;
  p.scene.objects = p.scene.objects.filter((n) => n.id !== 'design-b');
  const added = baseNode('comparison-new', 'Новый шкаф', {
    kind: 'box',
    size: [0.8, 1.5, 0.5],
  });
  added.position = [5, 0.75, 4];
  p.scene.objects.push(added);
  const rate = estimateScene(p.scene).rows[0].rate;
  p.scene.estimate = { ...defaultEstimate(), rates: [{ ...rate, price: 20 }] };
  p.arrangements = [
    { id: 'baseline', name: 'Исходная расстановка', scene: original },
    { id: 'edited', name: 'Сохранённая расстановка', scene: clone(p.scene) },
  ];
  findNode(p.scene.objects, 'comparison-new').position[0] -= 0.1;
  p.activeArrangement = 'baseline';
  return validateProject(p);
}
const storage = (p) =>
  p.evaluate(() =>
    Object.fromEntries(
      Object.keys(localStorage)
        .sort()
        .map((k) => [k, localStorage.getItem(k)]),
    ),
  );
const hash = (buffer) => createHash('sha256').update(buffer).digest('hex');
async function open(page, h) {
  await h.panel(page, 'Ремонт');
  await page.getByRole('button', { name: 'Сравнение', exact: true }).click();
  await page
    .getByRole('button', { name: 'Открыть сравнение', exact: true })
    .click();
  await page
    .getByRole('dialog', { name: 'Сравнение планировок', exact: true })
    .waitFor();
}
async function ready3D(page) {
  await page
    .getByRole('button', { name: 'Сравнить в 3D', exact: true })
    .click();
  await page.waitForFunction(
    () =>
      document.querySelectorAll('[data-comparison-ready="true"]').length === 2,
  );
  await page.evaluate(
    () =>
      new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))),
  );
}
export async function checkComparison(browser, url, out, h) {
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
      json: JSON.stringify(fixture()),
    });
    await h.saved(page);
    const before = await h.project(page),
      beforeStorage = await storage(page);
    await open(page, h);
    assert.equal(
      await page
        .getByLabel('Вариант сравнения A', { exact: true })
        .inputValue(),
      'current',
    );
    assert.equal(
      await page
        .getByLabel('Вариант сравнения B', { exact: true })
        .inputValue(),
      'saved:baseline',
    );
    assert.equal(await page.locator('[data-comparison-change]').count(), 4);
    const plans = page.locator('.ed-compare-plan');
    const oldBox = await plans.first().getAttribute('viewBox');
    assert.equal(oldBox, await plans.last().getAttribute('viewBox'));
    const box = await plans.first().boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(
      box.x + box.width / 2 + 42,
      box.y + box.height / 2 + 25,
      { steps: 5 },
    );
    await page.mouse.up();
    assert.notEqual(await plans.first().getAttribute('viewBox'), oldBox);
    assert.equal(
      await plans.first().getAttribute('viewBox'),
      await plans.last().getAttribute('viewBox'),
    );
    await page
      .getByRole('button', { name: 'Приблизить оба варианта', exact: true })
      .click();
    assert.equal(
      await plans.first().getAttribute('viewBox'),
      await plans.last().getAttribute('viewBox'),
    );
    const tint = await plans
      .first()
      .locator('[data-comparison-object="design-a"]')
      .getAttribute('fill');
    await page.getByLabel('Подсветить изменения', { exact: true }).uncheck();
    assert.notEqual(
      await plans
        .first()
        .locator('[data-comparison-object="design-a"]')
        .getAttribute('fill'),
      tint,
    );
    await page.getByLabel('Подсветить изменения', { exact: true }).check();
    await page
      .getByLabel('Вариант сравнения A', { exact: true })
      .selectOption('saved:edited');
    await page
      .getByLabel('Вариант сравнения B', { exact: true })
      .selectOption('saved:edited');
    assert.equal(await page.locator('[data-comparison-change]').count(), 0);
    await page
      .getByLabel('Вариант сравнения A', { exact: true })
      .selectOption('current');
    assert.equal(
      await page.locator('[data-comparison-change]').count(),
      1,
      'Unsaved current differs from its saved copy',
    );
    await page
      .getByLabel('Вариант сравнения B', { exact: true })
      .selectOption('saved:baseline');
    const costs = page
      .getByRole('table', { name: 'Показатели двух планировок', exact: true })
      .getByRole('row')
      .filter({ hasText: /^Материалы/ });
    assert.equal(
      (await costs.locator('td').allTextContents()).join('|'),
      '792 BYN|0 BYN',
    );
    await h.editField(page, 'Порог узкого зазора в сравнении, см', 90);
    await ready3D(page);
    const canvases = page.locator('.ed-compare-canvas canvas'),
      a0 = hash(await canvases.nth(0).screenshot()),
      b0 = hash(await canvases.nth(1).screenshot());
    const initialCamera = await page
      .locator('[data-comparison-side="A"]')
      .getAttribute('data-comparison-camera');
    const canvas = await canvases.nth(0).boundingBox();
    await page.mouse.move(
      canvas.x + canvas.width / 2,
      canvas.y + canvas.height / 2,
    );
    await page.mouse.down();
    await page.mouse.move(
      canvas.x + canvas.width / 2 + 110,
      canvas.y + canvas.height / 2 + 40,
      { steps: 8 },
    );
    await page.mouse.up();
    await page.waitForFunction(
      (old) =>
        document.querySelector('[data-comparison-side="A"]').dataset
          .comparisonCamera !== old,
      initialCamera,
    );
    assert.equal(
      await page
        .locator('[data-comparison-side="A"]')
        .getAttribute('data-comparison-camera'),
      await page
        .locator('[data-comparison-side="B"]')
        .getAttribute('data-comparison-camera'),
    );
    assert.notEqual(hash(await canvases.nth(0).screenshot()), a0);
    assert.notEqual(hash(await canvases.nth(1).screenshot()), b0);
    await page.getByLabel('Срез стен в сравнении', { exact: true }).uncheck();
    await page.keyboard.press('ControlOrMeta+z');
    await page.keyboard.press('Delete');
    await page
      .getByRole('button', { name: 'Закрыть сравнение', exact: true })
      .click();
    assert.equal(await page.locator('.ed-compare-canvas canvas').count(), 0);
    assert.deepEqual(await h.project(page), before);
    assert.deepEqual(await storage(page), beforeStorage);
    const actual = createRoomProposalProject();
    actual.scene.view.mode = '2d';
    findNode(actual.scene.objects, 'plan-proposal-desk').position[0] += 0.35;
    await h.call(page, 'import_editor_project', {
      json: JSON.stringify(actual),
    });
    await h.saved(page);
    const apartment = await h.project(page),
      apartmentStorage = await storage(page);
    await open(page, h);
    await page.screenshot({
      path: path.join(out, 'renovation-017-comparison-plan.png'),
    });
    await ready3D(page);
    await page.screenshot({
      path: path.join(out, 'renovation-017-comparison-3d.png'),
    });
    await page
      .getByRole('button', { name: 'Сравнить планы', exact: true })
      .click();
    await ready3D(page);
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('.ed-comparison-dialog').count(), 0);
    await page
      .getByRole('button', { name: 'Открыть сравнение', exact: true })
      .click();
    await page
      .getByRole('button', { name: 'Закрыть сравнение', exact: true })
      .click();
    assert.deepEqual(await h.project(page), apartment);
    assert.deepEqual(await storage(page), apartmentStorage);
    assert.deepEqual(errors, []);
    console.log(
      'PASS R17-7 desktop: current/two saved choices, four object differences, geometry tints, paired pan/zoom, actual paired 3D image changes, cost/gap reports and unchanged project/storage',
    );
  } catch (e) {
    await page.screenshot({
      path: path.join(out, 'renovation-017-comparison-failure.png'),
    });
    console.log(errors);
    throw e;
  } finally {
    await context.close();
  }
  const mobile = await browser.newContext({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true,
  });
  await h.installTools(mobile);
  const phone = await mobile.newPage();
  try {
    await phone.goto(url);
    await h.loaded(phone);
    await h.call(phone, 'import_editor_project', {
      json: JSON.stringify(fixture()),
    });
    await h.saved(phone);
    const before = await h.project(phone),
      saved = await storage(phone);
    await open(phone, h);
    for (const width of [360, 390, 768]) {
      await phone.setViewportSize({ width, height: 844 });
      await h.noOverflow(phone);
      const modal = await phone.locator('.ed-comparison-dialog').boundingBox();
      assert.ok(modal.width <= width);
      await phone.screenshot({
        path: path.join(out, `renovation-017-comparison-${width}.png`),
      });
    }
    await phone.setViewportSize({ width: 390, height: 844 });
    const plans = phone.locator('.ed-compare-plan');
    await plans.first().scrollIntoViewIfNeeded();
    const old = await plans.first().getAttribute('viewBox'),
      box = await plans.first().boundingBox(),
      session = await mobile.newCDPSession(phone);
    const x = box.x + box.width / 2,
      y = box.y + box.height / 2;
    await session.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [{ x, y, id: 1 }],
    });
    await session.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [{ x: x + 35, y: y + 20, id: 1 }],
    });
    await session.send('Input.dispatchTouchEvent', {
      type: 'touchEnd',
      touchPoints: [],
    });
    assert.notEqual(await plans.first().getAttribute('viewBox'), old);
    assert.equal(
      await plans.first().getAttribute('viewBox'),
      await plans.last().getAttribute('viewBox'),
    );

    const oldSpan = Number(
      (await plans.first().getAttribute('viewBox')).split(' ')[2],
    );
    await session.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [
        { x: x - 25, y, id: 1 },
        { x: x + 25, y, id: 2 },
      ],
    });
    await session.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [
        { x: x - 55, y, id: 1 },
        { x: x + 55, y, id: 2 },
      ],
    });
    await session.send('Input.dispatchTouchEvent', {
      type: 'touchEnd',
      touchPoints: [],
    });
    assert.ok(
      Number((await plans.first().getAttribute('viewBox')).split(' ')[2]) <
        oldSpan * 0.8,
    );
    assert.equal(
      await plans.first().getAttribute('viewBox'),
      await plans.last().getAttribute('viewBox'),
    );
    await phone
      .getByRole('button', { name: 'Приблизить оба варианта', exact: true })
      .tap();
    await ready3D(phone);
    await phone.locator('[data-comparison-side="B"]').scrollIntoViewIfNeeded();
    await phone.screenshot({
      path: path.join(out, 'renovation-017-comparison-3d-mobile.png'),
    });
    const closeBox = await phone
      .getByRole('button', { name: 'Закрыть сравнение', exact: true })
      .boundingBox();
    assert.ok(
      closeBox.y >= 0 && closeBox.y + closeBox.height < 844,
      'Close remains reachable while scrolling the mobile report',
    );
    await phone
      .getByRole('button', { name: 'Закрыть сравнение', exact: true })
      .tap();
    assert.deepEqual(await h.project(phone), before);
    assert.deepEqual(await storage(phone), saved);
    console.log(
      'PASS R17-7 mobile: 360/390/768 dialog, touch synchronized pan, paired 3D, close and unchanged storage',
    );
  } finally {
    await mobile.close();
  }
}
