import assert from 'node:assert/strict';
import path from 'node:path';
import { createPlanProject } from '../lib/plan-project.ts';
import { baseNode, makeOpening } from '../lib/editor-seed.ts';
import { defaultView, validateProject } from '../lib/editor-model.ts';
import { objectDimensions, sceneBounds } from '../lib/editor-geometry.ts';

function fixture() {
  const p = createPlanProject();
  const floor = baseNode(
    'tools-floor',
    'Пол — Тестовая комната',
    {
      kind: 'floor',
      holes: [],
      size: [6, 0.1, 6],
      polygon: [
        [0, 0],
        [6, 0],
        [6, 6],
        [0, 6],
      ],
    },
    'structure',
  );
  floor.position[1] = -0.1;
  const a = baseNode('tools-a', 'Тумба A', { kind: 'box', size: [1, 1, 1] });
  a.position = [2, 0.5, 2];
  const b = baseNode('tools-b', 'Тумба B', { kind: 'box', size: [1, 1, 1] });
  b.position = [3.5, 0.5, 2];
  const wall = baseNode(
    'tools-wall',
    'Стена с дверью',
    { kind: 'wall', size: [6, 2.7, 0.2] },
    'structure',
  );
  wall.position = [3, 0, 0];
  const door = makeOpening(1, 2.1, 0.2, 'door');
  door.geometry.doorSwing = { hinge: 'start', side: 1, offset: 0 };
  wall.children = [door];
  p.scene = {
    objects: [floor, wall, a, b],
    view: { ...defaultView(), mode: '2d', labels: false },
  };
  p.activeArrangement = 'tools-fixture';
  p.arrangements = [
    {
      id: p.activeArrangement,
      name: 'Проверка инструментов',
      scene: structuredClone(p.scene),
    },
  ];
  return validateProject(p);
}
const near = (a, b, t = 0.004) =>
  assert.ok(Math.abs(a - b) < t, `${a} != ${b}`);
