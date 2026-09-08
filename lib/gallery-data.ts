import { type PaletteId } from './apartment.ts';
import { planLayouts, PLAN_REVISION } from './plan-data.ts';
import {
  galleryShots,
  GALLERY_REVISION,
  ORIGINAL_MODEL_REVISION,
} from './gallery-shots.ts';
import {
  ROOM_PROPOSAL_NOTE,
  ROOM_PROPOSAL_REVISION,
  usesRoomProposal,
} from './room-proposal.ts';
export const GALLERY_FINISH_REVISION = 'gallery-014';
const descriptions: Record<string, string> = {
  'plan-2':
    'Кухня 21,43 м², спальня 13,55 м², комната 14,91 м² с кроватью и рабочим местом, гардеробная, лоджия и санузел с ванной.',
  'bath-1':
    'Первый отдельный вариант санузла: ванна вдоль правой стены и оборудование слева.',
  'bath-2':
    'Второй отдельный вариант санузла: ванна справа, тумба с раковиной и дополнительный пенал слева.',
  'bath-3':
    'Третий отдельный вариант санузла: ванна справа и компактная расстановка оборудования слева.',
};
export const galleryLayouts = ['plan-2', 'bath-1', 'bath-2', 'bath-3'].map(
  (id, index) => {
    const layout = planLayouts.find((l) => l.id === id)!;
    return {
      id,
      number: String(index + 1).padStart(2, '0'),
      name: layout.name,
      short: id === 'plan-2' ? 'Квартира' : `Санузел ${id.slice(-1)}`,
      description: descriptions[id],
      detail: descriptions[id],
      benefit: id.startsWith('plan')
        ? 'Четыре оконных и французских проёма'
        : 'Самостоятельная схема санузла',
      tradeoff:
        '3D-основа сохраняет геометрию файла .plan. Фотореалистичные изображения показывают вариант завершённой отделки.',
      walls: `${layout.walls.length} стеновых отрезков · высота 2,70 м`,
    };
  },
);
const styleInfo: Record<
  PaletteId,
  {
    name: string;
    mood: string;
    description: string;
    swatches: [string, string, string, string];
  }
> = {
  natural: {
    name: 'Светлая отделка',
    mood: 'Светлое дерево и спокойный текстиль',
    description:
      'Светлый дуб, белые стены, льняной текстиль и светлый камень. Спокойный современный интерьер.',
    swatches: ['#f1efeb', '#d5c4a8', '#e0d7ca', '#e4dfd3'],
  },
  warm: {
    name: 'Тёплая отделка',
    mood: 'Тёплые оттенки дерева и ткани',
    description:
      'Медовый дуб, тёплые нейтральные стены, бежевый текстиль и бронзовые детали.',
    swatches: ['#e9dfcf', '#bc8d51', '#cbbb9f', '#d6c5a9'],
  },
  contrast: {
    name: 'Контрастная отделка',
    mood: 'Выразительные акценты',
    description:
      'Тёмный орех, светло-серые стены, графитовый текстиль и чёрные металлические детали.',
    swatches: ['#d9d6d0', '#645246', '#858482', '#cfc7bb'],
  },
};
export const galleryStyles = (['natural', 'warm', 'contrast'] as const).map(
  (id) => ({
    id,
    ...styleInfo[id],
    materials: [
      { name: 'Стены', color: styleInfo[id].swatches[0] },
      { name: 'Дерево', color: styleInfo[id].swatches[1] },
      { name: 'Текстиль', color: styleInfo[id].swatches[2] },
      { name: 'Камень', color: styleInfo[id].swatches[3] },
    ],
  }),
);
export type GalleryLayout = (typeof galleryLayouts)[number];
export type GalleryStyle = (typeof galleryStyles)[number];
export const galleryConcepts = galleryLayouts.flatMap((layout) =>
  galleryStyles.map((style, index) => {
    const images = galleryShots(layout.id).map((shot) => {
      const proposal = usesRoomProposal(layout.id, shot.id);
      const file = `${layout.id}-${style.id}-${shot.id}.png`;
      const modelSrc = `./gallery/${proposal ? GALLERY_REVISION : ORIGINAL_MODEL_REVISION}/images/${file}`;
      return {
        ...shot,
        proposal,
        kind: shot.cutaway ? ('model' as const) : ('generated' as const),
        modelSrc,
        src: shot.cutaway
          ? modelSrc
          : proposal
            ? `./gallery/${GALLERY_FINISH_REVISION}/finished/${file}`
            : `./gallery/gallery-013/images/${file}`,
      };
    });
    return {
      id: `${layout.id}-${style.id}`,
      number: `${layout.number}.${index + 1}`,
      layout,
      style,
      imageNote: layout.id === 'plan-2' ? ROOM_PROPOSAL_NOTE : undefined,
      images,
      image: images[0].src,
      plan: `./gallery/${layout.id === 'plan-2' ? ROOM_PROPOSAL_REVISION : PLAN_REVISION}/plans/${layout.id}.svg`,
      project:
        layout.id === 'plan-2'
          ? `./gallery/${ROOM_PROPOSAL_REVISION}/room-workspace.json`
          : undefined,
    };
  }),
);
export const galleryImageCount = galleryConcepts.reduce(
  (sum, concept) => sum + concept.images.length,
  0,
);
export const galleryFinishedImageCount = galleryConcepts.reduce(
  (sum, concept) =>
    sum + concept.images.filter((image) => image.kind === 'generated').length,
  0,
);
export type GalleryConcept = (typeof galleryConcepts)[number];
