import assert from 'node:assert/strict';
import path from 'node:path';
import { createDefaultProject } from '../lib/editor-project.ts';
import { defaultFinish } from '../lib/design-types.ts';

// Native pickers send many input events while dragging and change on confirmation.
async function inputColors(input, colors) {
  await input.focus();
  await input.evaluate(async (element, values) => {
    const set = Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      'value',
    ).set;
    for (const value of values) {
      set.call(element, value);
      element.dispatchEvent(new Event('input', { bubbles: true }));
      await new Promise(requestAnimationFrame);
    }
  }, colors);
}
async function confirm(input) {
  await input.dispatchEvent('change');
  await input.blur();
}
export async function checkColors(browser, url, out, h) {
  for (const mobile of [false, true]) {
    const context = await browser.newContext({
      viewport: mobile
        ? { width: 390, height: 844 }
        : { width: 1365, height: 900 },
      isMobile: mobile,
      hasTouch: mobile,
    });
    const source = createDefaultProject();
    const floor = source.scene.objects.find(
      (n) => n.geometry.kind === 'floor' && /Кухня/.test(n.name),
    );
    floor.finish = defaultFinish('tile');
    source.scene.view.selected = floor.id;
    source.scene.view.mode = '3d';
    await h.installTools(context);
    await context.addInitScript((json) => {
      if (!localStorage.getItem('flatplan.editor.v1'))
        localStorage.setItem('flatplan.editor.v1', json);
      window.__colorTextureReads = 0;
      const original = CanvasRenderingContext2D.prototype.getImageData;
      CanvasRenderingContext2D.prototype.getImageData = function (...args) {
        window.__colorTextureReads++;
        return original.apply(this, args);
      };
    }, JSON.stringify(source));
    const page = await context.newPage(),
      errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    try {
      await page.goto(url);
      await h.loaded(page);
      await h.panel(page, 'Свойства');
      await h.saved(page);
      await page.waitForTimeout(800);
      const read = () => h.project(page);
      const currentFloor = (p) =>
        p.scene.objects.find((n) => n.id === floor.id);
      for (const [label, key, final] of [
        ['Цвет отделки', 'color', '#c94835'],
        ['Цвет шва', 'jointColor', '#267db4'],
      ]) {
        const input = page.getByLabel(label, { exact: true });
        const before = await read();
        const textureReads = await page.evaluate(
          () => window.__colorTextureReads,
        );
        await inputColors(input, [
          '#114466',
          '#224477',
          '#336688',
          '#447799',
          '#6699bb',
          final,
        ]);
        assert.equal(
          await input.inputValue(),
          final,
          `${label}: swatch follows input`,
        );
        assert.deepEqual(
          (await read()).scene,
          before.scene,
          `${label}: dragging must not save/rebuild the project`,
        );
        assert.equal(
          await page.evaluate(() => window.__colorTextureReads),
          textureReads,
          `${label}: dragging must not regenerate textures`,
        );
        await confirm(input);
        const applied = await read();
        assert.equal(currentFloor(applied).finish[key], final);
        assert.ok(
          (await page.evaluate(() => window.__colorTextureReads)) >
            textureReads,
          'Confirmed color reaches textured 3D renderer',
        );
        await h.call(page, 'editor_history', { action: 'undo' });
        assert.deepEqual(
          (await read()).scene,
          before.scene,
          'One undo restores the entire color gesture',
        );
        await h.call(page, 'editor_history', { action: 'redo' });
        assert.deepEqual((await read()).scene, applied.scene);
        await inputColors(input, ['#112233', final]);
        await confirm(input);
        await h.call(page, 'editor_history', { action: 'undo' });
        assert.deepEqual(
          (await read()).scene,
          before.scene,
          'Cancelled/unchanged selection adds no undo step',
        );
        await h.call(page, 'editor_history', { action: 'redo' });
      }
      const finish = page.getByLabel('Цвет отделки', { exact: true });
      await inputColors(finish, ['#246841']);
      await finish.blur();
      assert.equal(
        currentFloor(await read()).finish.color,
        '#246841',
        'Blur commits the last color without native change',
      );
      const beforeCancel = await read();
      await inputColors(finish, ['#fcdf10']);
      await finish.press('Escape');
      assert.deepEqual(
        (await read()).scene,
        beforeCancel.scene,
        'Escape discards the pending color',
      );
      await inputColors(finish, ['#943476']);
      await finish.press('Enter');
      assert.equal(
        currentFloor(await read()).finish.color,
        '#943476',
        'Enter confirms keyboard choice',
      );
      await h.saved(page);
      const saved = await read();
      await page.screenshot({
        path: path.join(out, `color-020-${mobile ? 'mobile' : 'desktop'}.png`),
      });
      await h.noOverflow(page);
      await page.reload();
      await h.loaded(page);
      assert.deepEqual(
        (await read()).scene,
        saved.scene,
        'Confirmed colors survive reload',
      );
      assert.deepEqual(errors, []);
      console.log(
        `PASS colors ${mobile ? 'touch' : 'desktop'}: draft, texture rebuild boundary, one undo, redo, cancellation, keyboard, autosave`,
      );
      assert.equal(
        JSON.parse(
          await page.evaluate(() => localStorage.getItem('flatplan.editor.v1')),
        ).scene.objects.find((n) => n.id === floor.id).finish.color,
        currentFloor(saved).finish.color,
      );
    } finally {
      await context.close();
    }
  }
}