async function point(page, x, z) {
  return page.locator('.ed-plan > svg').evaluate(
    (svg, [x, z]) => {
      const p = new DOMPoint(x, z).matrixTransform(svg.getScreenCTM());
      return { x: p.x, y: p.y };
    },
    [x, z],
  );
}
async function clickWorld(page, x, z, touch = false) {
  const p = await point(page, x, z);
  if (touch) await page.touchscreen.tap(p.x, p.y);
  else await page.mouse.click(p.x, p.y);
}
export async function checkPlanTools(browser, url, out, h) {
  const context = await browser.newContext({
    viewport: { width: 1365, height: 960 },
  });
  await h.installTools(context);
  const seed = fixture(),
    errors = [];
  await context.addInitScript((json) => {
    if (!localStorage.getItem('flatplan.editor.v1'))
      localStorage.setItem('flatplan.editor.v1', json);
  }, JSON.stringify(seed));
  const page = await context.newPage();
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(url);
  await h.loaded(page);
  await h.panel(page, 'Проверка');
  await h.call(page, 'configure_editor_view', {
    selected: 'tools-a',
    planZoom: 1.15,
    planOffset: [0.2, 0.15],
  });
  assert.ok(await page.getByText('До мебели: 50 см', { exact: true }).count());
  await page.getByRole('switch', { name: 'Показывать узкие зазоры' }).click();
  assert.equal(await page.locator('.ed-check-item.gap').count(), 1);
  await h.editField(page, 'Порог зазора, см', 40);
  assert.equal(await page.locator('.ed-check-item.gap').count(), 0);
  await h.editField(page, 'Порог зазора, см', 80);
  await h.call(page, 'edit_editor_object', {
    action: 'update',
    id: 'tools-b',
    position: [2.7, 0.5, 2],
  });
  assert.equal(await page.locator('.ed-check-item.collision').count(), 1);
  await h.call(page, 'editor_history', { action: 'undo' });
  assert.equal(await page.locator('.ed-check-item.collision').count(), 0);
  await h.call(page, 'configure_editor_view', { selected: 'tools-a' });
  await h.editField(page, 'Свободно сзади, см', 180);
  assert.equal(
    (await h.project(page)).scene.objects.find((n) => n.id === 'tools-a')
      .clearance.back,
    1.8,
  );
  assert.ok(await page.locator('.ed-check-item.clearance').count());
  assert.ok(
    await page.locator('.ed-plan [data-analysis-area="clearance"]').count(),
  );
  await page
    .getByRole('button', { name: 'Измерить между точками', exact: true })
    .click();
  // The SVG CTM must account for pan, zoom and desktop letterboxing.
  await clickWorld(page, 1, 4);
  assert.equal(await page.locator('[data-measure-start]').count(), 1);
  await clickWorld(page, 4, 4);
  let current = await h.project(page);
  assert.equal(current.scene.measurements.length, 1);
  near(current.scene.measurements[0].from[0], 1);
  near(current.scene.measurements[0].to[0], 4);
  near(
    Math.hypot(
      ...current.scene.measurements[0].to.map(
        (v, i) => v - current.scene.measurements[0].from[i],
      ),
    ),
    3,
  );
  await page
    .getByRole('button', { name: 'Отменить изменение', exact: true })
    .click();
  assert.equal((await h.project(page)).scene.measurements?.length ?? 0, 0);
  await page
    .getByRole('button', { name: 'Повторить изменение', exact: true })
    .click();
  assert.equal((await h.project(page)).scene.measurements.length, 1);
  // A drag pans without creating a dimension; Escape discards only the draft.
  const p = await point(page, 2, 4.5);
  await page.mouse.move(p.x, p.y);
  await page.mouse.down();
  await page.mouse.move(p.x + 30, p.y + 20, { steps: 5 });
  await page.mouse.up();
  assert.equal(await page.locator('[data-measure-start]').count(), 0);
  await clickWorld(page, 2, 4.5);
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('[data-measure-start]').count(), 0);
  assert.equal((await h.project(page)).scene.measurements.length, 1);
  await page
    .getByRole('button', { name: 'Удалить размер 1', exact: true })
    .click();
  assert.equal((await h.project(page)).scene.measurements.length, 0);
  await h.call(page, 'editor_history', { action: 'undo' });
  await h.call(page, 'manage_editor_arrangement', {
    action: 'save',
    name: 'Размеры и зоны',
  });
  const snapshot = await h.project(page),
    savedId = snapshot.activeArrangement;
  await h.call(page, 'manage_editor_arrangement', {
    action: 'open',
    id: 'tools-fixture',
  });
  assert.equal((await h.project(page)).scene.measurements, undefined);
  await h.call(page, 'manage_editor_arrangement', {
    action: 'open',
    id: savedId,
  });
  assert.deepEqual(
    (await h.project(page)).scene.measurements,
    snapshot.scene.measurements,
  );
  await h.saved(page);
  await page.reload();
  await h.loaded(page);
  assert.deepEqual(
    (await h.project(page)).scene.measurements,
    snapshot.scene.measurements,
  );
  assert.deepEqual(
    (await h.project(page)).scene.objects,
    snapshot.scene.objects,
  );
  await h.call(page, 'import_editor_project', {
    json: JSON.stringify(snapshot),
  });
  assert.deepEqual(
    (await h.project(page)).scene.measurements,
    snapshot.scene.measurements,
  );
  // Catalog controls: presets, validation, centimetres, room placement and replacement.
  await h.panel(page, 'Объекты');
  await page.getByRole('button', { name: 'Добавить', exact: true }).click();
  const catalog = page.getByRole('region', { name: 'Каталог мебели' });
  await catalog.getByRole('button', { name: '180 × 70', exact: true }).click();
  await catalog.getByRole('textbox', { name: 'Каталог: Ширина, см' }).fill('');
  assert.equal(
    await catalog
      .getByRole('button', { name: 'Добавить предмет', exact: true })
      .isDisabled(),
    true,
  );
  await catalog
    .getByRole('textbox', { name: 'Каталог: Ширина, см' })
    .fill('165,5');
  await catalog
    .getByRole('button', { name: 'Добавить предмет', exact: true })
    .click();
  current = await h.project(page);
  const desk = current.scene.objects.find(
    (n) => n.id === current.scene.view.selected,
  );
  near(objectDimensions(current.scene.objects, desk)[0], 1.655, 1e-6);
  let bounds = sceneBounds([desk]);
  near((bounds.min.x + bounds.max.x) / 2, 3, 1e-6);
  near((bounds.min.z + bounds.max.z) / 2, 3, 1e-6);
  near(bounds.min.y, 0, 1e-6);
  await h.call(page, 'edit_editor_object', {
    action: 'update',
    id: desk.id,
    rotation: [0, 30, 0],
  });
  const before = (await h.project(page)).scene.objects.find(
    (n) => n.id === desk.id,
  );
  const beforeBounds = sceneBounds([before]);
  await h.panel(page, 'Объекты');
  await page.getByRole('button', { name: 'Добавить', exact: true }).click();
  await catalog
    .getByRole('textbox', { name: 'Поиск в каталоге' })
    .fill('кровать');
  await catalog.getByRole('button', { name: 'Кровать', exact: true }).click();
  await catalog.getByRole('button', { name: '140 × 200', exact: true }).click();
  await catalog
    .getByRole('button', { name: 'Заменить выбранный предмет', exact: true })
    .click();
  current = await h.project(page);
  const replacement = current.scene.objects.find((n) => n.id === desk.id);
  assert.ok(replacement.name.includes('Кровать'));
  near(objectDimensions(current.scene.objects, replacement)[0], 1.4, 1e-6);
  assert.deepEqual(replacement.rotation, before.rotation);
  bounds = sceneBounds([replacement]);
  near(
    bounds.min.x + bounds.max.x,
    beforeBounds.min.x + beforeBounds.max.x,
    1e-6,
  );
  near(
    bounds.min.z + bounds.max.z,
    beforeBounds.min.z + beforeBounds.max.z,
    1e-6,
  );
  await h.call(page, 'editor_history', { action: 'undo' });
  assert.deepEqual(
    (await h.project(page)).scene.objects.find((n) => n.id === desk.id),
    before,
  );
  // New workstation items are available through the existing editor API too.
  for (const catalog of ['office-chair', 'monitor', 'computer']) {
    await h.call(page, 'edit_editor_object', { action: 'add', catalog });
  }
  await h.call(page, 'configure_editor_view', { mode: '3d' });
  assert.equal((await h.status(page)).status.unavailable, false);
  await h.panel(page, 'Проверка');
  await page.screenshot({ path: path.join(out, 'tools-015-desktop.png') });
  await h.noOverflow(page);
  // Exercise analysis on the full supplied apartment, without altering its geometry.
  const original = createPlanProject();
  await h.call(page, 'import_editor_project', {
    json: JSON.stringify(original),
  });
  await h.panel(page, 'Проверка');
  await page.getByRole('switch', { name: 'Показывать узкие зазоры' }).click();
  assert.ok(await page.locator('.ed-check-item').count());
  const full = await h.project(page);
  assert.deepEqual(full.scene.objects, original.scene.objects);
  await page.screenshot({ path: path.join(out, 'tools-015-apartment.png') });
  assert.deepEqual(errors, []);
  await context.close();

  // A real touch context verifies the same world-coordinate ruler on a narrow plan.
  const mobile = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    deviceScaleFactor: 1,
  });
  await h.installTools(mobile);
  await mobile.addInitScript(
    (json) => localStorage.setItem('flatplan.editor.v1', json),
    JSON.stringify(seed),
  );
  const phone = await mobile.newPage();
  phone.on('pageerror', (e) => errors.push(e.message));
  await phone.goto(url);
  await h.loaded(phone);
  await h.panel(phone, 'Проверка');
  await phone
    .getByRole('button', { name: 'Измерить между точками', exact: true })
    .click();
  await clickWorld(phone, 1, 4, true);
  await clickWorld(phone, 4, 4, true);
  current = await h.project(phone);
  assert.equal(current.scene.measurements.length, 1);
  near(current.scene.measurements[0].from[0], 1, 0.03);
  near(current.scene.measurements[0].to[0], 4, 0.03);
  const cdp = await mobile.newCDPSession(phone),
    centre = await point(phone, 3, 3);
  const touches = [
    { x: centre.x - 30, y: centre.y, id: 1 },
    { x: centre.x + 30, y: centre.y, id: 2 },
  ];
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: touches,
  });
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchMove',
    touchPoints: touches.map((p, i) => ({ ...p, x: p.x + (i ? 15 : -15) })),
  });
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchEnd',
    touchPoints: [],
  });
  assert.equal((await h.project(phone)).scene.measurements.length, 1);
  assert.equal(await phone.locator('[data-measure-start]').count(), 0);
  await phone
    .getByRole('button', { name: 'Завершить измерение', exact: true })
    .click();
  for (const width of [360, 390, 768]) {
    await phone.setViewportSize({ width, height: 844 });
    await h.noOverflow(phone);
    const tabSizes = await phone
      .locator('.ed-tabs button')
      .evaluateAll((buttons) =>
        buttons.map((b) => ({ width: b.clientWidth, scroll: b.scrollWidth })),
      );
    assert.ok(
      tabSizes.every((b) => b.scroll <= b.width),
      JSON.stringify(tabSizes),
    );
    await phone.screenshot({
      path: path.join(out, `tools-015-mobile-${width}.png`),
    });
  }
  await h.panel(phone, 'Объекты');
  await phone.getByRole('button', { name: 'Добавить', exact: true }).click();
  await phone
    .getByRole('textbox', { name: 'Каталог: Ширина, см' })
    .scrollIntoViewIfNeeded();
  await phone.setViewportSize({ width: 360, height: 844 });
  await h.noOverflow(phone);
  await phone.screenshot({
    path: path.join(out, 'tools-015-catalog-mobile.png'),
  });
  await mobile.close();
  assert.deepEqual(errors, []);
  console.log(
    'TOOLS-015: dimensions, gaps, collision, clearance, catalog, replacement, history, variants, JSON, reload and touch passed.',
  );
}
