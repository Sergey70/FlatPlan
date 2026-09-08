import { planLayouts } from './plan-data.ts';
import type { CameraState } from './editor-model.ts';

export const GALLERY_REVISION = 'gallery-012';
export interface GalleryShot {
  id: string;
  label: string;
  room?: string;
  camera: CameraState;
  fov: number;
  cutaway: boolean;
}

// Metres in the source drawing's coordinate system. Camera positions are in
// free room space; no walls or furnishings are moved to compose the images.
export function galleryShots(layoutId: string): GalleryShot[] {
  const layout = planLayouts.find((item) => item.id === layoutId);
  if (!layout) throw new Error(`Unknown gallery layout: ${layoutId}`);
  const x = layout.width / 200,
    z = layout.depth / 200,
    size = Math.max(layout.width, layout.depth) / 100;
  const interiors: GalleryShot[] =
    layoutId === 'plan-2'
      ? [
          {
            id: 'kitchen',
            label: 'Кухня · диван и обеденная зона',
            room: 'Кухня',
            camera: { position: [0.65, 1.55, 9.0], target: [2.5, 1.1, 6.55] },
            fov: 60,
            cutaway: false,
          },
          {
            id: 'kitchen-reverse',
            label: 'Кухня · окно и ТВ-зона',
            room: 'Кухня',
            camera: {
              position: [3.45, 1.55, 6.95],
              target: [2.05, 1.05, 8.65],
            },
            fov: 64,
            cutaway: false,
          },
          {
            id: 'bedroom',
            label: 'Спальня · 13,55 м²',
            room: 'Спальня',
            camera: { position: [3.7, 1.55, 5.5], target: [1.85, 1.0, 3.8] },
            fov: 62,
            cutaway: false,
          },
          {
            id: 'room',
            label: 'Комната · 14,91 м²',
            room: 'Комната 1',
            camera: { position: [1.85, 1.55, 2.58], target: [5.3, 1.1, 1.25] },
            fov: 62,
            cutaway: false,
          },
        ]
      : [
          {
            id: 'entrance',
            label: 'Санузел · вид от входа',
            room: 'Санузел',
            camera: { position: [1.8, 1.55, 0.3], target: [1.9, 0.8, 1.4] },
            fov: 76,
            cutaway: false,
          },
          {
            id: 'vanity',
            label: 'Санузел · раковина и оборудование',
            room: 'Санузел',
            camera: { position: [2.05, 1.55, 0.9], target: [1.0, 0.9, 1.1] },
            fov: 72,
            cutaway: false,
          },
        ];
  return [
    ...interiors,
    {
      id: 'overview',
      label: 'Общий вид планировки',
      camera: {
        position: [x - size * 0.72, Math.max(size * 1.25, 4), z + size * 1.05],
        target: [x, 0.35, z],
      },
      fov: 40,
      cutaway: true,
    },
  ];
}
