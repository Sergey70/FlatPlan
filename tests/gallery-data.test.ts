import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { gallerySceneKey } from '../scripts/gallery-scene-key.mjs';
import { galleryShots, GALLERY_REVISION } from '../lib/gallery-shots.ts';
import { planLayouts } from '../lib/plan-data.ts';
import { polygonContains } from '../lib/apartment.ts';
import { sceneBounds } from '../lib/editor-geometry.ts';
import { Vector3 } from 'three';
import {
  createPlanProject,
  PLAN_REVISION,
  planArrangementId,
} from '../lib/plan-project.ts';
import {
  galleryConcepts,
  galleryLayouts,
  galleryStyles,
  galleryImageCount,
  galleryFinishedImageCount,
  GALLERY_FINISH_REVISION,
} from '../lib/gallery-data.ts';

test('gallery offers all 12 layout/style pairs, 42 full-size views and matching plans', () => {
  assert.equal(galleryConcepts.length, 12);
  assert.equal(galleryImageCount, 42);
  assert.equal(galleryFinishedImageCount, 30);
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
      assert.equal(concept.images.length, layout.id === 'plan-2' ? 5 : 3);
      assert.equal(concept.image, concept.images[0].src);
      assert.equal(
        new Set(concept.images.map((shot) => shot.id)).size,
        concept.images.length,
      );
      assert.equal(concept.images.filter((shot) => shot.cutaway).length, 1);
      for (const shot of concept.images) {
        const image = readFileSync(
          new URL(`../public/${shot.src}`, import.meta.url),
        );
        assert.equal(
          image.subarray(0, 8).toString('hex'),
          '89504e470d0a1a0a',
          concept.id,
        );
        assert.ok(
          shot.kind === 'generated'
            ? image.readUInt32BE(16) >= 1024 && image.readUInt32BE(20) >= 768
            : image.readUInt32BE(16) === 1800 &&
                image.readUInt32BE(20) === 1200,
          concept.id,
        );
        assert.equal(shot.kind === 'model', shot.cutaway);
        assert.equal(shot.src === shot.modelSrc, shot.cutaway);
      }
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
      new URL(
        `../public/gallery/${GALLERY_REVISION}/manifest.json`,
        import.meta.url,
      ),
      'utf8',
    ),
  );
  const seed = createPlanProject();
  const sha = (value: string | Buffer) =>
    createHash('sha256').update(value).digest('hex');
  assert.equal(manifest.revision, GALLERY_REVISION);
  assert.equal(manifest.sourceRevision, PLAN_REVISION);
  assert.equal(manifest.sceneDecimalPlaces, 7);
  assert.deepEqual(
    manifest.entries.map((e: { id: string }) => e.id),
    galleryConcepts.flatMap((c) => c.images.map((s) => `${c.id}-${s.id}`)),
  );
  assert.equal(
    new Set(
      manifest.entries.map(
        (entry: { imageSha256: string }) => entry.imageSha256,
      ),
    ).size,
    galleryImageCount,
    'Every view and finish has its own image',
  );
  for (const entry of manifest.entries) {
    const concept = galleryConcepts.find((c) => c.id === entry.concept)!;
    const shot = concept.images.find((s) => s.id === entry.shot)!;
    assert.equal(entry.layout, concept.layout.id);
    assert.equal(entry.palette, concept.style.id);
    assert.deepEqual(entry.camera, shot.camera);
    assert.equal(entry.fov, shot.fov);
    assert.equal(entry.cutaway, shot.cutaway);
    assert.equal(
      entry.ceilingHeight,
      shot.cutaway
        ? null
        : planLayouts.find((l) => l.id === entry.layout)!.height / 100,
    );
    const scene = seed.arrangements.find(
      (a) => a.id === planArrangementId(entry.layout),
    )!.scene;
    assert.equal(
      entry.sceneSha256,
      sha(gallerySceneKey(scene.objects)),
      entry.id,
    );
    const image = readFileSync(
      new URL(`../public/${shot.modelSrc}`, import.meta.url),
    );
    assert.equal(entry.imageSha256, sha(image), entry.id);
  }
});

