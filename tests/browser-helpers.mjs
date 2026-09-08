import assert from 'node:assert/strict';
export async function installTools(context) {
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
export async function call(page, name, args = {}) {
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
export async function project(page) {
  return JSON.parse((await call(page, 'export_editor_project')).json);
}
export async function status(page) {
  return await call(page, 'get_editor_project');
}
export async function loaded(page) {
  await page.waitForFunction(
    () => window.__flatplanTools?.get_editor_project?.execute({}).status.ready,
    undefined,
    { timeout: 30000 },
  );
}
export async function saved(page) {
  await page.waitForFunction(
    () =>
      window.__flatplanTools?.get_editor_project?.execute({}).status
        .saveStatus === 'saved',
    undefined,
    { timeout: 15000 },
  );
}
export async function panel(page, name) {
  await page
    .locator('.ed-tabs')
    .getByRole('button', { name, exact: true })
    .click();
}
export async function select(page, id) {
  await panel(page, 'Объекты');
  const search = page.getByRole('textbox', { name: 'Поиск объектов' });
  await search.fill('');
  await page
    .locator(`.ed-tree-row[data-object-id="${id}"] .ed-tree-name`)
    .click();
}
export async function editField(page, label, value) {
  const input = page.getByRole('textbox', { name: label, exact: true });
  await input.fill(String(value));
  await input.press('Tab');
  await page.evaluate(
    () => new Promise((resolve) => requestAnimationFrame(resolve)),
  );
}
export async function noOverflow(page) {
  const sizes = await page.evaluate(() => ({
    viewport: innerWidth,
    document: document.documentElement.scrollWidth,
  }));
  assert.ok(sizes.document <= sizes.viewport, JSON.stringify(sizes));
}
