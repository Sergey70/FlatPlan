import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { galleryConcepts } from '../lib/gallery-data.ts';
import {
  GALLERY_REVISION,
  ORIGINAL_MODEL_REVISION,
} from '../lib/gallery-shots.ts';
import { createGalleryScene } from '../lib/room-proposal.ts';
import { gallerySceneKey } from './gallery-scene-key.mjs';
import { PLAN_REVISION, planLayouts } from '../lib/plan-project.ts';

const output = resolve(`public/gallery/${GALLERY_REVISION}`);
const url = process.env.FLATPLAN_RENDER_URL || 'http://127.0.0.1:4189/';
const selected = process.env.FLATPLAN_RENDER_CONCEPT;
let server, browser;
try {
  // Local-only Vite entry: shared renderer, no storage or published controls.
  if (!process.env.FLATPLAN_RENDER_URL)
    server = spawn(
      process.execPath,
      [
        'node_modules/vite/bin/vite.js',
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
    if (i > 100) throw new Error('Vite renderer did not start');
    await new Promise((r) => setTimeout(r, 200));
  }
  await mkdir(resolve(output, 'images'), { recursive: true });
  browser = await chromium.launch({
    headless: true,
    args: ['--enable-unsafe-swiftshader'],
  });
  const page = await browser.newPage({
    viewport: { width: 1800, height: 1200 },
    deviceScaleFactor: 1,
  });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('response', (r) => {
    if (!r.ok()) errors.push(`${r.status()} ${r.url()}`);
  });
  await page.goto(new URL('scripts/gallery-render.html', url).href);
  await page.waitForFunction(
    () => typeof window.renderGalleryShot === 'function',
  );
  const original = JSON.parse(
    await readFile(
      resolve(`public/gallery/${ORIGINAL_MODEL_REVISION}/manifest.json`),
      'utf8',
    ),
  );
  const entries = [];
  const sha = (value) => createHash('sha256').update(value).digest('hex');
  for (const concept of galleryConcepts.filter(
    (c) => !selected || c.id === selected,
  )) {
    for (const shot of concept.images) {
      const expected = createGalleryScene(concept.layout.id, shot.id);
      const id = `${concept.id}-${shot.id}`;
      if (shot.modelSrc.includes(`/${ORIGINAL_MODEL_REVISION}/`)) {
        const entry = original.entries.find((e) => e.id === id);
        assert.ok(entry, id);
        assert.equal(
          entry.sceneSha256,
          sha(gallerySceneKey(expected.objects)),
          id,
        );
        assert.deepEqual(entry.camera, shot.camera, id);
        assert.equal(entry.fov, shot.fov, id);
        assert.equal(entry.cutaway, shot.cutaway, id);
        assert.equal(
          entry.imageSha256,
          sha(await readFile(resolve('public', shot.modelSrc))),
          id,
        );
        entries.push(entry);
        continue;
      }
      const actual = await page.evaluate(
        ({ conceptId, shotId }) => window.renderGalleryShot(conceptId, shotId),
        { conceptId: concept.id, shotId: shot.id },
      );
      assert.equal(
        gallerySceneKey(actual.objects),
        gallerySceneKey(expected.objects),
        `Rendered scene differs from source: ${concept.id}/${shot.id}`,
      );
      // Wait for the oak texture and its scene rebuild before exporting.
      await page.waitForLoadState('networkidle');
      const dataUrl = await page.evaluate(() => window.exportGalleryShot());
      const buffer = Buffer.from(dataUrl.split(',')[1], 'base64');
      await writeFile(resolve(output, 'images', `${id}.png`), buffer);
      entries.push({
        id,
        concept: concept.id,
        shot: shot.id,
        layout: concept.layout.id,
        palette: concept.style.id,
        camera: shot.camera,
        fov: shot.fov,
        cutaway: shot.cutaway,
        ceilingHeight: shot.cutaway
          ? null
          : planLayouts.find((l) => l.id === concept.layout.id).height / 100,
        sceneSha256: sha(gallerySceneKey(expected.objects)),
        imageSha256: sha(buffer),
        width: buffer.readUInt32BE(16),
        height: buffer.readUInt32BE(20),
      });
      console.log(
        `Rendered ${id} (${entries.at(-1).width}×${entries.at(-1).height})`,
      );
    }
  }
  if (!entries.length) throw new Error('No matching gallery concepts');
  if (errors.length) throw new Error(errors.join('\n'));
  // Single-concept visual probes must never replace the complete manifest.
  if (!selected)
    await writeFile(
      resolve(output, 'manifest.json'),
      JSON.stringify(
        {
          revision: GALLERY_REVISION,
          sourceRevision: PLAN_REVISION,
          sceneDecimalPlaces: 7,
          renderer:
            'FlatPlan Three.js; interior views with source-derived ceilings and cutaway overviews; no labels or grid',
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
