import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  createInitialProject,
  PARTITION_WALL_IDS,
} from '../lib/editor-seed.ts';
import { planDrawing } from '../lib/editor-geometry.ts';
import { findNode } from '../lib/editor-model.ts';

export const GALLERY_PLAN_LAYOUTS = ['closed', 'glass', 'open'];
export const GALLERY_PLAN_VIEWBOX = [-0.5, -0.5, 8.3, 10.1];
export const GALLERY_PLAN_COLORS = {
  background: '#faf8f4',
  floor: '#eee9e1',
  wetFloor: '#e6e8e4',
  wall: '#3f4442',
  proposed: '#b8755a',
  window: '#62a7ca',
  glass: '#278b99',
  furniture: '#f8f6f0',
  furnitureLine: '#a5a69c',
  label: '#3f4442',
};
const dividerId = 'wall-proposed-kitchen-room';
const furnitureNames = new Set([
  'Кухня',
  'Обеденная группа',
  'Кровать',
  'Диван',
  'Санузел — оборудование',
]);
const titles = {
  closed: 'Отдельная кухня',
  glass: 'Кухня со стеклянной перегородкой',
  open: 'Открытая кухня-гостиная',
};

/** Preserve the seed geometry; vary only the three proposed walls. */
export function createGalleryPlan(layout) {
  if (!GALLERY_PLAN_LAYOUTS.includes(layout))
    throw new Error(`Unknown gallery layout: ${layout}`);
  const project = createInitialProject();
  const objects = project.scene.objects.filter(
    (node) => layout !== 'open' || !PARTITION_WALL_IDS.includes(node.id),
  );
  const furnitureIds = new Set(
    objects
      .filter((node) => furnitureNames.has(node.name))
      .map((node) => node.id),
  );
  const parts = planDrawing(objects, project.scene.view)
    .filter(
      (part) => part.category === 'structure' || furnitureIds.has(part.rootId),
    )
    .map((part) => {
      const node = findNode(objects, part.id);
      const feature =
        part.kind === 'floor'
          ? 'floor'
          : node?.geometry.openingType === 'window'
            ? 'window'
            : part.category === 'furniture'
              ? 'furniture'
              : layout === 'glass' && part.rootId === dividerId
                ? 'glass-divider'
                : PARTITION_WALL_IDS.includes(part.rootId)
                  ? part.kind === 'wall'
                    ? 'proposed-wall'
                    : 'door'
                  : part.kind === 'wall' || part.kind === 'solid'
                    ? 'original-wall'
                    : 'frame';
      return { ...part, feature };
    });
  return { layout, objects, parts };
}

const number = (value) => String(Number(value.toFixed(5)));
const escape = (value) =>
  String(value).replace(
    /[&<>"']/g,
    (char) =>
      ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&apos;',
      })[char],
  );
const path = (points) =>
  `M${points.map((point) => point.map(number).join(',')).join('L')}Z`;

function partSvg(part) {
  const colors = GALLERY_PLAN_COLORS;
  let fill = colors.wall;
  let extra = '';
  if (part.feature === 'floor') {
    fill = ['floor-bathroom', 'floor-balcony'].includes(part.id)
      ? colors.wetFloor
      : colors.floor;
  } else if (part.feature === 'window') {
    fill = colors.window;
    extra = ' stroke="#397f9f" stroke-width="0.012"';
  } else if (part.feature === 'furniture') {
    fill = colors.furniture;
    extra = ` stroke="${colors.furnitureLine}" stroke-width="0.012" stroke-linejoin="round"`;
  } else if (part.feature === 'proposed-wall') {
    fill = colors.proposed;
  } else if (part.feature === 'door') {
    fill = colors.floor;
  } else if (part.feature === 'frame') {
    fill = '#b4b8b0';
  }
  if (part.id === 'solid-service') fill = 'url(#service-hatch)';
  const data = `data-node-id="${escape(part.id)}" data-root-id="${escape(part.rootId)}" data-feature="${part.feature}"`;
  if (part.feature === 'glass-divider') {
    const xs = part.points.map(([x]) => x),
      zs = part.points.map(([, z]) => z);
    const left = Math.min(...xs),
      right = Math.max(...xs);
    const z = (Math.min(...zs) + Math.max(...zs)) / 2;
    const center = (left + right) / 2;
    return `<g ${data} fill="none" stroke="${colors.glass}" stroke-width="0.026">
      <path d="${path(part.points)}" fill="#d9eeee" stroke-dasharray="0.11 0.055"/>
      <path d="M${number(left)},${number(z)}H${number(right)}" stroke-width="0.012"/>
      <path d="M${number(center - 0.4)},${number(z)}h0.8m-0.13,-0.1l0.13,0.1l-0.13,0.1m-0.54,-0.2l-0.13,0.1l0.13,0.1"/>
    </g>`;
  }
  return `<path ${data} d="${[part.points, ...part.holes].map(path).join('')}" fill="${fill}" fill-rule="evenodd"${extra}/>`;
}

