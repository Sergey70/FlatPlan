import assert from 'node:assert/strict';
import path from 'node:path';
import {
  createPlanProject,
  DEFAULT_PLAN_ID,
  PLAN_REVISION,
  planArrangementId,
  planLayouts,
} from '../lib/plan-project.ts';

// Tolerate only round-off between Node and Chromium, not dimensional differences.
export function sameGeometry(actual, expected, location = 'scene') {
  if (typeof actual === 'number' && typeof expected === 'number') {
    assert.ok(
      Math.abs(actual - expected) < 1e-8,
      `${location}: ${actual} != ${expected}`,
    );
  } else if (
    actual &&
    expected &&
    typeof actual === 'object' &&
    typeof expected === 'object'
  ) {
    assert.deepEqual(Object.keys(actual), Object.keys(expected), location);
    for (const key of Object.keys(actual))
      sameGeometry(actual[key], expected[key], `${location}.${key}`);
  } else assert.equal(actual, expected, location);
}

export async function checkSourcePlan(browser, url, out, h) {
  const context = await browser.newContext({
    viewport: { width: 1365, height: 960 },
  });
  await h.installTools(context);
  const page = await context.newPage(),
    errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const seed = createPlanProject();
  await page.goto(url);
  await h.loaded(page);
  await h.saved(page);
  let current = await h.project(page);
  assert.equal(current.sourceRevision, PLAN_REVISION);
  assert.equal(current.activeArrangement, DEFAULT_PLAN_ID);
  assert.equal(current.arrangements.length, 5);
  sameGeometry(current.scene.objects, seed.scene.objects);
  await page.screenshot({ path: path.join(out, 'plan-009-default-3d.png') });
  await h.panel(page, 'Варианты');
  assert.equal(await page.locator('.ed-variants article').count(), 5);
  for (const arrangement of seed.arrangements) {
    await h.call(page, 'manage_editor_arrangement', {
      action: 'open',
      id: arrangement.id,
    });
    current = await h.project(page);
    sameGeometry(current.scene.objects, arrangement.scene.objects);
    await h.call(page, 'configure_editor_view', { mode: '2d', labels: false });
    const windows = current.scene.objects
      .flatMap((n) => n.children)
      .filter((n) => n.geometry.openingType === 'window');
    for (const window of windows)
      assert.equal(
        await page
          .locator(`.ed-plan path[data-object-id="${window.id}"]`)
          .count(),
        1,
      );
    await h.noOverflow(page);
    await page.screenshot({ path: path.join(out, `${arrangement.id}-2d.png`) });
  }
  await h.call(page, 'manage_editor_arrangement', {
    action: 'open',
    id: DEFAULT_PLAN_ID,
  });
  current = await h.project(page);
  const wall = current.scene.objects.find(
    (n) => n.geometry.kind === 'wall' && n.children.length,
  );
  await h.call(page, 'configure_editor_view', {
    mode: '2d',
    selected: wall.id,
  });
  await h.panel(page, 'Свойства');
  await h.editField(page, 'Длина', wall.geometry.size[0] + 0.5);
  const changed = (await h.project(page)).scene.objects.find(
    (n) => n.id === wall.id,
  );
  assert.ok(
    Math.abs(changed.geometry.size[0] - wall.geometry.size[0] - 0.5) < 0.001,
  );
  sameGeometry(changed.children, wall.children);
  sameGeometry(changed.geometry.wallProfile, wall.geometry.wallProfile);
  await h.call(page, 'editor_history', { action: 'undo' });
  sameGeometry((await h.project(page)).scene.objects, current.scene.objects);
  await h.panel(page, 'Объекты');
  await page
    .getByRole('button', { name: 'Добавить стену на план', exact: true })
    .click();
  let added = (await h.project(page)).scene.objects.find(
    (n) => !current.scene.objects.some((o) => o.id === n.id),
  );
  assert.equal(added.geometry.kind, 'wall');
  assert.equal(added.geometry.size[1], 2.7);
  await h.saved(page);
  const exported = await h.project(page);
  await page.reload();
  await h.loaded(page);
  await h.saved(page);
  sameGeometry((await h.project(page)).scene.objects, exported.scene.objects);
  // Removing starter variants is a deliberate edit; refresh must never recreate them.
  const withoutVariants = {
    ...exported,
    arrangements: [],
    activeArrangement: null,
  };
  await h.call(page, 'import_editor_project', {
    json: JSON.stringify(withoutVariants),
  });
  await h.saved(page);
  await page.reload();
  await h.loaded(page);
  assert.equal((await h.project(page)).arrangements.length, 0);
  sameGeometry((await h.project(page)).scene.objects, exported.scene.objects);
  assert.deepEqual(errors, []);
  await context.close();

  // Existing PLAN-008 projects update in place, including the retired left-plan deep link.
  for (const activeLeft of [false, true]) {
    const previous = structuredClone(seed);
    previous.sourceRevision = 'plan-008';
    previous.scene.view.mode = '2d';
    previous.scene.view.palette = 'contrast';
    previous.scene.objects.find(
      (n) => n.geometry.kind === 'wall',
    ).geometry.size[1] = 2.9;
    const kitchenId = `plan-floor-${planLayouts[0].rooms.find((r) => r.area === 21.43).id}`;
    previous.scene.objects.find((n) => n.id === kitchenId).name =
      'Пол — Кухня-гостиная';
    const right = previous.arrangements.find((a) => a.id === DEFAULT_PLAN_ID);
    right.scene.view.mode = '2d';
    right.scene.objects.find((n) => n.category === 'furniture').position[0] +=
      0.2;
    const leftWall = structuredClone(
      previous.scene.objects.find((n) => n.geometry.kind === 'wall'),
    );
    leftWall.id = 'plan-wall-001';
    leftWall.children = [];
    const left = {
      id: planArrangementId('plan-1'),
      name: 'План 1 — кухня и спальня',
      scene: {
        objects: [leftWall],
        view: structuredClone(previous.scene.view),
      },
    };
    previous.arrangements.unshift(left);
    if (activeLeft) {
      previous.activeArrangement = left.id;
      previous.scene = structuredClone(left.scene);
    }
    const expected = structuredClone(activeLeft ? right.scene : previous.scene);
    expected.objects.find((n) => n.id === kitchenId).name = 'Пол — Кухня';
    const migration = await browser.newContext({
      viewport: { width: 1365, height: 960 },
    });
    await h.installTools(migration);
    await migration.addInitScript((value) => {
      if (!localStorage.getItem('plan009-seeded')) {
        localStorage.setItem('flatplan.editor.v1', value);
        localStorage.setItem('plan009-seeded', 'yes');
      }
    }, JSON.stringify(previous));
    const migratedPage = await migration.newPage();
    await migratedPage.goto(activeLeft ? `${url}?layout=plan-1` : url);
    await h.loaded(migratedPage);
    await h.saved(migratedPage);
    const updated = await h.project(migratedPage);
    assert.equal(updated.sourceRevision, PLAN_REVISION);
    assert.equal(updated.activeArrangement, DEFAULT_PLAN_ID);
    assert.equal(updated.arrangements.length, 5);
    assert.ok(!updated.arrangements.some((a) => a.id === left.id));
    sameGeometry(updated.scene.objects, expected.objects);
    await h.panel(migratedPage, 'Варианты');
    const names = await migratedPage
      .locator('.ed-variants input')
      .evaluateAll((inputs) => inputs.map((input) => input.value));
    assert.ok(!names.includes(left.name));
    const labels = await migratedPage
      .locator('.ed-plan text')
      .allTextContents();
    assert.ok(labels.includes('Кухня'));
    assert.ok(labels.includes('Спальня'));
    await migratedPage.reload();
    await h.loaded(migratedPage);
    await h.saved(migratedPage);
    sameGeometry(
      (await h.project(migratedPage)).scene.objects,
      expected.objects,
    );
    assert.ok(!new URL(migratedPage.url()).searchParams.has('layout'));
    if (!activeLeft)
      await migratedPage.screenshot({
        path: path.join(out, 'plan-009-labels-2d.png'),
      });
    await migration.close();
  }

  const mobile = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  await h.installTools(mobile);
  const phone = await mobile.newPage();
  await phone.goto(url);
  await h.loaded(phone);
  await h.saved(phone);
  await h.panel(phone, 'Варианты');
  assert.equal(await phone.locator('.ed-variants article').count(), 5);
  for (const width of [360, 390, 768]) {
    await phone.setViewportSize({ width, height: 844 });
    await h.noOverflow(phone);
  }
  await phone.setViewportSize({ width: 390, height: 844 });
  await phone.screenshot({ path: path.join(out, 'plan-009-mobile.png') });
  await mobile.close();
  console.log(
    'Source plan: five exact scenes, four windows per apartment, profiled wall editing, reload and mobile passed.',
  );
}
