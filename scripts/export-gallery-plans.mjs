import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createPlanScene, planLayouts } from '../lib/plan-project.ts';
import { planDrawing } from '../lib/editor-geometry.ts';
import { findNode } from '../lib/editor-model.ts';

export const GALLERY_PLAN_LAYOUTS = [
  'plan-2',
  'plan-1',
  'bath-1',
  'bath-2',
  'bath-3',
];
export function createGalleryPlan(id) {
  const layout = planLayouts.find((l) => l.id === id);
  if (!layout || !GALLERY_PLAN_LAYOUTS.includes(id))
    throw new Error(`Unknown layout: ${id}`);
  const scene = createPlanScene(layout);
  const parts = planDrawing(scene.objects, scene.view).map((part) => ({
    ...part,
    feature:
      findNode(scene.objects, part.id)?.geometry.openingType === 'window'
        ? 'window'
        : part.kind === 'wall'
          ? 'wall'
          : part.kind === 'floor'
            ? 'floor'
            : part.category === 'furniture'
              ? 'furniture'
              : 'detail',
  }));
  return { layout, objects: scene.objects, parts };
}
const number = (n) => String(Number(n.toFixed(7)));
const escape = (s) =>
  String(s).replace(
    /[&<>"']/g,
    (c) =>
      ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&apos;',
      })[c],
  );
const path = (p) => `M${p.map((x) => x.map(number).join(',')).join('L')}Z`;
export function renderGalleryPlan(id) {
  const { layout, parts } = createGalleryPlan(id);
  const width = layout.width / 100,
    depth = layout.depth / 100,
    size = Math.max(width, depth) + 0.65;
  const x = (width - size) / 2,
    z = (depth - size) / 2;
  const output = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="1000" viewBox="${x} ${z} ${size} ${size}" role="img" aria-labelledby="title desc">`,
    `<title id="title">${escape(layout.name)}</title><desc id="desc">Контуры стен, проёмы и предметы из файла .plan. Синим показаны оконные и французские проёмы. Мебель показана условно, с габаритами из файла.</desc>`,
    `<rect x="${x}" y="${z}" width="${size}" height="${size}" fill="#faf8f4"/>`,
  ];
  for (const p of parts) {
    const color =
      p.feature === 'window'
        ? '#248fbd'
        : p.feature === 'wall'
          ? '#424e58'
          : p.feature === 'floor'
            ? '#e9e7df'
            : p.feature === 'furniture'
              ? '#dfd4c3'
              : p.color;
    output.push(
      `<path data-object="${p.id}" data-feature="${p.feature}" d="${[path(p.points), ...p.holes.map(path)].join(' ')}" fill="${color}" fill-rule="evenodd" stroke="#899393" stroke-width="${size * 0.0009}"/>`,
    );
  }
  for (const room of layout.rooms.filter((r) => !r.micro))
    output.push(
      `<text x="${room.center[0] / 100}" y="${room.center[1] / 100}" text-anchor="middle" font-family="Arial,sans-serif" font-size="${size * 0.021}" fill="#34434d" stroke="white" stroke-width="${size * 0.004}" paint-order="stroke">${escape(room.name)} · ${String(room.area).replace('.', ',')} м²</text>`,
    );
  output.push('</svg>');
  return output.join('\n') + '\n';
}
if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const target = resolve('public/gallery/plan-008/plans');
  mkdirSync(target, { recursive: true });
  for (const id of GALLERY_PLAN_LAYOUTS)
    writeFileSync(resolve(target, `${id}.svg`), renderGalleryPlan(id));
  console.log('Exported five exact .plan diagrams.');
}
