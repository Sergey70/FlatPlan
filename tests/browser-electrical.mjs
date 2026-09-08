import { baseNode } from '../lib/editor-seed.ts';
import assert from 'node:assert/strict';
import path from 'node:path';
import { createPlanProject } from '../lib/plan-project.ts';
import { findNode } from '../lib/editor-model.ts';
import { electricalNodes, electricalPosition } from '../lib/electrical.ts';
const near = (a, b, e = 0.025) =>
  assert.ok(Math.abs(a - b) < e, `${a} != ${b}`);
async function point(page, x, z, touch = false) {
  const p = await page.locator('.ed-plan > svg').evaluate(
    (svg, [x, z]) => {
      const p = new DOMPoint(x, z).matrixTransform(svg.getScreenCTM());
      return { x: p.x, y: p.y };
    },
    [x, z],
  );
  if (touch) await page.touchscreen.tap(p.x, p.y);
  else await page.mouse.click(p.x, p.y);
}
export async function checkElectrical(browser, url, out, h) {
  const ctx = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
  });
  await h.installTools(ctx);
  const page = await ctx.newPage(),
    errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  try {
    await page.goto(url);
    await h.loaded(page);
    await h.call(page, 'import_editor_project', {
      json: JSON.stringify(createPlanProject()),
    });
    await h.panel(page, 'Ремонт');
    await page.getByRole('button', { name: 'Электрика', exact: true }).click();
    const group = page.getByRole('textbox', {
      name: 'Группа новой точки',
      exact: true,
    });
    await group.fill('Рабочее место');
    await page
      .getByRole('button', { name: 'Указать точку на плане', exact: true })
      .click();
    await page.keyboard.press('Escape');
    assert.equal(
      electricalNodes((await h.project(page)).scene.objects).length,
      0,
    );
    for (const [kind, x, z] of [
      ['socket', 2, 8.9],
      ['data', 2.2, 8.9],
      ['appliance', 2.4, 8.9],
      ['switch', 2.6, 8.9],
      ['light', 2.7, 8.1],
    ]) {
      await page
        .getByLabel('Добавляемая точка', { exact: true })
        .selectOption(kind);
      if (kind === 'light') await group.fill('Кухня');
      await page
        .getByRole('button', { name: 'Указать точку на плане', exact: true })
        .click();
      await point(page, x, z);
      const p = await h.project(page),
        n = findNode(p.scene.objects, p.scene.view.selected);
      assert.equal(n.electrical.kind, kind);
      near(n.position[0], x);
      near(n.position[2], z);
      assert.ok(
        await page.locator(`[data-electrical-point="${n.id}"]`).count(),
      );
    }
    let p = await h.project(page),
      lightId = p.scene.view.selected;
    await h.editField(page, 'Высота точки от пола, см', 254);
    p = await h.project(page);
    near(electricalPosition(p.scene.objects, lightId)[1], 2.54, 1e-8);
    await h.editField(page, 'Световой поток, лм', 950);
    await h.editField(page, 'Температура света, K', 4000);
    await h.editField(page, 'Ширина светового конуса, °', 110);
    await page
      .getByRole('button', { name: 'Посмотреть свет вечером', exact: true })
      .click();
    await h.call(page, 'configure_editor_view', {
      camera: { position: [0.65, 1.55, 9], target: [2.5, 1.1, 6.55] },
      selected: null,
      grid: false,
    });
    await page
      .getByLabel('Электрическая точка', { exact: true })
      .selectOption(lightId);
    await page
      .getByRole('button', { name: 'Выключить группу Кухня', exact: true })
      .click();
    const off = await page
      .locator('.ed-canvas canvas')
      .screenshot({ path: path.join(out, 'renovation-017-lights-off.png') });
    await page
      .getByRole('button', { name: 'Включить группу Кухня', exact: true })
      .click();
    const on = await page
      .locator('.ed-canvas canvas')
      .screenshot({ path: path.join(out, 'renovation-017-lights-on.png') });
    assert.notDeepEqual(on, off, 'Actual canvas lighting must change');
    await page
      .getByRole('button', {
        name: 'Добавить сценарии: работа, готовка, вечер, ночь',
        exact: true,
      })
      .click();
    await page
      .getByRole('textbox', {
        name: 'Название светового сценария',
        exact: true,
      })
      .fill('Кухня вечером');
    await page
      .getByRole('button', {
        name: 'Сохранить яркости как сценарий',
        exact: true,
      })
      .click();
    assert.equal((await h.project(page)).scene.lightingScenes.length, 5);
    await page.getByRole('button', { name: 'Ночь', exact: true }).click();
    assert.equal(
      findNode((await h.project(page)).scene.objects, lightId).electrical
        .fixture.level,
      0,
    );
    await page
      .getByRole('button', { name: 'Кухня вечером', exact: true })
      .click();
    assert.equal(
      findNode((await h.project(page)).scene.objects, lightId).electrical
        .fixture.level,
      1,
    );
    const sw = electricalNodes((await h.project(page)).scene.objects).find(
      (n) => n.electrical.kind === 'switch',
    );
    await page
      .getByLabel('Электрическая точка', { exact: true })
      .selectOption(sw.id);
    await page
      .getByRole('checkbox', { name: 'Управляет: Кухня', exact: true })
      .check();
    await page
      .getByRole('button', { name: 'Выключить выключателем', exact: true })
      .click();
    assert.equal(
      findNode((await h.project(page)).scene.objects, lightId).electrical
        .fixture.level,
      0,
    );
    await page
      .getByRole('button', { name: 'Включить выключателем', exact: true })
      .click();
    await h.call(page, 'configure_editor_view', { mode: '2d' });
    await page
      .getByRole('checkbox', {
        name: 'Показывать обозначения электрики',
        exact: true,
      })
      .uncheck();
    assert.equal(await page.locator('[data-electrical-point]').count(), 0);
    await page
      .getByRole('checkbox', {
        name: 'Показывать обозначения электрики',
        exact: true,
      })
      .check();
    assert.equal(await page.locator('[data-electrical-point]').count(), 5);
    await h.saved(page);
    p = await h.project(page);
    await page.reload();
    await h.loaded(page);
    await h.saved(page);
    assert.deepEqual(await h.project(page), p);
    const lockedPoint = electricalNodes(p.scene.objects).find(
      (n) => n.electrical.kind === 'socket',
    );
    const lockedParent = baseNode(
      'electrical-locked-parent',
      'Закреплённая группа',
      { kind: 'group', size: [1, 1, 1] },
    );
    lockedParent.locked = true;
    lockedParent.children = [lockedPoint];
    p.scene.objects = [
      ...p.scene.objects.filter((n) => n.id !== lockedPoint.id),
      lockedParent,
    ];
    p.scene.view.selected = lockedPoint.id;
    await h.call(page, 'import_editor_project', { json: JSON.stringify(p) });
    await h.panel(page, 'Ремонт');
    await page.getByRole('button', { name: 'Электрика', exact: true }).click();
    const lockedBefore = await h.project(page);
    const name = page.getByRole('textbox', {
      name: 'Название точки',
      exact: true,
    });
    await name.fill('Попытка переименования');
    await name.press('Tab');
    await h.editField(page, 'Поворот точки, °', 45);
    assert.deepEqual(
      (await h.project(page)).scene.objects,
      lockedBefore.scene.objects,
    );
    assert.ok(
      await page
        .getByRole('alert')
        .filter({ hasText: 'Сначала разблокируйте объект и его родителей.' })
        .isVisible(),
    );
    assert.deepEqual(errors, []);
    console.log(
      'PASS R17-3 desktop: place five electrical kinds, cancellation, real height, rendered lights, groups/switches/five scenarios, layer and reload',
    );
  } catch (error) {
    await page.screenshot({
      path: path.join(out, 'renovation-017-electrical-failure.png'),
    });
    console.log(
      (await page.locator('.ed-panel').innerText()).slice(0, 4500),
      errors,
    );
    throw error;
  } finally {
    await ctx.close();
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
    await phone.getByRole('button', { name: 'Электрика', exact: true }).tap();
    await phone
      .getByRole('button', { name: 'Указать точку на плане', exact: true })
      .tap();
    await point(phone, 2, 8.8, true);
    let p = await h.project(phone);
    assert.equal(electricalNodes(p.scene.objects).length, 1);
    const id = p.scene.view.selected;
    await h.editField(phone, 'Высота точки от пола, см', 110);
    near(
      findNode((await h.project(phone)).scene.objects, id).position[1],
      1.1,
      1e-8,
    );
    for (const width of [360, 390, 768]) {
      await phone.setViewportSize({ width, height: 844 });
      await h.noOverflow(phone);
      await phone.screenshot({
        path: path.join(out, `renovation-017-electrical-${width}.png`),
      });
    }
    await h.saved(phone);
    p = await h.project(phone);
    await phone.reload();
    await h.loaded(phone);
    await h.saved(phone);
    assert.deepEqual(await h.project(phone), p);
    console.log(
      'PASS R17-3 mobile: touch placement, exact height, 360/390/768 controls and reload',
    );
  } finally {
    await mobile.close();
  }
}
