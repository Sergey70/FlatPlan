import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { gallerySceneKey } from '../scripts/gallery-scene-key.mjs';
import { createPlanProject, PLAN_REVISION } from '../lib/plan-project.ts';
import {
  galleryConcepts,
  galleryLayouts,
  galleryStyles,
} from '../lib/gallery-data.ts';

test('gallery offers every layout/style pair with a decodable PNG and its matching standalone plan', () => {
  assert.equal(galleryConcepts.length, 15);
  assert.equal(new Set(galleryConcepts.map((concept) => concept.id)).size, 15);
  for (const layout of galleryLayouts) {
    const concepts = galleryConcepts.filter(
      (concept) => concept.layout.id === layout.id,
    );
    assert.deepEqual(
      concepts.map((concept) => concept.style.id),
      galleryStyles.map((style) => style.id),
    );
    for (const concept of concepts) {
      const image = readFileSync(
        new URL(`../public/${concept.image}`, import.meta.url),
      );
      assert.equal(
        image.subarray(0, 8).toString('hex'),
        '89504e470d0a1a0a',
        concept.id,
      );
      assert.ok(
        image.readUInt32BE(16) >= 1000 && image.readUInt32BE(20) >= 1000,
        concept.id,
      );
      const svg = readFileSync(
        new URL(`../public/${concept.plan}`, import.meta.url),
        'utf8',
      );
      assert.match(svg, new RegExp(`<title id="title">${layout.name}</title>`));
      assert.equal(
        (svg.match(/data-feature="window"/g) ?? []).length,
        layout.id.startsWith('plan') ? 4 : 0,
      );
    }
  }
});

test('gallery images and their source scenes match the render manifest', () => {
  const manifest = JSON.parse(
    readFileSync(
      new URL('../public/gallery/plan-008/manifest.json', import.meta.url),
      'utf8',
    ),
  );
  const seed = createPlanProject();
  const sha = (value: string | Buffer) =>
    createHash('sha256').update(value).digest('hex');
  assert.equal(manifest.revision, PLAN_REVISION);
  assert.equal(manifest.sceneDecimalPlaces, 7);
  assert.deepEqual(
    manifest.entries.map((e: { id: string }) => e.id),
    galleryConcepts.map((c) => c.id),
  );
  for (const entry of manifest.entries) {
    const scene = seed.arrangements.find(
      (a) => a.id === `${PLAN_REVISION}-${entry.layout}`,
    )!.scene;
    assert.equal(
      entry.sceneSha256,
      sha(gallerySceneKey(scene.objects)),
      entry.id,
    );
    const image = readFileSync(
      new URL(
        `../public/gallery/plan-008/images/${entry.id}.png`,
        import.meta.url,
      ),
    );
    assert.equal(entry.imageSha256, sha(image), entry.id);
  }
});
