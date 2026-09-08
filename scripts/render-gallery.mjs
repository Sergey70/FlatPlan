import { chromium } from 'playwright';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { galleryConcepts } from '../lib/gallery-data.ts';
import { gallerySceneKey } from './gallery-scene-key.mjs';
import {
  createPlanProject,
  PLAN_REVISION,
  planLayouts,
  planArrangementId,
} from '../lib/plan-project.ts';

const output = resolve(`public/gallery/${PLAN_REVISION}`);
const url = process.env.FLATPLAN_RENDER_URL || 'http://127.0.0.1:4189/';
let server, browser;
try {
  if (!process.env.FLATPLAN_RENDER_URL)
    server = spawn(
      process.execPath,
      [
        'node_modules/vite/bin/vite.js',
        'preview',
        '--host',
        '127.0.0.1',
        '--port',
        '4189',
        '--strictPort',
      ],
      { stdio: 'ignore' },
    );
  for (let i = 0; ; i++) {
    try {
      if ((await fetch(url)).ok) break;
    } catch {}
    if (i > 100) throw new Error('Preview did not start');
    await new Promise((r) => setTimeout(r, 200));
  }
  await mkdir(resolve(output, 'images'), { recursive: true });
  browser = await chromium.launch({
    headless: true,
    args: ['--enable-unsafe-swiftshader'],
  });
  const page = await browser.newPage({
    viewport: { width: 1800, height: 1300 },
    deviceScaleFactor: 1,
  });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.addInitScript(() => {
    window.__tools = {};
    Object.defineProperty(document, 'modelContext', {
      value: {
        registerTool(t) {
          window.__tools[t.name] = t;
        },
      },
    });
  });
  await page.goto(url);
  await page.waitForFunction(
    () => window.__tools.get_editor_project?.execute({}).status.ready,
    undefined,
    { timeout: 30000 },
  );
  const canonical = createPlanProject();
  const entries = [];
  const sha = (value) => createHash('sha256').update(value).digest('hex');
  for (const concept of galleryConcepts) {
    const sourceLayout = planLayouts.find((l) => l.id === concept.layout.id);
    const layout = {
      width: sourceLayout.width / 100,
      depth: sourceLayout.depth / 100,
    };
    const size = Math.max(layout.width, layout.depth),
      x = layout.width / 2,
      z = layout.depth / 2;
    const camera = {
      position: [x - size * 0.72, Math.max(size * 1.25, 4), z + size * 1.05],
      target: [x, 0.35, z],
    };
    await page.evaluate(
      ({ id, palette, camera }) => {
        window.__tools.manage_editor_arrangement.execute({
          action: 'open',
          id,
        });
        window.__tools.configure_editor_view.execute({
          mode: '3d',
          palette,
          cutaway: true,
          furniture: true,
          labels: false,
          grid: false,
          night: false,
          selected: null,
          camera,
        });
      },
      {
        id: planArrangementId(concept.layout.id),
        palette: concept.style.id,
        camera,
      },
    );
    await page.evaluate(
      () =>
        new Promise((r) =>
          requestAnimationFrame(() => requestAnimationFrame(r)),
        ),
    );
    const actual = await page.evaluate(() =>
      JSON.parse(window.__tools.export_editor_project.execute({}).json),
    );
    const expected = canonical.arrangements.find(
      (a) => a.id === actual.activeArrangement,
    );
    function difference(a, b, path = 'objects') {
      if (typeof a === 'number' && typeof b === 'number')
        return Math.abs(a - b) > 1e-8 ? `${path}: ${a} != ${b}` : null;
      if (a && b && typeof a === 'object' && typeof b === 'object') {
        if (Object.keys(a).length !== Object.keys(b).length)
          return `${path}: different keys`;
        for (const key of Object.keys(a)) {
          const result = difference(a[key], b[key], `${path}.${key}`);
          if (result) return result;
        }
        return null;
      }
      return a === b ? null : `${path}: ${a} != ${b}`;
    }
    const mismatch = difference(actual.scene.objects, expected.scene.objects);
    if (mismatch)
      throw new Error(`Rendered scene differs from source: ${mismatch}`);
    await page
      .locator('.ed-tabs')
      .getByRole('button', { name: 'Файл', exact: true })
      .click();
    const downloading = page.waitForEvent('download');
    await page
      .getByRole('button', {
        name: 'Сохранить текущий 3D-вид PNG',
        exact: true,
      })
      .click();
    const target = resolve(output, 'images', `${concept.id}.png`);
    await (await downloading).saveAs(target);
    const buffer = await readFile(target);
    entries.push({
      id: concept.id,
      layout: concept.layout.id,
      palette: concept.style.id,
      sceneSha256: sha(gallerySceneKey(expected.scene.objects)),
      imageSha256: sha(buffer),
      width: buffer.readUInt32BE(16),
      height: buffer.readUInt32BE(20),
    });
    console.log(
      `Rendered ${concept.id} (${entries.at(-1).width}×${entries.at(-1).height})`,
    );
  }
  if (errors.length) throw new Error(errors.join('\n'));
  await writeFile(
    resolve(output, 'manifest.json'),
    JSON.stringify(
      {
        revision: PLAN_REVISION,
        sceneDecimalPlaces: 7,
        renderer: 'FlatPlan Three.js; cutaway walls; no labels or grid',
        entries,
      },
      null,
      2,
    ) + '\n',
  );
} finally {
  await browser?.close();
  server?.kill();
}