/** A standalone SVG with exact model footprints and compact schematic furniture. */
export function renderGalleryPlan(layout) {
  const { parts } = createGalleryPlan(layout);
  const layers = [
    'floor',
    'furniture',
    'original-wall',
    'frame',
    'door',
    'proposed-wall',
    'glass-divider',
    'window',
  ];
  const geometry = layers.flatMap((feature) =>
    parts.filter((part) => part.feature === feature).map(partSvg),
  );
  const colors = GALLERY_PLAN_COLORS;
  const living = layout === 'closed' ? 'Комната 2' : 'Гостиная';
  const subtitle =
    layout === 'open' ? 'единое пространство' : 'верхнее левое окно';
  const dividerLegend =
    layout === 'glass'
      ? `<path d="M4.66,9.47h0.42" stroke="${colors.glass}" stroke-width="0.035" stroke-dasharray="0.1 0.05"/><text x="5.2" y="9.52">Стекло</text>`
      : '';
  const proposedLegend =
    layout === 'open'
      ? ''
      : `<path d="M2.6,9.47h0.42" stroke="${colors.proposed}" stroke-width="0.08"/><text x="3.14" y="9.52">Новая стена</text>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="830" height="1010" viewBox="${GALLERY_PLAN_VIEWBOX.join(' ')}" role="img" aria-labelledby="plan-title plan-desc" data-layout="${layout}">
  <title id="plan-title">${titles[layout]} — схема квартиры</title>
  <desc id="plan-desc">Геометрия исходной модели. Лоджия слева сверху, спальня сверху, санузел справа снизу. Все пять окон сохранены. Кухня расположена вдоль стены санузла. ${layout === 'closed' ? 'Показаны три новые перегородки.' : layout === 'glass' ? 'Между кухней и гостиной показана стеклянная раздвижная перегородка; две остальные перегородки сохранены.' : 'Удалены только три предлагаемые перегородки; исходные стены и колонна сохранены.'} Мебель показана схематично. Размеры исходной модели предварительные; схема не является строительным чертежом.</desc>
  <defs><pattern id="service-hatch" width="0.12" height="0.12" patternUnits="userSpaceOnUse"><rect width="0.12" height="0.12" fill="#dedfd9"/><path d="M0,0.12L0.12,0" stroke="#a0a69e" stroke-width="0.015"/></pattern></defs>
  <rect x="-0.5" y="-0.5" width="8.3" height="10.1" fill="${colors.background}"/>
  ${geometry.join('\n  ')}
  <g font-family="Arial, sans-serif" text-anchor="middle" fill="${colors.label}">
    <g font-size="0.23" font-weight="600">
      <text x="0.57" y="1.15" transform="rotate(-90 0.57 1.15)">Лоджия</text>
      <text x="5.85" y="1.1">Спальня</text>
      <text x="2.02" y="3.4">${living}</text>
      <text x="5.75" y="4.65">Холл</text>
      <text x="1.85" y="6.3">Кухня</text>
      <text x="5.67" y="8.03" font-size="0.19">Санузел</text>
    </g>
    <g font-size="0.145" fill="#777f78">
      <text x="5.85" y="1.37">исходная комната</text>
      <text x="2.02" y="3.65">${subtitle}</text>
      <text x="1.85" y="6.51">у стены санузла</text>
      <text x="5.75" y="5.75">Колонна</text>
      <path d="M5.14,5.8L4.55,5.87" fill="none" stroke="#888f87" stroke-width="0.015"/>
    </g>
  </g>
  <g font-family="Arial, sans-serif" font-size="0.15" fill="#626b63">
    <path d="M0.05,9.47h0.42" stroke="${colors.window}" stroke-width="0.08"/><text x="0.59" y="9.52">Окна · 5</text>
    ${proposedLegend}
    ${dividerLegend}
  </g>
</svg>\n`.replace(/[ \t]+$/gm, '');
}

export function exportGalleryPlans(
  outputDirectory = fileURLToPath(
    new URL('../public/gallery/plans/', import.meta.url),
  ),
) {
  mkdirSync(outputDirectory, { recursive: true });
  return GALLERY_PLAN_LAYOUTS.map((layout) => {
    const output = resolve(outputDirectory, `${layout}.svg`);
    writeFileSync(output, renderGalleryPlan(layout));
    return output;
  });
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  for (const output of exportGalleryPlans()) console.log(output);
}
