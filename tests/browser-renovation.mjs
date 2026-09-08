import assert from 'node:assert/strict';
import path from 'node:path';
import { createPlanProject } from '../lib/plan-project.ts';
import { findNode, flattenNodes } from '../lib/editor-model.ts';
import { nodeWorldMatrix, sceneBounds } from '../lib/editor-geometry.ts';
import { Vector3 } from 'three';
const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-7, `${a} != ${b}`);
const moving = (p, id) =>
  flattenNodes([findNode(p.scene.objects, id)])
    .map((x) => x.node)
    .filter((n) => n.mechanism);
export async function checkRenovation(browser, url, out, h) {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
  });
  await h.installTools(context);
  const page = await context.newPage(),
    errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(url);
  await h.loaded(page);
  try {
    const source = createPlanProject();
    const door = flattenNodes(source.scene.objects).find(
      (x) => x.node.geometry.doorSwing?.hinge === 'start',
    ).node.id;
    for (const [preset, id] of [
      ['door', door],
      ['cabinet', 'plan-item-060'],
      ['drawer', 'plan-item-063'],
      ['fridge', 'plan-item-028'],
      ['dishwasher', 'plan-item-045'],
      ['oven', 'plan-item-054'],
      ['sofa', 'plan-item-024'],
    ]) {
      await h.call(page, 'import_editor_project', {
        json: JSON.stringify(source),
      });
      await h.panel(page, 'Ремонт');
      await page
        .getByLabel('Предмет с механизмом', { exact: true })
        .selectOption(id);
      await page
        .getByLabel('Схема открывания', { exact: true })
        .selectOption(preset);
      await page
        .getByRole('button', { name: 'Настроить механизм', exact: true })
        .click();
      let p = await h.project(page);
      assert.ok(moving(p, id).length, preset);
      const original = moving(p, id).map((n) => ({
        id: n.id,
        matrix: nodeWorldMatrix(p.scene.objects, n.id).elements,
        progress: n.mechanism.progress,
      }));
      await page
        .getByRole('button', { name: 'Открыть всё', exact: true })
        .click();
      p = await h.project(page);
      assert.ok(moving(p, id).every((n) => n.mechanism.progress === 1));
      assert.ok(
        await page
          .getByLabel('Пересечения механизмов', { exact: true })
          .isVisible(),
      );
      await h.call(page, 'editor_history', { action: 'undo' });
      p = await h.project(page);
      for (const n of original)
        nodeWorldMatrix(p.scene.objects, n.id).elements.forEach((v, i) =>
          near(v, n.matrix[i]),
        );
      await h.call(page, 'editor_history', { action: 'redo' });
      await page
        .getByRole('button', { name: 'Закрыть всё', exact: true })
        .click();
      assert.ok(
        moving(await h.project(page), id).every(
          (n) => n.mechanism.progress === 0,
        ),
      );
      await page
        .getByRole('button', { name: 'Открыть всё', exact: true })
        .click();
      // Source furniture and room remain in place; use the editor camera to inspect the operating object.
      p = await h.project(page);
      const bounds = sceneBounds([findNode(p.scene.objects, id)]),
        c = bounds.getCenter(new Vector3());
      if (preset !== 'door') {
        const root = findNode(p.scene.objects, id),
          matrix = nodeWorldMatrix(p.scene.objects, id);
        const front =
          preset === 'sofa'
            ? -Math.sign(
                root.children.find((n) => n.name === 'Спинка').position[2] || 1,
              )
            : 1;
        const eye = new Vector3(1.8, 2, front * 2.6).applyMatrix4(matrix);
        await h.call(page, 'configure_editor_view', {
          mode: '3d',
          cutaway: true,
          grid: false,
          labels: false,
          selected: null,
          camera: { position: eye.toArray(), target: c.toArray() },
        });
      } else
        await h.call(page, 'configure_editor_view', {
          mode: '2d',
          selected: null,
          labels: false,
        });
      await page.screenshot({
        path: path.join(out, `renovation-017-${preset}.png`),
      });
      await h.saved(page);
      const stored = await h.project(page);
      await page.reload();
      await h.loaded(page);
      await h.saved(page);
      assert.deepEqual(await h.project(page), stored);
    }
    await h.panel(page, 'Ремонт');
    await page
      .getByLabel('Предмет с механизмом', { exact: true })
      .selectOption('plan-item-024');
    const section = page.getByRole('region', {
      name: 'Механизмы выбранного предмета',
    });
    const detail = section
      .locator('details')
      .filter({
        has: page.locator('summary', { hasText: 'Выкатная секция дивана' }),
      })
      .first();
    if (!(await detail.getAttribute('open')))
      await detail.locator('summary').first().click();
    await h.editField(page, 'Открывание: Выкатная секция дивана 2, %', 37);
    assert.equal(
      moving(await h.project(page), 'plan-item-024').find(
        (n) => n.name === 'Выкатная секция дивана',
      ).mechanism.progress,
      0.37,
    );
    await h.noOverflow(page);
    assert.deepEqual(errors, []);
    console.log(
      'PASS R17-2 desktop: every source mechanism, actual pose, undo/redo, numeric opening, independent source and reload',
    );
  } catch (error) {
    await page.screenshot({ path: path.join(out, 'renovation-017-failure.png') });
    console.log('Renovation panel at failure:', (await page.locator('.ed-panel').innerText()).slice(0, 5000));
    console.log('Page errors:', errors);
    throw error;
  } finally {
    await context.close();
  }
  const phoneContext = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  await h.installTools(phoneContext);
  const phone = await phoneContext.newPage();
  phone.on('pageerror', (e) => errors.push(e.message));
  try {
    await phone.goto(url);
    await h.loaded(phone);
    await h.panel(phone, 'Ремонт');
    await phone
      .getByLabel('Предмет с механизмом', { exact: true })
      .selectOption('plan-item-045');
    await phone
      .getByRole('button', { name: 'Настроить механизм', exact: true })
      .tap();
    await phone.getByRole('button', { name: 'Открыть всё', exact: true }).tap();
    assert.equal(
      moving(await h.project(phone), 'plan-item-045')[0].mechanism.progress,
      1,
    );
    await h.editField(phone, 'Открывание: Дверца посудомойки 1, %', 50);
    assert.equal(
      moving(await h.project(phone), 'plan-item-045')[0].mechanism.progress,
      0.5,
    );
    for (const width of [360, 390, 768]) {
      await phone.setViewportSize({ width, height: 844 });
      await h.noOverflow(phone);
      await phone.screenshot({
        path: path.join(out, `renovation-017-mechanism-${width}.png`),
      });
    }
    await h.saved(phone);
    const before = await h.project(phone);
    await phone.reload();
    await h.loaded(phone);
    await h.saved(phone);
    assert.deepEqual(await h.project(phone), before);
    assert.deepEqual(errors, []);
    console.log(
      'PASS R17-2 mobile: touch setup/operation, exact numeric input, 360/390/768 widths and reload',
    );
  } finally {
    await phoneContext.close();
  }
}
