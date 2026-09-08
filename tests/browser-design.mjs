import assert from 'node:assert/strict';
import path from 'node:path';
import { designFixture } from './design-fixture.ts';
import { createPlanProject } from '../lib/plan-project.ts';
import { defaultSun } from '../lib/design-types.ts';
import { nodeWorldMatrix } from '../lib/editor-geometry.ts';
import { sunDirection } from '../lib/sunlight.ts';
const near = (a, b, e = 0.005) =>
  assert.ok(Math.abs(a - b) < e, `${a} != ${b}`);
async function point(page, x, z) {
  return page.locator('.ed-plan > svg').evaluate(
    (svg, [x, z]) => {
      const p = new DOMPoint(x, z).matrixTransform(svg.getScreenCTM());
      return { x: p.x, y: p.y };
    },
    [x, z],
  );
}
async function drag(
  page,
  from,
  to,
  { alt = false, shift = false, inspect } = {},
) {
  const a = await point(page, ...from),
    b = await point(page, ...to);
  if (alt) await page.keyboard.down('Alt');
  if (shift) await page.keyboard.down('Shift');
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move(b.x, b.y, { steps: 12 });
  if (inspect) await inspect();
  await page.mouse.up();
  if (alt) await page.keyboard.up('Alt');
  if (shift) await page.keyboard.up('Shift');
}
export async function checkDesign(browser, url, out, h) {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
  });
  await h.installTools(context);
  await context.addInitScript((json) => {
    if (!localStorage.getItem('flatplan.editor.v1'))
      localStorage.setItem('flatplan.editor.v1', json);
  }, JSON.stringify(designFixture()));
  const page = await context.newPage(),
    errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(url);
  await h.loaded(page);
  try {
    const importScene = async (p) => {
      await h.call(page, 'import_editor_project', { json: JSON.stringify(p) });
    };
    await page
      .getByText('Расстановка, привязки и группы', { exact: true })
      .click();
    await page
      .getByRole('checkbox', { name: 'Выделять рамкой', exact: true })
      .check();
    await h.call(page, 'configure_editor_view', { furniture: false });
    await drag(page, [1.3, 1.3], [4.2, 2.7]);
    assert.ok(
      await page.getByText('Выбрано предметов: 0', { exact: true }).isVisible(),
      'Hidden furniture is not selectable by marquee',
    );
    await h.call(page, 'configure_editor_view', { furniture: true });
    await drag(page, [1.3, 1.3], [4.2, 2.7]);
    assert.ok(
      await page.getByText('Выбрано предметов: 2', { exact: true }).isVisible(),
    );
    await page
      .getByRole('checkbox', { name: 'Выделять рамкой', exact: true })
      .uncheck();
    await drag(page, [2, 2], [2.273, 2.367], {
      alt: true,
      inspect: async () => {
        assert.equal(await page.locator('[data-snap-guide]').count(), 0);
        assert.equal(
          await page.locator('[data-dimension-line]').count(),
          1,
          'Only the external wall distance is shown; selected furniture does not measure against itself',
        );
      },
    });
    let p = await h.project(page);
    near(p.scene.objects.find((n) => n.id === 'design-a').position[0], 2.273);
    near(p.scene.objects.find((n) => n.id === 'design-b').position[0], 3.773);
    near(p.scene.objects.find((n) => n.id === 'design-a').position[2], 2.367);
    await drag(page, [2.273, 2.367], [2.31, 2.452], {
      inspect: async () => {
        assert.ok(await page.locator('[data-snap-guide]').count());
        await page.screenshot({ path: path.join(out, 'design-016-drag.png') });
      },
    });
    p = await h.project(page);
    near(p.scene.objects.find((n) => n.id === 'design-a').position[0], 2.3);
    near(p.scene.objects.find((n) => n.id === 'design-a').position[2], 2.45);
    await page
      .getByRole('button', { name: 'Повернуть вместе', exact: true })
      .click();
    p = await h.project(page);
    const a = p.scene.objects.find((n) => n.id === 'design-a'),
      b = p.scene.objects.find((n) => n.id === 'design-b');
    near(a.position[0], b.position[0]);
    near(Math.abs(a.position[2] - b.position[2]), 1.5);
    await page
      .getByRole('textbox', { name: 'Название группы', exact: true })
      .fill('Рабочее место');
    const matrices = ['design-a', 'design-b'].map(
      (id) => nodeWorldMatrix(p.scene.objects, id).elements,
    );
    await page
      .getByRole('button', { name: 'Объединить в группу', exact: true })
      .click();
    p = await h.project(page);
    const group = p.scene.objects.find((n) => n.assembly);
    assert.ok(group);
    assert.equal(group.name, 'Рабочее место');
    ['design-a', 'design-b'].forEach((id, j) =>
      nodeWorldMatrix(p.scene.objects, id).elements.forEach((v, i) =>
        near(v, matrices[j][i], 1e-7),
      ),
    );
    await page
      .getByRole('button', { name: 'Копировать выбранные', exact: true })
      .click();
    p = await h.project(page);
    assert.equal(p.scene.objects.filter((n) => n.assembly).length, 2);
    await page
      .getByRole('button', { name: 'Разгруппировать', exact: true })
      .click();
    p = await h.project(page);
    assert.equal(p.scene.objects.filter((n) => n.assembly).length, 1);
    await h.call(page, 'editor_history', { action: 'undo' });
    assert.equal(
      (await h.project(page)).scene.objects.filter((n) => n.assembly).length,
      2,
    );
    await h.call(page, 'editor_history', { action: 'redo' });
    // Shift and touch checkboxes select whole objects without changing their poses.
    await importScene(designFixture());
    await h.panel(page, 'Объекты');
    await h.call(page, 'configure_editor_view', { selected: 'design-a' });
    const bp = await point(page, 3.5, 2);
    await page.keyboard.down('Shift');
    await page.mouse.click(bp.x, bp.y);
    await page.keyboard.up('Shift');
    assert.ok(
      await page.getByText('Выбрано предметов: 2', { exact: true }).isVisible(),
    );
    await page
      .getByRole('button', { name: 'Снять выделение группы', exact: true })
      .click();
    await page
      .getByRole('checkbox', { name: 'Выбрать вместе: Тумба A', exact: true })
      .check();
    await page
      .getByRole('combobox', { name: 'Стена для точного отступа', exact: true })
      .selectOption('design-wall');
    await h.editField(page, 'Отступ при привязке, см', 5);
    await page
      .getByRole('button', { name: 'Установить отступ от стены', exact: true })
      .click();
    near(
      (await h.project(page)).scene.objects.find((n) => n.id === 'design-a')
        .position[0],
      0.65,
    );
    // Per-surface materials and real dimensions persist through JSON and undo.
    await h.call(page, 'configure_editor_view', {
      selected: 'design-floor',
      mode: '3d',
      cutaway: true,
      camera: { position: [8, 9, 10], target: [3, 0, 3] },
    });
    await h.panel(page, 'Свойства');
    await page
      .getByRole('combobox', { name: 'Вид отделки', exact: true })
      .selectOption('tile');
    await h.editField(page, 'Ширина элемента отделки, см', 60);
    await h.editField(page, 'Высота / длина элемента, см', 30);
    await h.editField(page, 'Ширина шва, мм', 5);
    await page.getByRole('button', { name: 'Диагональ', exact: true }).click();
    const floor = (await h.project(page)).scene.objects.find(
      (n) => n.id === 'design-floor',
    );
    assert.deepEqual(
      [
        floor.finish.width,
        floor.finish.height,
        floor.finish.joint,
        floor.finish.angle,
      ],
      [0.6, 0.3, 0.005, 45],
    );
    await page.screenshot({ path: path.join(out, 'design-016-tile.png') });
    await h.call(page, 'configure_editor_view', { selected: 'design-wall' });
    await page
      .getByRole('combobox', { name: 'Сторона стены', exact: true })
      .selectOption('front');
    await page
      .getByRole('combobox', { name: 'Вид отделки', exact: true })
      .selectOption('stone');
    await page.getByLabel('Цвет отделки', { exact: true }).fill('#a14b36');
    await page
      .getByRole('combobox', { name: 'Сторона стены', exact: true })
      .selectOption('back');
    await page
      .getByRole('combobox', { name: 'Вид отделки', exact: true })
      .selectOption('tile');
    const wall = (await h.project(page)).scene.objects.find(
      (n) => n.id === 'design-wall',
    );
    assert.equal(wall.surfaces.front.color, '#a14b36');
    assert.equal(wall.surfaces.back.kind, 'tile');
    await h.call(page, 'editor_history', { action: 'undo' });
    assert.equal(
      (await h.project(page)).scene.objects.find((n) => n.id === 'design-wall')
        .surfaces.back,
      undefined,
    );
    await h.call(page, 'editor_history', { action: 'redo' });
    // Daylight settings use Minsk, editable north and civil time, with distinct rendered results.
    await h.panel(page, 'Варианты');
    await page
      .getByRole('checkbox', { name: 'Солнце по дате и времени', exact: true })
      .check();
    await page.getByLabel('Местное время', { exact: true }).fill('13:10');
    await page.getByRole('button', { name: 'Зима', exact: true }).click();
    await h.call(page, 'configure_editor_view', {
      camera: { position: [4.8, 1.6, 5], target: [1, 0.8, 2.5] },
    });
    p = await h.project(page);
    assert.equal(p.scene.view.sunlight.city, 'Минск');
    assert.equal(p.scene.view.sunlight.north, 90);
    assert.equal(p.scene.view.sunlight.minutes, 790);
    assert.equal(p.scene.view.sunlight.date, '2026-12-21');
    const canvas = page.locator('.ed-canvas canvas');
    await canvas.screenshot({ path: path.join(out, 'design-016-winter.png') });
    const winter = await canvas.screenshot();
    await page.getByRole('button', { name: 'Лето', exact: true }).click();
    await canvas.screenshot({ path: path.join(out, 'design-016-summer.png') });
    assert.notDeepEqual(await canvas.screenshot(), winter);
    await page
      .getByRole('combobox', { name: 'Режим солнца', exact: true })
      .selectOption('manual');
    await h.editField(page, 'Азимут солнца, °', 180);
    await h.editField(page, 'Высота солнца, °', 30);
    assert.ok(
      await page
        .getByText(
          'Условная иллюстрация: дата, город и время не используются.',
          { exact: true },
        )
        .isVisible(),
    );
    // Walk, mouse look, keyboard, named viewpoints, saved arrangements and reload.
    await page
      .getByRole('button', { name: 'Начать прогулку', exact: true })
      .click();
    p = await h.project(page);
    assert.equal(p.scene.view.walk.enabled, true);
    near(p.scene.view.camera.position[1], 1.6);
    const start = p.scene.view.camera;
    await page.keyboard.down('KeyW');
    await page.waitForFunction(
      (start) => {
        const p = window.__flatplanTools.get_editor_project.execute({}).project
          ?.scene?.view?.camera;
        const data = JSON.parse(
          window.__flatplanTools.export_editor_project.execute({}).json,
        ).scene.view.camera;
        return (
          Math.hypot(
            data.position[0] - start.position[0],
            data.position[2] - start.position[2],
          ) > 0.12
        );
      },
      start,
      { timeout: 5000 },
    );
    await page.keyboard.up('KeyW');
    p = await h.project(page);
    assert.ok(
      Math.hypot(
        p.scene.view.camera.position[0] - start.position[0],
        p.scene.view.camera.position[2] - start.position[2],
      ) > 0.1,
    );
    const box = await canvas.boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(
      box.x + box.width / 2 + 80,
      box.y + box.height / 2 - 20,
      { steps: 8 },
    );
    await page.mouse.up();
    const looked = (await h.project(page)).scene.view.camera;
    assert.notDeepEqual(looked.target, p.scene.view.camera.target);
    await page
      .getByRole('textbox', { name: 'Название ракурса', exact: true })
      .fill('Из кухни');
    await page
      .getByRole('button', { name: 'Сохранить текущий ракурс', exact: true })
      .click();
    const savedPoint = (await h.project(page)).scene.viewpoints[0];
    assert.deepEqual(savedPoint.camera, looked);
    await page.keyboard.press('Escape');
    assert.equal((await h.project(page)).scene.view.walk.enabled, false);
    await page.getByRole('button', { name: 'Из кухни', exact: true }).click();
    assert.deepEqual((await h.project(page)).scene.view.camera, looked);
    await h.call(page, 'manage_editor_arrangement', {
      action: 'save',
      name: 'С отделкой и солнцем',
    });
    await h.saved(page);
    const stored = await h.project(page);
    await page.reload();
    await h.loaded(page);
    assert.deepEqual((await h.project(page)).scene, stored.scene);
    await h.panel(page, 'Варианты');
    await page
      .getByRole('button', { name: 'Начать прогулку здесь', exact: true })
      .click();
    const place = await point(page, 4, 4);
    await page.mouse.click(place.x, place.y);
    p = await h.project(page);
    near(p.scene.view.camera.position[0], 4);
    near(p.scene.view.camera.position[2], 4);
    assert.equal(p.scene.view.walk.enabled, true);
    await page.keyboard.press('Escape');
    // Actual apartment: location presets do not edit the source, and sun comes from balcony side.
    const source = createPlanProject();
    source.scene.view.sunlight = {
      ...defaultSun,
      enabled: true,
      minutes: 790,
      date: '2026-12-21',
    };
    source.scene.view.cutaway = false;
    source.scene.view.labels = false;
    await importScene(source);
    await h.panel(page, 'Варианты');
    await page
      .getByRole('button', { name: 'Начать прогулку', exact: true })
      .click();
    p = await h.project(page);
    assert.deepEqual(p.scene.objects, source.scene.objects);
    assert.ok(sunDirection(p.scene.view.sunlight).direction[0] < 0);
    await page.screenshot({
      path: path.join(out, 'design-016-apartment-walk.png'),
    });
    await page.keyboard.press('Escape');
    await h.noOverflow(page);
    assert.deepEqual(errors, []);
  } catch (error) {
    await page.screenshot({
      path: path.join(out, 'design-016-failure.png'),
      fullPage: true,
    });
    throw error;
  } finally {
    await context.close();
  }
  const mobile = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    deviceScaleFactor: 1,
  });
  await h.installTools(mobile);
  await mobile.addInitScript(
    (json) => localStorage.setItem('flatplan.editor.v1', json),
    JSON.stringify(designFixture()),
  );
  const phone = await mobile.newPage();
  await phone.goto(url);
  await h.loaded(phone);
  try {
    await h.panel(phone, 'Объекты');
    await phone
      .getByText('Расстановка, привязки и группы', { exact: true })
      .click();
    await phone
      .getByRole('checkbox', { name: 'Выбрать вместе: Тумба A', exact: true })
      .check();
    await phone
      .getByRole('checkbox', { name: 'Выбрать вместе: Тумба B', exact: true })
      .check();
    assert.ok(
      await phone.getByText('Выбрано предметов: 2', { exact: true }).count(),
    );
    await phone
      .getByRole('button', { name: 'Объединить в группу', exact: true })
      .tap();
    assert.ok((await h.project(phone)).scene.objects.some((n) => n.assembly));
    await h.panel(phone, 'Варианты');
    await phone
      .getByRole('button', { name: 'Начать прогулку', exact: true })
      .tap();
    const before = (await h.project(phone)).scene.view.camera;
    const button = phone.getByRole('button', {
      name: 'Шаг назад',
      exact: true,
    });
    await button.scrollIntoViewIfNeeded();
    const rect = await button.boundingBox();
    const session = await mobile.newCDPSession(phone);
    await session.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [{ x: rect.x + 22, y: rect.y + 22 }],
    });
    await phone.waitForFunction(
      (before) => {
        const p = JSON.parse(
          window.__flatplanTools.export_editor_project.execute({}).json,
        ).scene.view.camera;
        return (
          Math.hypot(
            p.position[0] - before.position[0],
            p.position[2] - before.position[2],
          ) > 0.1
        );
      },
      before,
      { timeout: 5000 },
    );
    await session.send('Input.dispatchTouchEvent', {
      type: 'touchEnd',
      touchPoints: [],
    });
    const after = (await h.project(phone)).scene.view.camera;
    assert.notDeepEqual(before.position, after.position);
    near(after.position[1], 1.6);
    await h.noOverflow(phone);
    await phone.screenshot({
      path: path.join(out, 'design-016-mobile-walk.png'),
      fullPage: true,
    });
    await phone
      .getByRole('button', { name: 'Завершить прогулку', exact: true })
      .last()
      .tap();
    await h.panel(phone, 'Варианты');
    await phone
      .getByRole('checkbox', { name: 'Солнце по дате и времени', exact: true })
      .check();
    await h.noOverflow(phone);
    await phone.screenshot({
      path: path.join(out, 'design-016-mobile-sun.png'),
      fullPage: true,
    });
  } finally {
    await mobile.close();
  }
  console.log(
    'DESIGN-016: snapping, groups, walk, daylight, finishes, history/JSON/reload and mobile passed',
  );
}
