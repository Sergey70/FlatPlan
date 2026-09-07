import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  createInitialProject,
  PARTITION_WALL_IDS,
} from '../lib/editor-seed.ts';
import { planDrawing } from '../lib/editor-geometry.ts';
import {
  createGalleryPlan,
  renderGalleryPlan,
  exportGalleryPlans,
  GALLERY_PLAN_LAYOUTS,
  GALLERY_PLAN_COLORS,
} from '../scripts/export-gallery-plans.mjs';

const dividerId = 'wall-proposed-kitchen-room';

test('gallery plans preserve all five exact window footprints and original structure', () => {
  const seed = createInitialProject();
  const originalParts = planDrawing(seed.scene.objects, seed.scene.view);
  const originalWindows = originalParts.filter(
    (part) => part.kind === 'opening',
  );
  assert.equal(originalWindows.length, 5);
  for (const layout of GALLERY_PLAN_LAYOUTS) {
    const plan = createGalleryPlan(layout);
    const windows = plan.parts.filter((part) => part.feature === 'window');
    assert.deepEqual(
      windows.map(({ id, points }) => ({ id, points })),
      originalWindows.map(({ id, points }) => ({ id, points })),
    );
    const originalNodes = seed.scene.objects.filter(
      (node) => !(PARTITION_WALL_IDS as readonly string[]).includes(node.id),
    );
    assert.deepEqual(
      plan.objects.filter(
        (node) => !(PARTITION_WALL_IDS as readonly string[]).includes(node.id),
      ),
      originalNodes,
      `${layout} preserves floors, walls, furniture and column`,
    );
    const svg = renderGalleryPlan(layout);
    assert.equal((svg.match(/data-feature="window"/g) ?? []).length, 5);
    assert.equal(
      (svg.match(new RegExp(`fill="${GALLERY_PLAN_COLORS.window}"`, 'g')) ?? [])
        .length,
      5,
    );
    for (const id of [
      'floor-bedroom',
      'floor-balcony',
      'floor-bathroom',
      'solid-column',
    ])
      assert.ok(svg.includes(`data-node-id="${id}"`));
    const kitchen = plan.objects.find((node) => node.name === 'Кухня')!;
    assert.deepEqual(kitchen.position, [4.03, 0, 7.14]);
    assert.ok(plan.parts.some((part) => part.rootId === kitchen.id));
  }
});

test('closed, glass and open plans differ only in the three proposed partitions', () => {
  const closed = createGalleryPlan('closed');
  const glass = createGalleryPlan('glass');
  const open = createGalleryPlan('open');
  assert.deepEqual(closed.objects, createInitialProject().scene.objects);
  assert.deepEqual(
    glass.objects,
    closed.objects,
    'glass is a schematic material substitution',
  );
  for (const id of PARTITION_WALL_IDS) {
    assert.ok(
      closed.parts.some(
        (part) => part.rootId === id && part.feature === 'proposed-wall',
      ),
    );
    assert.ok(!open.parts.some((part) => part.rootId === id));
  }
  assert.deepEqual(
    closed.parts.filter((part) => part.rootId !== dividerId),
    glass.parts.filter((part) => part.rootId !== dividerId),
  );
  const glassParts = glass.parts.filter((part) => part.rootId === dividerId);
  assert.equal(glassParts.length, 1);
  assert.equal(glassParts[0].feature, 'glass-divider');
  assert.deepEqual(
    glassParts[0].points,
    closed.parts.find((part) => part.rootId === dividerId)!.points,
  );
  assert.deepEqual(
    open.parts,
    closed.parts.filter(
      (part) =>
        !(PARTITION_WALL_IDS as readonly string[]).includes(part.rootId),
    ),
  );
  const glassSvg = renderGalleryPlan('glass');
  assert.match(glassSvg, /data-feature="glass-divider"/);
  assert.match(glassSvg, /stroke-dasharray=/);
  assert.match(glassSvg, new RegExp(`stroke="${GALLERY_PLAN_COLORS.glass}"`));
  assert.doesNotMatch(
    renderGalleryPlan('open'),
    /data-feature="(?:glass-divider|proposed-wall|door)"/,
  );
  assert.throws(() => createGalleryPlan('unknown'), /Unknown gallery layout/);
});

test('checked-in gallery SVGs match deterministic standalone exports', () => {
  const directory = mkdtempSync(join(tmpdir(), 'flatplan-gallery-'));
  try {
    const paths = exportGalleryPlans(directory);
    assert.equal(paths.length, 3);
    for (const layout of GALLERY_PLAN_LAYOUTS) {
      const svg = renderGalleryPlan(layout);
      assert.equal(svg, renderGalleryPlan(layout));
      assert.equal(readFileSync(join(directory, `${layout}.svg`), 'utf8'), svg);
      assert.equal(
        readFileSync(
          new URL(`../public/gallery/plans/${layout}.svg`, import.meta.url),
          'utf8',
        ),
        svg,
      );
      assert.match(svg, /^<svg[^>]+viewBox="-0.5 -0.5 8.3 10.1"/);
      assert.match(svg, /aria-labelledby="plan-title plan-desc"/);
      assert.doesNotMatch(svg, /NaN|undefined/);
    }
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
