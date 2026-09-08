import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  createPlanScene,
  planLayouts,
  PLAN_REVISION,
} from '../lib/plan-project.ts';
import { planDrawing } from '../lib/editor-geometry.ts';
import {
  createGalleryPlan,
  renderGalleryPlan,
  GALLERY_PLAN_LAYOUTS,
} from '../scripts/export-gallery-plans.mjs';

test('gallery preserves every source layout, wall profile, object and window footprint', () => {
  assert.equal(GALLERY_PLAN_LAYOUTS.length, 4);
  assert.ok(!GALLERY_PLAN_LAYOUTS.includes('plan-1'));
  for (const id of GALLERY_PLAN_LAYOUTS) {
    const layout = planLayouts.find((l) => l.id === id)!;
    const expected = createPlanScene(layout),
      actual = createGalleryPlan(id);
    assert.deepEqual(actual.objects, expected.objects);
    const windows = planDrawing(expected.objects, expected.view).filter(
      (p) => p.kind === 'opening',
    );
    assert.equal(windows.length, id.startsWith('plan') ? 4 : 0);
    assert.deepEqual(
      actual.parts
        .filter((p) => p.feature === 'window')
        .map(({ id, points }) => ({ id, points })),
      windows.map(({ id, points }) => ({ id, points })),
    );
    assert.equal(
      (renderGalleryPlan(id).match(/data-feature="window"/g) ?? []).length,
      windows.length,
    );
  }
});
test('apartment and bathroom schemes remain independent and exported SVGs are deterministic', () => {
  for (const id of GALLERY_PLAN_LAYOUTS) {
    const svg = renderGalleryPlan(id);
    assert.equal(svg, renderGalleryPlan(id));
    assert.equal(
      readFileSync(
        new URL(
          `../public/gallery/${PLAN_REVISION}/plans/${id}.svg`,
          import.meta.url,
        ),
        'utf8',
      ),
      svg,
    );
    assert.match(svg, /aria-labelledby="title desc"/);
    assert.doesNotMatch(svg, /NaN|undefined/);
  }
  assert.throws(() => createGalleryPlan('unknown'), /Unknown layout/);
  assert.throws(() => createGalleryPlan('plan-1'), /Unknown layout/);
  assert.match(renderGalleryPlan('plan-2'), /Кухня · 21,43 м²/);
  assert.match(renderGalleryPlan('plan-2'), /Спальня · 13,55 м²/);
  const a = createGalleryPlan('bath-1'),
    b = createGalleryPlan('plan-2');
  assert.equal(a.objects.filter((n) => n.geometry.kind === 'wall').length, 10);
  assert.equal(b.objects.filter((n) => n.geometry.kind === 'wall').length, 37);
  assert.notDeepEqual(a.objects, b.objects);
});
