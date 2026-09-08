import { palettes, type PaletteId } from './apartment.ts';
import { planLayouts, PLAN_REVISION } from './plan-data.ts';
const descriptions: Record<string, string> = {
  'plan-2':
    'Кухня 21,43 м² внизу, спальня 13,55 м² у верхнего левого окна, комната 14,91 м², гардеробная, лоджия и санузел с ванной.',
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
        'Положение и размеры объектов соответствуют файлу .plan. Детали мебели и материалы показаны условно.',
      walls: `${layout.walls.length} стеновых отрезков · высота 2,70 м`,
    };
  },
);
const styleInfo: Record<
  PaletteId,
  { name: string; mood: string; description: string }
> = {
  natural: {
    name: 'Светлая отделка',
    mood: 'Светлое дерево и спокойный текстиль',
    description:
      'Светлая палитра редактора: дерево, нейтральные стены, текстиль и камень.',
  },
  warm: {
    name: 'Тёплая отделка',
    mood: 'Тёплые оттенки дерева и ткани',
    description:
      'Тёплая палитра редактора. Цвета отделки меняются при сохранении всей геометрии и расстановки.',
  },
  contrast: {
    name: 'Контрастная отделка',
    mood: 'Выразительные акценты',
    description:
      'Контрастная палитра редактора с более тёмными материалами и выразительным текстилем.',
  },
};
export const galleryStyles = (['natural', 'warm', 'contrast'] as const).map(
  (id) => ({
    id,
    ...styleInfo[id],
    materials: [
      { name: 'Стены', color: palettes[id].wall },
      { name: 'Дерево', color: palettes[id].wood },
      { name: 'Текстиль', color: palettes[id].fabric },
      { name: 'Камень', color: palettes[id].stone },
    ],
  }),
);
export type GalleryLayout = (typeof galleryLayouts)[number];
export type GalleryStyle = (typeof galleryStyles)[number];
export const galleryConcepts = galleryLayouts.flatMap((layout) =>
  galleryStyles.map((style, index) => ({
    id: `${layout.id}-${style.id}`,
    number: `${layout.number}.${index + 1}`,
    layout,
    style,
    imageNote: undefined as string | undefined,
    image: `./gallery/${PLAN_REVISION}/images/${layout.id}-${style.id}.png`,
    plan: `./gallery/${PLAN_REVISION}/plans/${layout.id}.svg`,
  })),
);
export type GalleryConcept = (typeof galleryConcepts)[number];
