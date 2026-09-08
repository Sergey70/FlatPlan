import assert from 'node:assert/strict';
import path from 'node:path';
import { galleryConcepts } from '../lib/gallery-data.ts';

/** Isolated gallery checks; deliberately seed a project value that must stay byte-for-byte intact. */
export async function checkGallery(browser, baseUrl, outputDirectory) {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    reducedMotion: 'reduce',
  });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const sentinel =
    '{"personal-project":"do not replace, normalize, or migrate"}';
  await context.addInitScript(
    ({ sentinel }) => {
      if (!localStorage.getItem('gallery-test-initialized')) {
        localStorage.setItem('flatplan.editor.v1', sentinel);
        localStorage.setItem('gallery-test-initialized', 'yes');
      }
    },
    { sentinel },
  );
  const url = new URL(baseUrl);
  url.search = '?view=gallery&layout=kitchen-by-bathroom';
  try {
    await page.goto(url.href);
    await page.locator('.gallery-card').last().waitFor();
    assert.equal(await page.locator('.gallery-card').count(), 12);
    assert.equal(await page.locator('.ed-app').count(), 0);
    const snapshot = await page.evaluate(() =>
      JSON.stringify({ ...localStorage }),
    );
    async function overflow() {
      const sizes = await page.evaluate(() => ({
        document: document.documentElement.scrollWidth,
        viewport: innerWidth,
      }));
      assert.ok(sizes.document <= sizes.viewport, JSON.stringify(sizes));
    }
    // Decode every illustration and diagram, even those below the fold.
    const sources = await page
      .locator('img')
      .evaluateAll((images) => [...new Set(images.map((image) => image.src))]);
    assert.equal(sources.length, 16);
    for (const src of sources) {
      const result = await page.evaluate(async (src) => {
        const image = new Image();
        image.src = src;
        await image.decode();
        return { width: image.naturalWidth, height: image.naturalHeight };
      }, src);
      assert.ok(result.width >= 800 && result.height >= 800, src);
    }
    await overflow();
    await page.screenshot({
      path: path.join(outputDirectory, 'gallery-desktop.png'),
      fullPage: true,
    });
    // Every card exposes its own full set of matching source/finish images.
    // Decode the selected large image, not just a hidden thumbnail.
    for (const concept of galleryConcepts) {
      await page
        .locator(`[data-concept="${concept.id}"]`)
        .getByRole('button', { name: /^Подробнее/ })
        .click();
      const dialog = page.getByRole('dialog');
      await dialog.waitFor();
      const viewer = dialog.locator('.gallery-viewer');
      assert.equal(
        await viewer.locator('.gallery-thumbnail').count(),
        concept.images.length,
      );
      for (const shot of concept.images) {
        const thumbnail = viewer.getByRole('button', {
          name: shot.label,
          exact: true,
        });
        await thumbnail.click();
        assert.equal(await thumbnail.getAttribute('aria-pressed'), 'true');
        assert.equal(
          await viewer
            .locator('.gallery-thumbnail[aria-pressed="true"]')
            .count(),
          1,
        );
        const large = viewer.locator('img.gallery-render');
        assert.equal(await large.getAttribute('src'), shot.src);
        assert.equal(
          await viewer
            .getByRole('link', { name: 'Открыть изображение целиком' })
            .getAttribute('href'),
          shot.src,
        );
        assert.match(
          await viewer.locator('output').innerText(),
          new RegExp(
            `${concept.images.indexOf(shot) + 1} / ${concept.images.length}`,
          ),
        );
        const size = await large.evaluate(async (img) => {
          await img.decode();
          return [img.naturalWidth, img.naturalHeight];
        });
        if (shot.kind === 'generated') {
          assert.ok(
            size[0] >= 1024 && size[1] >= 768,
            `${concept.id}/${shot.id}`,
          );
          assert.equal(
            await viewer.getAttribute('data-image-kind'),
            'generated',
          );
          await viewer
            .getByRole('button', { name: '3D-основа', exact: true })
            .click();
          assert.equal(await viewer.getAttribute('data-image-kind'), 'model');
          assert.equal(await large.getAttribute('src'), shot.modelSrc);
          assert.equal(
            await viewer
              .getByRole('link', { name: 'Открыть изображение целиком' })
              .getAttribute('href'),
            shot.modelSrc,
          );
          assert.deepEqual(
            await large.evaluate(async (img) => {
              await img.decode();
              return [img.naturalWidth, img.naturalHeight];
            }),
            [1800, 1200],
          );
          await viewer
            .getByRole('button', { name: 'Готовый интерьер', exact: true })
            .click();
          assert.equal(await large.getAttribute('src'), shot.src);
          assert.equal(
            await viewer.getAttribute('data-image-kind'),
            'generated',
          );
          // Switching the angle resets the source toggle to the finished image.
          await viewer
            .getByRole('button', { name: '3D-основа', exact: true })
            .click();
        } else {
          assert.deepEqual(size, [1800, 1200]);
          assert.equal(
            await viewer.locator('.gallery-source-options').count(),
            0,
          );
        }
      }
      await viewer
        .getByRole('button', { name: 'Следующий ракурс', exact: true })
        .click();
      assert.equal(
        await viewer.locator('img.gallery-render').getAttribute('src'),
        concept.images[0].src,
      );
      await viewer.locator('.gallery-thumbnail').first().focus();
      await page.keyboard.press('ArrowLeft');
      assert.equal(
        await viewer.locator('img.gallery-render').getAttribute('src'),
        concept.images.at(-1).src,
      );
      await page.keyboard.press('Home');
      await page.keyboard.press('ArrowRight');
      assert.equal(
        await viewer.locator('img.gallery-render').getAttribute('src'),
        concept.images[1].src,
      );
      await page.keyboard.press('End');
      assert.equal(
        await viewer.locator('img.gallery-render').getAttribute('src'),
        concept.images.at(-1).src,
      );
      await page.keyboard.press('Escape');
      await dialog.waitFor({ state: 'hidden' });
    }
    await page.getByRole('button', { name: 'Квартира', exact: true }).click();
    assert.equal(await page.locator('.gallery-card').count(), 3);
    await page
      .getByRole('button', { name: 'Тёплая отделка', exact: true })
      .click();
    assert.equal(await page.locator('.gallery-card').count(), 1);
    assert.equal(
      await page.locator('.gallery-card').getAttribute('data-concept'),
      'plan-2-warm',
    );
    const detail = page.getByRole('button', { name: /^Подробнее/ });
    await detail.click();
    await page.getByRole('dialog').waitFor();
    assert.ok(
      await page
        .getByRole('heading', { name: 'Тёплая отделка', exact: true })
        .isVisible(),
    );
    assert.equal(
      await page.getByRole('dialog').locator('.gallery-materials li').count(),
      4,
    );
    assert.match(
      await page
        .getByRole('dialog')
        .locator('.gallery-plan img')
        .getAttribute('src'),
      /plan-2\.svg$/,
    );
    await page.screenshot({
      path: path.join(outputDirectory, 'gallery-detail-desktop.png'),
    });
    await page.keyboard.press('Escape');
    await page.getByRole('dialog').waitFor({ state: 'hidden' });
    assert.ok(
      await detail.evaluate((element) => element === document.activeElement),
    );
    await page.getByRole('button', { name: /^Сравнить\s*:/ }).click();
    await page.getByRole('button', { name: 'Санузел 1', exact: true }).click();
    await page
      .getByRole('button', { name: 'Контрастная отделка', exact: true })
      .click();
    await page.getByRole('button', { name: /^Сравнить\s*:/ }).click();
    assert.equal(await page.locator('.gallery-selected-item').count(), 2);
    await page
      .getByRole('button', { name: 'Все планировки', exact: true })
      .click();
    await page.getByRole('button', { name: 'Все стили', exact: true }).click();
    assert.equal(
      await page.locator('.gallery-compare-toggle:disabled').count(),
      10,
    );
    await page
      .getByRole('button', { name: 'Сравнить два варианта', exact: true })
      .click();
    await page.getByRole('dialog').waitFor();
    assert.equal(
      await page
        .getByRole('dialog')
        .locator('.gallery-comparison-grid > article')
        .count(),
      2,
    );
    assert.deepEqual(
      await page.getByRole('dialog').locator('h3').allTextContents(),
      ['Тёплая отделка', 'Контрастная отделка'],
    );
    const viewers = page.getByRole('dialog').locator('.gallery-viewer');
    const secondBefore = await viewers
      .nth(1)
      .locator('img.gallery-render')
      .getAttribute('src');
    await viewers
      .nth(0)
      .getByRole('button', { name: 'Следующий ракурс', exact: true })
      .click();
    assert.match(
      await viewers.nth(0).locator('img.gallery-render').getAttribute('src'),
      /kitchen-reverse\.png$/,
    );
    assert.equal(
      await viewers.nth(1).locator('img.gallery-render').getAttribute('src'),
      secondBefore,
      'Comparison viewers navigate independently',
    );
    await viewers
      .nth(0)
      .getByRole('button', { name: '3D-основа', exact: true })
      .click();
    assert.equal(await viewers.nth(0).getAttribute('data-image-kind'), 'model');
    assert.equal(
      await viewers.nth(1).getAttribute('data-image-kind'),
      'generated',
    );
    assert.equal(
      await viewers.nth(1).locator('img.gallery-render').getAttribute('src'),
      secondBefore,
    );
    await viewers
      .nth(0)
      .getByRole('button', { name: 'Готовый интерьер', exact: true })
      .click();
    await page.screenshot({
      path: path.join(outputDirectory, 'gallery-compare-desktop.png'),
    });
    await page
      .getByRole('button', { name: 'Закрыть сравнение', exact: true })
      .click();
    await page.getByRole('dialog').waitFor({ state: 'hidden' });
    await page
      .getByRole('button', { name: 'Очистить сравнение', exact: true })
      .click();
    // A failed non-cover image can be left, selected again, and retried.
    const failedImage = /\/gallery-013\/images\/plan-2-natural-bedroom\.png$/;
    let failImage = true;
    await page.route(failedImage, (route) =>
      failImage ? route.abort() : route.continue(),
    );
    await page
      .locator('[data-concept="plan-2-natural"]')
      .getByRole('button', { name: /^Подробнее/ })
      .click();
    const recovery = page.getByRole('dialog');
    await recovery.waitFor();
    await recovery
      .getByRole('button', { name: 'Спальня · 13,55 м²', exact: true })
      .click();
    await recovery
      .getByText('Изображение не загрузилось', { exact: true })
      .waitFor();
    await recovery
      .getByRole('button', { name: '3D-основа', exact: true })
      .click();
    await recovery
      .locator('img.gallery-render')
      .evaluate((img) => img.decode());
    assert.match(
      await recovery.locator('img.gallery-render').getAttribute('src'),
      /gallery-012\/images\/plan-2-natural-bedroom\.png$/,
    );
    assert.equal(await recovery.locator('.gallery-image-error').count(), 0);
    await recovery
      .getByRole('button', { name: 'Готовый интерьер', exact: true })
      .click();
    await recovery
      .getByText('Изображение не загрузилось', { exact: true })
      .waitFor();
    await recovery
      .getByRole('button', { name: 'Общий вид планировки', exact: true })
      .click();
    await recovery
      .locator('img.gallery-render')
      .evaluate((img) => img.decode());
    assert.equal(await recovery.locator('.gallery-image-error').count(), 0);
    await recovery
      .getByRole('button', { name: 'Спальня · 13,55 м²', exact: true })
      .click();
    await recovery
      .getByText('Изображение не загрузилось', { exact: true })
      .waitFor();
    failImage = false;
    await recovery
      .getByRole('button', { name: 'Повторить', exact: true })
      .click();
    await recovery
      .locator('img.gallery-render')
      .evaluate((img) => img.decode());
    assert.match(
      await recovery.locator('img.gallery-render').getAttribute('src'),
      /bedroom\.png$/,
    );
    await recovery
      .getByRole('button', { name: 'Закрыть концепцию', exact: true })
      .click();
    await recovery.waitFor({ state: 'hidden' });
    await page.unroute(failedImage);
    assert.equal(await page.locator('.gallery-compare-bar').count(), 0);
    for (const width of [360, 390, 768]) {
      await page.setViewportSize({ width, height: 844 });
      await overflow();
      await page
        .locator('.gallery-card')
        .first()
        .getByRole('button', { name: /^Подробнее/ })
        .click();
      const dialog = page.getByRole('dialog');
      await dialog.waitFor();
      await dialog
        .getByRole('button', { name: 'Общий вид планировки', exact: true })
        .click();
      assert.match(
        await dialog.locator('img.gallery-render').getAttribute('src'),
        /overview\.png$/,
      );
      await dialog
        .getByRole('button', { name: 'Следующий ракурс', exact: true })
        .click();
      assert.match(
        await dialog.locator('img.gallery-render').getAttribute('src'),
        /kitchen\.png$/,
      );
      assert.ok(
        await dialog.evaluate((el) => el.scrollWidth <= el.clientWidth),
      );
      await overflow();
      if (width === 390)
        await page.screenshot({
          path: path.join(outputDirectory, 'gallery-detail-mobile.png'),
        });
      await page
        .getByRole('button', { name: 'Закрыть концепцию', exact: true })
        .click();
      await dialog.waitFor({ state: 'hidden' });
    }
    await page.setViewportSize({ width: 390, height: 844 });
    await page
      .locator('.gallery-card')
      .first()
      .getByRole('button', { name: /^Сравнить\s*:/ })
      .click();
    await page
      .locator('.gallery-card')
      .nth(1)
      .getByRole('button', { name: /^Сравнить\s*:/ })
      .click();
    await overflow();
    await page
      .getByRole('button', { name: 'Сравнить два варианта', exact: true })
      .click();
    const comparison = page.getByRole('dialog');
    await comparison.waitFor();
    assert.ok(
      await comparison.evaluate((el) => el.scrollWidth <= el.clientWidth),
    );
    await page.screenshot({
      path: path.join(outputDirectory, 'gallery-compare-mobile.png'),
    });
    await page
      .getByRole('button', { name: 'Закрыть сравнение', exact: true })
      .click();
    await comparison.waitFor({ state: 'hidden' });
    await page
      .getByRole('button', { name: 'Очистить сравнение', exact: true })
      .click();
    await page.evaluate(() => scrollTo(0, 0));
    await page.screenshot({
      path: path.join(outputDirectory, 'gallery-mobile.png'),
      fullPage: true,
    });
    assert.equal(
      await page.evaluate(() => JSON.stringify({ ...localStorage })),
      snapshot,
    );
    await page.reload();
    await page.locator('.gallery-card').last().waitFor();
    assert.equal(
      await page.evaluate(() => JSON.stringify({ ...localStorage })),
      snapshot,
    );
    assert.deepEqual(errors, []);
    console.log(
      'PASS gallery: 30 finished interiors, 42 model references in 12 variants, 4 plans, all thumbnails, source toggles/full-image links, wrapping/keyboard navigation, independent comparison, 360/390/768 widths, project bytes unchanged and reload',
    );
  } finally {
    await context.close();
  }
}
