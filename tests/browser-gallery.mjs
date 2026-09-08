import assert from 'node:assert/strict';
import path from 'node:path';

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
    assert.equal(await page.locator('.gallery-card').count(), 15);
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
    assert.equal(sources.length, 20);
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
    await page.getByRole('button', { name: 'План 1', exact: true }).click();
    assert.equal(await page.locator('.gallery-card').count(), 3);
    await page
      .getByRole('button', { name: 'Тёплая отделка', exact: true })
      .click();
    assert.equal(await page.locator('.gallery-card').count(), 1);
    assert.equal(
      await page.locator('.gallery-card').getAttribute('data-concept'),
      'plan-1-warm',
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
      /plan-1\.svg$/,
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
    await page.getByRole('button', { name: 'План 2', exact: true }).click();
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
      13,
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
      assert.ok(
        await dialog.evaluate((el) => el.scrollWidth <= el.clientWidth),
      );
      await overflow();
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
      'PASS gallery: 15 model renders, 5 plans, filters, detail/comparison, keyboard focus, 360/390/768 widths, project bytes unchanged and reload',
    );
  } finally {
    await context.close();
  }
}
