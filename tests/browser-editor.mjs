import assert from 'node:assert/strict';
import { checkGallery } from './browser-gallery.mjs';
import { chromium } from 'playwright';
import { PerspectiveCamera, Vector3 } from 'three';
import { spawn } from 'node:child_process';
import { mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.dirname(path.dirname(fileURLToPath(import.meta.url))),
  out = path.join(root, '.local', 'qa');
await mkdir(out, { recursive: true });
const external = process.env.FLATPLAN_QA_URL,
  url = external || 'http://127.0.0.1:4188/';
let server,
  serverLog = '';
if (!external) {
  server = spawn(
    process.execPath,
    [
      'node_modules/vite/bin/vite.js',
      'preview',
      '--host',
      '127.0.0.1',
      '--port',
      '4188',
      '--strictPort',
    ],
    { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] },
  );
  for (const stream of [server.stdout, server.stderr])
    stream.on('data', (data) => {
      serverLog = (serverLog + data).slice(-4000);
    });
}
let browser;
const errors = [];
async function installTools(context) {
  await context.addInitScript(() => {
    window.__flatplanTools = {};
    Object.defineProperty(document, 'modelContext', {
      configurable: true,
      value: {
        registerTool(tool, { signal }) {
          window.__flatplanTools[tool.name] = tool;
          signal.addEventListener('abort', () => {
            if (window.__flatplanTools[tool.name] === tool)
              delete window.__flatplanTools[tool.name];
          });
        },
      },
    });
  });
}
async function call(page, name, args = {}) {
  const result = await page.evaluate(
    async ({ name, args }) => await window.__flatplanTools[name].execute(args),
    { name, args },
  );
  await page.evaluate(
    () =>
      new Promise((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(resolve)),
      ),
  );
  return result;
}
async function project(page) {
  return JSON.parse((await call(page, 'export_editor_project')).json);
}
async function status(page) {
  return await call(page, 'get_editor_project');
}
async function loaded(page) {
  await page.waitForFunction(
    () => window.__flatplanTools?.get_editor_project?.execute({}).status.ready,
    undefined,
    { timeout: 30000 },
  );
}
async function saved(page) {
  await page.waitForFunction(
    () =>
      window.__flatplanTools?.get_editor_project?.execute({}).status
        .saveStatus === 'saved',
    undefined,
    { timeout: 15000 },
  );
}
async function panel(page, name) {
  await page
    .locator('.ed-tabs')
    .getByRole('button', { name, exact: true })
    .click();
}
async function select(page, id) {
  await panel(page, 'Объекты');
  const search = page.getByRole('textbox', { name: 'Поиск объектов' });
  await search.fill('');
  await page
    .locator(`.ed-tree-row[data-object-id="${id}"] .ed-tree-name`)
    .click();
}
async function editField(page, label, value) {
  const input = page.getByRole('textbox', { name: label, exact: true });
  await input.fill(String(value));
  await input.press('Tab');
  await page.evaluate(
    () => new Promise((resolve) => requestAnimationFrame(resolve)),
  );
}
async function noOverflow(page) {
  const sizes = await page.evaluate(() => ({
    viewport: innerWidth,
    document: document.documentElement.scrollWidth,
  }));
  assert.ok(sizes.document <= sizes.viewport, JSON.stringify(sizes));
}
try {
  const start = Date.now();
  for (;;) {
    try {
      const response = await fetch(url);
      if (response.ok) break;
    } catch {}
    if (Date.now() - start > 30000)
      throw new Error(`Preview did not start: ${serverLog}`);
    await new Promise((r) => setTimeout(r, 200));
  }
  browser = await chromium.launch({
    headless: true,
    args: ['--enable-unsafe-swiftshader'],
  });
  await checkGallery(browser, url, out);
  const desktop = await browser.newContext({
    viewport: { width: 1365, height: 900 },
    deviceScaleFactor: 1,
  });
  await installTools(desktop);
  const page = await desktop.newPage();
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(url);
  await loaded(page);
  await saved(page);
  await noOverflow(page);
  const partitionIds = [
    'wall-proposed-kitchen-hall',
    'wall-proposed-kitchen-room',
    'wall-proposed-room-hall',
  ];
  assert.equal(
    (await status(page)).activeArrangement,
    'kitchen-by-bathroom-v2',
  );
  await page
    .getByRole('button', { name: 'Убрать новые перегородки', exact: true })
    .click();
  assert.ok(
    (await project(page)).scene.objects
      .filter((n) => partitionIds.includes(n.id))
      .every((n) => !n.visible),
  );
  await page
    .getByRole('button', { name: 'Вернуть новые перегородки', exact: true })
    .click();
  assert.ok(
    (await project(page)).scene.objects
      .filter((n) => partitionIds.includes(n.id))
      .every((n) => n.visible),
  );
  // Restoring all three after deletion must retain the current furniture edits.
  for (const id of partitionIds)
    await call(page, 'edit_editor_object', { action: 'remove', id });
  await page
    .getByRole('button', { name: 'Вернуть новые перегородки', exact: true })
    .click();
  assert.equal(
    (await project(page)).scene.objects.filter(
      (n) => partitionIds.includes(n.id) && n.visible,
    ).length,
    3,
  );
  await select(page, partitionIds[1]);
  await page.getByRole('button', { name: 'Удалить', exact: true }).click();
  assert.ok(
    !(await project(page)).scene.objects.some((n) => n.id === partitionIds[1]),
  );
  await page
    .getByRole('button', { name: 'Отменить изменение', exact: true })
    .click();
  assert.ok(
    (await project(page)).scene.objects.some((n) => n.id === partitionIds[1]),
  );
  await panel(page, 'Объекты');
  await page
    .getByRole('button', { name: 'Добавить стену на план', exact: true })
    .click();
  const addedWall = (await status(page)).view.selected;
  assert.equal((await status(page)).view.mode, '2d');
  await editField(page, 'Длина', 1.234);
  await editField(page, 'X — вправо', 5.55);
  await editField(page, 'Z — вниз плана', 4.1);
  const extraWall = await call(page, 'get_editor_project', {
    objectId: addedWall,
  });
  assert.ok(Math.abs(extraWall.dimensions[0] - 1.234) < 1e-5);
  assert.equal(extraWall.node.position[0], 5.55);
  await page.getByRole('button', { name: 'Удалить', exact: true }).click();
  await call(page, 'configure_editor_view', { mode: '2d', selected: null });
  await panel(page, 'Объекты');
  await page.screenshot({
    path: path.join(out, 'partition-plan-desktop.png'),
    fullPage: true,
  });
  await call(page, 'configure_editor_view', { mode: '3d', selected: null });
  await page.getByRole('button', { name: 'Вращать вид', exact: true }).click();
  console.log(
    'PASS proposed layout: default rooms/windows, hide/restore, individual delete/undo, add wall at precise coordinates',
  );

  await page
    .getByRole('button', { name: 'Размер стены у кухни', exact: true })
    .click();
  await editField(page, 'Длина', 1.6);
  await editField(page, 'Высота', 2.9);
  await editField(page, 'Толщина', 0.15);
  const extension = await call(page, 'get_editor_project', {
    objectId: partitionIds[0],
  });
  assert.deepEqual(extension.dimensions, [1.6, 2.9, 0.15]);
  assert.equal(extension.node.children[0].geometry.openingType, 'door');
  await editField(page, 'Длина', 1);
  await editField(page, 'Высота', 2.8);
  await editField(page, 'Толщина', 0.11);
  await call(page, 'configure_editor_view', { selected: null });
  const initial = await project(page);
  assert.equal((await status(page)).status.unavailable, false);
  const sofa = initial.scene.objects.find((n) => n.name === 'Диван');
  assert.ok(sofa);
  await select(page, sofa.id);
  await editField(page, 'Ширина', 3.125);
  const cancelField = page.getByRole('textbox', {
    name: 'Ширина',
    exact: true,
  });
  await cancelField.fill('9.999');
  await cancelField.press('Escape');
  assert.equal(await cancelField.inputValue(), '3.125');
  await editField(page, 'X — вправо', 1.111);
  await editField(page, 'Поворот вокруг вертикали, °', 37);
  let inspected = await call(page, 'get_editor_project', { objectId: sofa.id });
  assert.ok(Math.abs(inspected.dimensions[0] - 3.125) < 1e-5);
  assert.equal(inspected.node.position[0], 1.111);
  assert.equal(inspected.node.rotation[1], 37);
  await editField(page, 'Цвет HEX', '#225577');
  inspected = await call(page, 'get_editor_project', { objectId: sofa.id });
  assert.ok(inspected.node.children.every((n) => n.color === '#225577'));
  // Select and edit a real nested part through the tree, independently of its siblings.
  await panel(page, 'Объекты');
  await page
    .getByRole('button', { name: 'Развернуть Диван', exact: true })
    .click();
  const part = sofa.children[0];
  await page
    .locator(`.ed-tree-row[data-object-id="${part.id}"] .ed-tree-name`)
    .click();
  await editField(page, 'Цвет HEX', '#cc3344');
  inspected = await call(page, 'get_editor_project', { objectId: sofa.id });
  assert.equal(inspected.node.children[0].color, '#cc3344');
  assert.equal(inspected.node.children[1].color, '#225577');
  // Wall dimensions/position use the same inspector and must retain the door.
  const wallId = 'wall-bedroom-divider';
  await select(page, wallId);
  await editField(page, 'Длина', 6.15);
  await editField(page, 'X — вправо', 4.333);
  inspected = await call(page, 'get_editor_project', { objectId: wallId });
  assert.equal(inspected.node.position[0], 4.333);
  assert.ok(Math.abs(inspected.dimensions[0] - 6.15) < 1e-5);
  assert.equal(inspected.node.children[0].geometry.openingType, 'door');
  await panel(page, 'Варианты');
  await page
    .getByRole('textbox', { name: 'Название нового варианта' })
    .fill('QA A');
  await page
    .getByRole('button', { name: 'Сохранить как новый вариант', exact: true })
    .click();
  const a = (await status(page)).activeArrangement;
  await call(page, 'edit_editor_object', {
    action: 'update',
    id: wallId,
    position: [4.555, 0, 2.6],
  });
  await page
    .getByRole('textbox', { name: 'Название нового варианта' })
    .fill('QA B');
  await page
    .getByRole('button', { name: 'Сохранить как новый вариант', exact: true })
    .click();
  const b = (await status(page)).activeArrangement;
  assert.notEqual(a, b);
  await call(page, 'manage_editor_arrangement', { action: 'open', id: a });
  assert.equal(
    (await call(page, 'get_editor_project', { objectId: wallId })).node
      .position[0],
    4.333,
  );
  await call(page, 'manage_editor_arrangement', { action: 'open', id: b });
  assert.equal(
    (await call(page, 'get_editor_project', { objectId: wallId })).node
      .position[0],
    4.555,
  );
  // Exact camera and display configuration are part of the transferable document.
  await call(page, 'configure_editor_view', {
    mode: '3d',
    planZoom: 1.728,
    night: false,
    palette: 'contrast',
    selected: null,
    camera: { position: [-9, 13, 18], target: [3.6, 1.2, 4.5] },
  });
  await panel(page, 'Файл');
  const downloadEvent = page.waitForEvent('download');
  await page
    .getByRole('button', { name: 'Скачать проект JSON', exact: true })
    .click();
  const download = await downloadEvent;
  const exportedPath = path.join(out, 'edited-project.json');
  await download.saveAs(exportedPath);
  const exported = JSON.parse(await readFile(exportedPath, 'utf8'));
  assert.deepEqual(exported, await project(page));
  const beforeBad = await project(page);
  await page.locator('input[type=file]').setInputFiles({
    name: 'bad.json',
    mimeType: 'application/json',
    buffer: Buffer.from('{broken'),
  });
  assert.ok(await page.getByRole('alert').isVisible());
  assert.deepEqual(await project(page), beforeBad);
  await page.getByRole('button', { name: 'Закрыть сообщение' }).click();
  await saved(page);
  const beforeReload = await project(page);
  await page.reload();
  await loaded(page);
  await saved(page);
  assert.deepEqual(await project(page), beforeReload);
  await page.screenshot({
    path: path.join(out, 'editor-desktop.png'),
    fullPage: true,
  });
  console.log(
    'PASS desktop: nested edits, exact dimensions/colors, variants, invalid import, JSON download and reload',
  );
  // Exercise actual 3D gizmos in an isolated project, including a cancelled drag.
  const gestures = await browser.newContext({
    viewport: { width: 1365, height: 900 },
  });
  await installTools(gestures);
  const gp = await gestures.newPage();
  gp.on('pageerror', (e) => errors.push(e.message));
  await gp.goto(url);
  await loaded(gp);
  await call(gp, 'edit_editor_object', { action: 'add', catalog: 'box' });
  const gid = (await status(gp)).view.selected;
  const pose = { position: [14, 8, 13], target: [11, 0.5, 5] };
  await call(gp, 'edit_editor_object', {
    action: 'update',
    id: gid,
    position: [11, 0.5, 5],
  });
  await call(gp, 'configure_editor_view', {
    mode: '3d',
    selected: gid,
    camera: pose,
  });
  await gp
    .getByRole('button', { name: 'Перемещать объект', exact: true })
    .click();
  const gc = gp.locator('.ed-canvas canvas'),
    gr = await gc.boundingBox();
  function screen(world, cameraState = pose) {
    const camera = new PerspectiveCamera(40, gr.width / gr.height, 0.03, 500);
    camera.position.set(...cameraState.position);
    camera.lookAt(...cameraState.target);
    camera.updateMatrixWorld();
    const p = new Vector3(...world).project(camera);
    return {
      x: gr.x + ((p.x + 1) * gr.width) / 2,
      y: gr.y + ((1 - p.y) * gr.height) / 2,
    };
  }
  function factor(pos) {
    return (
      (new Vector3(...pos).distanceTo(new Vector3(...pose.position)) *
        1.9 *
        Math.tan(Math.PI / 9) *
        1.1) /
      4
    );
  }
  async function axisStart(pos) {
    const p = screen([pos[0] + factor(pos) * 0.4, pos[1], pos[2]]);
    await gp.mouse.move(p.x, p.y);
    await gp.mouse.down();
    return p;
  }
  const originalPosition = (
    await call(gp, 'get_editor_project', { objectId: gid })
  ).node.position;
  let handle = await axisStart(originalPosition);
  await gp.mouse.move(handle.x + 70, handle.y, { steps: 8 });
  await gp.mouse.up();
  const movedPosition = (
    await call(gp, 'get_editor_project', { objectId: gid })
  ).node.position;
  assert.notDeepEqual(
    movedPosition,
    originalPosition,
    '3D axis must move the authoritative object',
  );
  await gp.mouse.move(gr.x + 10, gr.y + gr.height - 10);
  const beforeCancelImage = await gc.screenshot();
  handle = await axisStart(movedPosition);
  await gp.mouse.move(handle.x + 45, handle.y + 10, { steps: 8 });
  await gp.keyboard.press('Escape');
  await gp.mouse.up();
  assert.deepEqual(
    (await call(gp, 'get_editor_project', { objectId: gid })).node.position,
    movedPosition,
  );
  await gp
    .getByRole('button', { name: 'Перемещать объект', exact: true })
    .click();
  await gp.mouse.move(gr.x + 10, gr.y + gr.height - 10);
  assert.deepEqual(
    await gc.screenshot(),
    beforeCancelImage,
    'Cancelled gizmo must restore rendered geometry too',
  );
  await gp
    .getByRole('button', { name: 'Повернуть объект', exact: true })
    .click();
  const f = factor(movedPosition),
    startRing = screen([
      movedPosition[0] + f * 0.35,
      movedPosition[1],
      movedPosition[2] + f * 0.35,
    ]),
    endRing = screen([
      movedPosition[0] + f * 0.35,
      movedPosition[1],
      movedPosition[2] - f * 0.35,
    ]);
  await gp.mouse.move(startRing.x, startRing.y);
  await gp.mouse.down();
  await gp.mouse.move(endRing.x, endRing.y, { steps: 12 });
  await gp.mouse.up();
  assert.ok(
    Math.abs(
      (await call(gp, 'get_editor_project', { objectId: gid })).node
        .rotation[1],
    ) > 1,
    '3D ring must rotate the object',
  );
  await gp.getByRole('button', { name: 'Вращать вид', exact: true }).click();
  await call(gp, 'configure_editor_view', {
    camera: { position: [-9, 13, 18], target: [3.6, 1.2, 4.5] },
    selected: null,
  });
  const label = screen([4.21, 0.9, 1.275], {
    position: [-9, 13, 18],
    target: [3.6, 1.2, 4.5],
  });
  await gp.mouse.click(label.x, label.y);
  await saved(gp);
  assert.ok((await project(gp)).scene.view.selected !== undefined);
  await panel(gp, 'Файл');
  const pngEvent = gp.waitForEvent('download');
  await gp
    .getByRole('button', { name: 'Сохранить текущий 3D-вид PNG', exact: true })
    .click();
  const png = await pngEvent;
  await png.saveAs(path.join(out, 'editor-snapshot.png'));
  const pngData = await readFile(path.join(out, 'editor-snapshot.png'));
  assert.equal(pngData.subarray(1, 4).toString(), 'PNG');
  console.log(
    'PASS 3D: axis move, ring rotation, Escape restores mesh and model, label picking, PNG export',
  );
  await gestures.close();

  // Storage failures preserve useful recovery instructions and the original bytes.
  const recovery = await browser.newContext();
  await installTools(recovery);
  await recovery.addInitScript(() => {
    Storage.prototype.setItem = function () {
      throw new DOMException('QA quota exceeded', 'QuotaExceededError');
    };
  });
  const rp = await recovery.newPage();
  await rp.goto(url);
  await loaded(rp);
  await panel(rp, 'Файл');
  await rp
    .getByRole('button', { name: 'Сохранить сейчас в браузере', exact: true })
    .click();
  await rp.getByRole('alert').filter({ hasText: 'Скачайте JSON' }).waitFor();
  assert.equal((await status(rp)).status.saveStatus, 'error');
  await recovery.close();
  const corrupt = await browser.newContext();
  await installTools(corrupt);
  await corrupt.addInitScript(() =>
    localStorage.setItem('flatplan.editor.v1', '{broken-original'),
  );
  const cp = await corrupt.newPage();
  await cp.goto(url);
  await loaded(cp);
  assert.equal((await status(cp)).status.storagePaused, true);
  assert.equal(
    await cp.evaluate(() => localStorage.getItem('flatplan.editor.v1')),
    '{broken-original',
  );
  await panel(cp, 'Файл');
  await cp
    .getByRole('button', {
      name: 'Сбросить пользовательские данные',
      exact: true,
    })
    .click();
  await cp
    .getByRole('button', { name: 'Сбросить безвозвратно', exact: true })
    .click();
  await saved(cp);
  assert.equal((await status(cp)).status.storagePaused, false);
  assert.equal(
    JSON.parse(
      await cp.evaluate(() => localStorage.getItem('flatplan.editor.v1')),
    ).name,
    initial.name,
  );
  await corrupt.close();
  console.log(
    'PASS recovery: quota error remains visible; corrupt storage is not overwritten',
  );

  // Reset is explicitly confirmed, scoped to FlatPlan and permanent across reload/undo.
  const resetContext = await browser.newContext({
    viewport: { width: 1365, height: 900 },
  });
  await installTools(resetContext);
  const resetPage = await resetContext.newPage();
  resetPage.on('pageerror', (error) => errors.push(error.message));
  await resetPage.goto(url);
  await loaded(resetPage);
  const baseline = await project(resetPage);
  await panel(resetPage, 'Файл');
  await editField(resetPage, 'Название проекта', 'Личный проект для сброса');
  await call(resetPage, 'edit_editor_object', {
    action: 'remove',
    id: partitionIds[0],
  });
  await call(resetPage, 'configure_editor_view', {
    mode: '2d',
    night: true,
    palette: 'warm',
    planZoom: 1.5,
  });
  await call(resetPage, 'manage_editor_arrangement', {
    action: 'save',
    name: 'Удаляемый вариант',
  });
  await saved(resetPage);
  await resetPage.evaluate(() => localStorage.setItem('other-project', 'keep'));
  const userProject = await project(resetPage);
  const userBytes = await resetPage.evaluate(() =>
    localStorage.getItem('flatplan.editor.v1'),
  );
  const confirmReset = resetPage.getByRole('region', {
    name: 'Подтверждение сброса',
    exact: true,
  });
  const resetButton = resetPage.getByRole('button', {
    name: 'Сбросить пользовательские данные',
    exact: true,
  });
  await resetButton.click();
  await confirmReset
    .getByRole('button', { name: 'Отмена', exact: true })
    .click();
  assert.deepEqual(await project(resetPage), userProject);
  assert.equal(
    await resetPage.evaluate(() => localStorage.getItem('flatplan.editor.v1')),
    userBytes,
  );
  assert.equal(
    await resetPage
      .getByRole('button', { name: 'Отменить изменение', exact: true })
      .isEnabled(),
    true,
  );

  // Failed deletion must retain the exact save, current project and undo history.
  await resetPage.evaluate(() => {
    window.__qaRemoveItem = Storage.prototype.removeItem;
    Storage.prototype.removeItem = () => {
      throw new DOMException('QA deletion denied', 'SecurityError');
    };
  });
  await resetButton.click();
  await confirmReset
    .getByRole('button', { name: 'Сбросить безвозвратно', exact: true })
    .click();
  await resetPage
    .getByRole('alert')
    .filter({ hasText: 'Не удалось удалить данные' })
    .waitFor();
  assert.deepEqual(await project(resetPage), userProject);
  assert.equal(
    await resetPage.evaluate(() => localStorage.getItem('flatplan.editor.v1')),
    userBytes,
  );
  assert.equal(
    await resetPage
      .getByRole('button', { name: 'Отменить изменение', exact: true })
      .isEnabled(),
    true,
  );
  await resetPage.evaluate(() => {
    Storage.prototype.removeItem = window.__qaRemoveItem;
  });
  await confirmReset
    .getByRole('button', { name: 'Отмена', exact: true })
    .click();

  // Pending imports are also cleared; a second tab must stop saving its stale scene.
  await resetPage.locator('input[type=file]').setInputFiles({
    name: 'pending.json',
    mimeType: 'application/json',
    buffer: Buffer.from(userBytes),
  });
  await resetPage
    .getByRole('region', { name: 'Подтверждение импорта', exact: true })
    .waitFor();
  const otherTab = await resetContext.newPage();
  otherTab.on('pageerror', (error) => errors.push(error.message));
  await otherTab.goto(url);
  await loaded(otherTab);
  await saved(otherTab);
  await resetButton.click();
  await confirmReset.scrollIntoViewIfNeeded();
  await resetPage.screenshot({
    path: path.join(out, 'reset-confirm-desktop.png'),
  });
  await confirmReset
    .getByRole('button', { name: 'Сбросить безвозвратно', exact: true })
    .click();
  await saved(resetPage);
  const clean = await project(resetPage);
  assert.equal(clean.name, baseline.name);
  assert.deepEqual(clean.scene.objects, baseline.scene.objects);
  assert.deepEqual(clean.arrangements, baseline.arrangements);
  assert.equal(clean.activeArrangement, baseline.activeArrangement);
  for (const key of ['mode', 'night', 'palette', 'planZoom', 'selected'])
    assert.deepEqual(clean.scene.view[key], baseline.scene.view[key]);
  assert.equal(
    await resetPage
      .getByRole('region', { name: 'Подтверждение импорта', exact: true })
      .count(),
    0,
  );
  for (const name of ['Отменить изменение', 'Повторить изменение'])
    assert.equal(
      await resetPage.getByRole('button', { name, exact: true }).isDisabled(),
      true,
    );
  await call(resetPage, 'editor_history', { action: 'undo' });
  await call(resetPage, 'editor_history', { action: 'redo' });
  assert.deepEqual(await project(resetPage), clean);
  await otherTab.waitForFunction(
    () =>
      window.__flatplanTools.get_editor_project.execute({}).status
        .storagePaused,
  );
  await otherTab.evaluate(() => {
    window.dispatchEvent(new Event('beforeunload'));
    window.dispatchEvent(new Event('pagehide'));
  });
  assert.equal(
    JSON.parse(
      await otherTab.evaluate(() => localStorage.getItem('flatplan.editor.v1')),
    ).name,
    baseline.name,
  );
  await panel(otherTab, 'Файл');
  await otherTab
    .getByRole('button', {
      name: 'Загрузить сохранённое в браузере',
      exact: true,
    })
    .click();
  assert.deepEqual(
    (await project(otherTab)).arrangements,
    baseline.arrangements,
  );
  assert.equal(
    await otherTab
      .getByRole('button', { name: 'Отменить изменение', exact: true })
      .isDisabled(),
    true,
  );
  await otherTab.close();
  await resetPage.reload();
  await loaded(resetPage);
  await saved(resetPage);
  assert.deepEqual(
    (await project(resetPage)).scene.objects,
    baseline.scene.objects,
  );
  assert.deepEqual(
    (await project(resetPage)).arrangements,
    baseline.arrangements,
  );
  assert.equal(
    await resetPage.evaluate(() => localStorage.getItem('other-project')),
    'keep',
  );

  // Mobile reset is usable even when the browser cannot write the fresh default save.
  await resetPage.setViewportSize({ width: 360, height: 844 });
  await panel(resetPage, 'Файл');
  await editField(resetPage, 'Название проекта', 'Повторный сброс');
  await saved(resetPage);
  const emptyTab = await resetContext.newPage();
  await emptyTab.goto(url);
  await loaded(emptyTab);
  await saved(emptyTab);
  await resetPage.evaluate(() => {
    Storage.prototype.setItem = () => {
      throw new DOMException('QA quota exceeded', 'QuotaExceededError');
    };
  });
  await resetButton.click();
  await confirmReset.scrollIntoViewIfNeeded();
  await noOverflow(resetPage);
  await resetPage.screenshot({
    path: path.join(out, 'reset-confirm-mobile.png'),
  });
  await confirmReset
    .getByRole('button', { name: 'Сбросить безвозвратно', exact: true })
    .click();
  await resetPage
    .getByRole('alert')
    .filter({ hasText: 'Не удалось сохранить в браузере' })
    .waitFor();
  assert.equal(
    await resetPage.evaluate(() => localStorage.getItem('flatplan.editor.v1')),
    null,
  );
  await emptyTab.waitForFunction(
    () =>
      window.__flatplanTools.get_editor_project.execute({}).status
        .storagePaused,
  );
  await panel(emptyTab, 'Файл');
  await emptyTab
    .getByRole('button', {
      name: 'Загрузить сохранённое в браузере',
      exact: true,
    })
    .click();
  await saved(emptyTab);
  assert.equal((await project(emptyTab)).name, baseline.name);
  assert.deepEqual(
    (await project(emptyTab)).arrangements,
    baseline.arrangements,
  );
  assert.equal(
    await emptyTab
      .getByRole('button', { name: 'Отменить изменение', exact: true })
      .isDisabled(),
    true,
  );
  await resetContext.close();
  console.log(
    'PASS permanent reset: cancellation, deletion failure, defaults, variants, history, pending import, reload, other tabs, storage scope, mobile and quota recovery',
  );

  // Existing browser projects change only after an explicit request, with a full backup.
  const legacy = structuredClone(initial);
  legacy.scene = structuredClone(
    initial.arrangements.find((a) => a.id === 'initial').scene,
  );
  legacy.arrangements = legacy.arrangements.filter((a) => a.id === 'initial');
  legacy.activeArrangement = 'initial';
  legacy.scene.view.camera = structuredClone(initial.scene.view.camera);
  legacy.scene.objects.find((n) => n.name === 'Диван').color = '#abcdef';
  legacy.name = 'Сохранённый пользовательский проект';
  const previous = structuredClone(initial);
  previous.arrangements[0].id = 'separate-kitchen-v1';
  previous.activeArrangement = 'separate-kitchen-v1';
  previous.scene.objects.find((n) => n.name === 'Кухня').position = [
    0.25, 0, 2.88,
  ];
  previous.name = 'Прежняя кухня сверху';
  for (const previousProject of [legacy, previous]) {
    for (const viaLink of [false, true]) {
      const upgrade = await browser.newContext();
      await installTools(upgrade);
      await upgrade.addInitScript((value) => {
        if (!localStorage.getItem('flatplan.editor.v1'))
          localStorage.setItem('flatplan.editor.v1', value);
      }, JSON.stringify(previousProject));
      const up = await upgrade.newPage();
      up.on('pageerror', (e) => errors.push(e.message));
      await up.goto(viaLink ? `${url}?layout=kitchen-by-bathroom` : url);
      await loaded(up);
      if (!viaLink) {
        assert.deepEqual(await project(up), previousProject);
        await up
          .getByRole('button', {
            name: 'Открыть кухню у санузла',
            exact: true,
          })
          .click();
      }
      await saved(up);
      const upgraded = await project(up);
      assert.equal(upgraded.activeArrangement, 'kitchen-by-bathroom-v2');
      assert.equal(upgraded.name, previousProject.name);
      assert.deepEqual(
        upgraded.arrangements.find(
          (a) => a.name === 'До переноса кухни к санузлу',
        ).scene,
        previousProject.scene,
      );
      assert.ok(upgraded.scene.objects.some((n) => n.id === 'floor-room2'));
      assert.ok(!new URL(up.url()).searchParams.has('layout'));
      await up.reload();
      await loaded(up);
      await saved(up);
      assert.deepEqual(await project(up), upgraded);
      await upgrade.close();
    }
  }
  console.log(
    'PASS saved-project upgrade: explicit button/deep link, full backup and stable reload',
  );

  // A separate storage partition simulates another device.
  const mobile = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    deviceScaleFactor: 1,
  });
  await installTools(mobile);
  const phone = await mobile.newPage();
  phone.on('pageerror', (error) => errors.push(error.message));
  await phone.goto(url);
  await loaded(phone);
  await panel(phone, 'Файл');
  await phone.locator('input[type=file]').setInputFiles(exportedPath);
  await phone
    .getByRole('button', { name: 'Открыть проект', exact: true })
    .click();
  await saved(phone);
  assert.deepEqual(await project(phone), exported);
  await noOverflow(phone);
  await select(phone, sofa.id);
  await editField(phone, 'Ширина', 2.875);
  assert.ok(
    Math.abs(
      (await call(phone, 'get_editor_project', { objectId: sofa.id }))
        .dimensions[0] - 2.875,
    ) < 1e-5,
  );
  await phone.screenshot({
    path: path.join(out, 'editor-mobile-properties.png'),
    fullPage: true,
  });
  // Real touch pinch must move only the camera.
  await phone.getByRole('button', { name: 'Вращать вид', exact: true }).click();
  const beforePinch = await project(phone),
    canvas = await phone.locator('.ed-canvas canvas').boundingBox(),
    cdp = await mobile.newCDPSession(phone);
  const cy = canvas.y + canvas.height * 0.5,
    cx = canvas.x + canvas.width * 0.5;
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [
      { x: cx - 35, y: cy, id: 1 },
      { x: cx + 35, y: cy, id: 2 },
    ],
  });
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchMove',
    touchPoints: [
      { x: cx - 65, y: cy, id: 1 },
      { x: cx + 65, y: cy, id: 2 },
    ],
  });
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchEnd',
    touchPoints: [],
  });
  const afterPinch = await project(phone);
  assert.deepEqual(afterPinch.scene.objects, beforePinch.scene.objects);
  assert.notDeepEqual(
    afterPinch.scene.view.camera,
    beforePinch.scene.view.camera,
  );
  // Add a simple object and drag it in plan view with a touch, then cancel the next drag.
  await call(phone, 'edit_editor_object', { action: 'add', catalog: 'box' });
  const newId = (await status(phone)).view.selected;
  await call(phone, 'configure_editor_view', {
    mode: '2d',
    planZoom: 1,
    selected: newId,
  });
  await phone
    .getByRole('button', { name: 'Перемещать объект', exact: true })
    .click();
  let shape = phone.locator(`.ed-plan path[data-object-id="${newId}"]`).last(),
    rect = await shape.boundingBox();
  assert.ok(rect);
  let x = rect.x + rect.width / 2,
    y = rect.y + rect.height / 2;
  const beforeDrag = (
    await call(phone, 'get_editor_project', { objectId: newId })
  ).node.position;
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [{ x, y, id: 3 }],
  });
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchMove',
    touchPoints: [{ x: x + 22, y: y + 15, id: 3 }],
  });
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchEnd',
    touchPoints: [],
  });
  const afterDrag = (
    await call(phone, 'get_editor_project', { objectId: newId })
  ).node.position;
  assert.notDeepEqual(afterDrag, beforeDrag);
  rect = await shape.boundingBox();
  x = rect.x + rect.width / 2;
  y = rect.y + rect.height / 2;
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [{ x, y, id: 4 }],
  });
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchMove',
    touchPoints: [{ x: x + 20, y: y + 10, id: 4 }],
  });
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchCancel',
    touchPoints: [],
  });
  assert.deepEqual(
    (await call(phone, 'get_editor_project', { objectId: newId })).node
      .position,
    afterDrag,
  );
  await phone
    .getByRole('button', { name: 'Отменить изменение', exact: true })
    .click();
  assert.deepEqual(
    (await call(phone, 'get_editor_project', { objectId: newId })).node
      .position,
    beforeDrag,
  );
  await phone
    .getByRole('button', { name: 'Повторить изменение', exact: true })
    .click();
  assert.deepEqual(
    (await call(phone, 'get_editor_project', { objectId: newId })).node
      .position,
    afterDrag,
  );
  // A second finger during an object drag must cancel the move and zoom the plan.
  rect = await shape.boundingBox();
  x = rect.x + rect.width / 2;
  y = rect.y + rect.height / 2;
  const beforeMulti = await project(phone);
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [{ x, y, id: 6 }],
  });
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchMove',
    touchPoints: [{ x: x + 12, y: y + 7, id: 6 }],
  });
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [
      { x: x + 12, y: y + 7, id: 6 },
      { x: x + 70, y: y + 7, id: 7 },
    ],
  });
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchMove',
    touchPoints: [
      { x: x - 8, y: y + 7, id: 6 },
      { x: x + 90, y: y + 7, id: 7 },
    ],
  });
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchEnd',
    touchPoints: [],
  });
  const afterMulti = await project(phone);
  assert.deepEqual(afterMulti.scene.objects, beforeMulti.scene.objects);
  assert.ok(afterMulti.scene.view.planZoom > beforeMulti.scene.view.planZoom);
  await phone.getByRole('button', { name: 'Вращать вид', exact: true }).click();
  const pr = await phone.locator('.ed-plan > svg').boundingBox();
  x = pr.x + pr.width / 2;
  y = pr.y + pr.height / 2;
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [{ x, y, id: 8 }],
  });
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchMove',
    touchPoints: [{ x: x + 30, y: y + 15, id: 8 }],
  });
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchEnd',
    touchPoints: [],
  });
  const afterPan = await project(phone);
  assert.deepEqual(afterPan.scene.objects, afterMulti.scene.objects);
  assert.notDeepEqual(
    afterPan.scene.view.planOffset,
    afterMulti.scene.view.planOffset,
  );
  await saved(phone);
  const pannedState = await project(phone);
  await phone.reload();
  await loaded(phone);
  await saved(phone);
  assert.deepEqual(await project(phone), pannedState);
  await phone.getByRole('button', { name: 'Весь план', exact: true }).click();
  for (const width of [360, 390, 768]) {
    await phone.setViewportSize({ width, height: 844 });
    await noOverflow(phone);
  }
  await phone.setViewportSize({ width: 390, height: 844 });
  await phone.screenshot({
    path: path.join(out, 'editor-mobile-plan.png'),
    fullPage: true,
  });
  await saved(phone);
  const final = await project(phone);
  await phone.reload();
  await loaded(phone);
  await saved(phone);
  assert.deepEqual(await project(phone), final);
  assert.deepEqual(errors, []);
  console.log(
    'PASS mobile: fresh-device import, inspector, pinch, direct touch move/cancel, undo/redo, 360/390/768 widths and reload',
  );
  console.log(
    'PASS browser acceptance; screenshots and exported fixture are under .local/qa/',
  );
} catch (error) {
  console.error(String(error.stack ?? error).slice(0, 4000));
  process.exitCode = 1;
} finally {
  await browser?.close();
  server?.kill('SIGTERM');
}
