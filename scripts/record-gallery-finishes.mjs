// Record provenance for reviewed built-in imagegen outputs; never generates images.
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import {
  galleryConcepts,
  GALLERY_FINISH_REVISION,
} from '../lib/gallery-data.ts';
import { GALLERY_REVISION } from '../lib/gallery-shots.ts';
import { PLAN_REVISION } from '../lib/plan-data.ts';

const base = resolve('public');
const directory = resolve(base, 'gallery', GALLERY_FINISH_REVISION);
const prompts = JSON.parse(
  await readFile(resolve(directory, 'prompts.json'), 'utf8'),
);
const model = JSON.parse(
  await readFile(
    resolve(base, 'gallery', GALLERY_REVISION, 'manifest.json'),
    'utf8',
  ),
);
const expected = galleryConcepts.flatMap((concept) =>
  concept.images
    .filter((shot) => shot.kind === 'generated')
    .map((shot) => ({ id: `${concept.id}-${shot.id}`, concept, shot })),
);
assert.deepEqual(
  prompts.entries.map((p) => p.id).sort(),
  expected.map((p) => p.id).sort(),
);
const sha = (value) => createHash('sha256').update(value).digest('hex');
async function asset(src) {
  assert.match(src, /^\.\/gallery\/gallery-01[23]\/images\/[a-z0-9-]+\.png$/);
  const bytes = await readFile(resolve(base, src));
  assert.equal(bytes.subarray(0, 8).toString('hex'), '89504e470d0a1a0a', src);
  return {
    src,
    sha256: sha(bytes),
    width: bytes.readUInt32BE(16),
    height: bytes.readUInt32BE(20),
  };
}
const entries = [];
for (const { id, concept, shot } of expected) {
  const prompt = prompts.entries.find((p) => p.id === id);
  assert.equal(prompt.output, shot.src, `${id}: prompt/output mismatch`);
  assert.ok(
    prompt.prompt.length > 100 && prompt.review.length > 20,
    `${id}: missing prompt or visual review`,
  );
  assert.ok(prompt.references.length > 0);
  const image = await asset(shot.src),
    reference = await asset(shot.modelSrc);
  const source = model.entries.find((entry) => entry.id === id);
  assert.equal(
    reference.sha256,
    source.imageSha256,
    `${id}: changed 3D reference`,
  );
  assert.notEqual(
    image.sha256,
    reference.sha256,
    `${id}: blockout is not a finished image`,
  );
  entries.push({
    id,
    concept: concept.id,
    shot: shot.id,
    layout: concept.layout.id,
    palette: concept.style.id,
    image,
    model: reference,
    sceneSha256: source.sceneSha256,
    promptSha256: sha(prompt.prompt),
    promptRecordSha256: sha(JSON.stringify(prompt)),
    references: await Promise.all(prompt.references.map(asset)),
    review: prompt.review,
  });
}
await writeFile(
  resolve(directory, 'manifest.json'),
  JSON.stringify(
    {
      revision: GALLERY_FINISH_REVISION,
      sourceRevision: PLAN_REVISION,
      generator: 'built-in image_gen',
      entries,
    },
    null,
    2,
  ) + '\n',
);
console.log(
  `Recorded ${entries.length} reviewed finished interiors and their prompts/reference hashes`,
);