test('30 finished interiors retain reviewed prompts, reference hashes and current model provenance', () => {
  const read = (src: string) =>
    readFileSync(new URL(`../public/${src}`, import.meta.url));
  const sha = (value: string | Buffer) =>
    createHash('sha256').update(value).digest('hex');
  const manifest = JSON.parse(
    read(`gallery/${GALLERY_FINISH_REVISION}/manifest.json`).toString(),
  );
  const prompts = JSON.parse(
    read(`gallery/${GALLERY_FINISH_REVISION}/prompts.json`).toString(),
  );
  const model = JSON.parse(
    read(`gallery/${GALLERY_REVISION}/manifest.json`).toString(),
  );
  const expected = galleryConcepts.flatMap((c) =>
    c.images
      .filter((s) => s.kind === 'generated')
      .map((s) => ({ id: `${c.id}-${s.id}`, concept: c, shot: s })),
  );
  assert.equal(manifest.revision, GALLERY_FINISH_REVISION);
  assert.equal(manifest.sourceRevision, PLAN_REVISION);
  assert.equal(manifest.generator, 'built-in image_gen');
  assert.deepEqual(
    manifest.entries.map((e: { id: string }) => e.id),
    expected.map((e) => e.id),
  );
  assert.deepEqual(
    prompts.entries.map((e: { id: string }) => e.id).sort(),
    expected.map((e) => e.id).sort(),
  );
  assert.equal(
    new Set(
      manifest.entries.map(
        (e: { image: { sha256: string } }) => e.image.sha256,
      ),
    ).size,
    30,
  );
  for (const item of expected) {
    const entry = manifest.entries.find(
      (e: { id: string }) => e.id === item.id,
    );
    const prompt = prompts.entries.find(
      (e: { id: string }) => e.id === item.id,
    );
    const source = model.entries.find((e: { id: string }) => e.id === item.id);
    assert.equal(entry.concept, item.concept.id);
    assert.equal(entry.layout, item.concept.layout.id);
    assert.equal(entry.palette, item.concept.style.id);
    assert.equal(entry.shot, item.shot.id);
    assert.equal(entry.image.src, item.shot.src);
    assert.equal(entry.model.src, item.shot.modelSrc);
    assert.equal(entry.model.sha256, source.imageSha256);
    assert.equal(entry.sceneSha256, source.sceneSha256);
    assert.notEqual(entry.image.sha256, entry.model.sha256);
    assert.equal(entry.promptSha256, sha(prompt.prompt));
    assert.equal(entry.promptRecordSha256, sha(JSON.stringify(prompt)));
    assert.equal(prompt.output, item.shot.src);
    assert.ok(prompt.prompt.length > 100 && entry.review.length > 20);
    assert.equal(entry.review, prompt.review);
    assert.deepEqual(
      entry.references.map((r: { src: string }) => r.src),
      prompt.references,
    );
    assert.ok(entry.references.length > 0);
    for (const asset of [entry.image, entry.model, ...entry.references]) {
      assert.match(
        asset.src,
        /^\.\/gallery\/gallery-01[23]\/images\/[a-z0-9-]+\.png$/,
      );
      const bytes = read(asset.src);
      assert.equal(sha(bytes), asset.sha256, `${item.id}: ${asset.src}`);
      assert.equal(bytes.readUInt32BE(16), asset.width);
      assert.equal(bytes.readUInt32BE(20), asset.height);
    }
  }
});

test('interior cameras are inside their named source rooms, above the floor and outside furniture', () => {
  const seed = createPlanProject();
  for (const layout of planLayouts) {
    const scene = seed.arrangements.find(
      (a) => a.id === planArrangementId(layout.id),
    )!.scene;
    for (const shot of galleryShots(layout.id).filter((s) => !s.cutaway)) {
      const room = layout.rooms.find((r) => r.name === shot.room)!;
      assert.ok(room, shot.label);
      const [x, y, z] = shot.camera.position;
      assert.ok(
        polygonContains(room.polygon, [x * 100, z * 100]),
        `${layout.id}/${shot.id} is in its room`,
      );
      assert.ok(y >= 1.4 && y <= 1.7 && y < layout.height / 100, shot.label);
      assert.ok(shot.fov >= 40 && shot.fov <= 80, shot.label);
      for (const furniture of scene.objects.filter(
        (n) => n.category === 'furniture',
      )) {
        assert.ok(
          !sceneBounds([furniture], true).containsPoint(new Vector3(x, y, z)),
          `${layout.id}/${shot.id} camera intersects ${furniture.name}`,
        );
      }
    }
  }
});
