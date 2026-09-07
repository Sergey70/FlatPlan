import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  galleryConcepts,
  galleryLayouts,
  galleryStyles,
} from '../lib/gallery-data.ts';

test('gallery offers every layout/style pair with a decodable PNG and its matching standalone plan', () => {
  assert.equal(galleryConcepts.length, 12);
  assert.equal(new Set(galleryConcepts.map((concept) => concept.id)).size, 12);
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
      assert.match(svg, new RegExp(`data-layout="${layout.id}"`));
      assert.equal((svg.match(/data-feature="window"/g) ?? []).length, 5);
    }
  }
});
