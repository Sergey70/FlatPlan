/** Demo dimensions, in meters. X runs left to right, Z runs back to front.
 * Replace this data with measured geometry when the real plan is available.
 * Rooms use gross demo rectangles; areas are illustrative, not surveyed.
 */
export type RoomId = 'living' | 'bedroom' | 'bathroom' | 'hall';
export type PaletteId = 'natural' | 'warm' | 'contrast';
export type ViewMode = '3d' | '2d';
export interface Room {
  id: RoomId;
  name: string;
  shortName: string;
  x: number;
  z: number;
  width: number;
  depth: number;
  color: string;
}
export const apartment = {
  name: 'Демо-квартира',
  width: 9,
  depth: 7,
  ceiling: 2.8,
  wallThickness: 0.16,
};
export const rooms: Room[] = [
  {
    id: 'living',
    name: 'Кухня-гостиная',
    shortName: 'Гостиная',
    x: 0,
    z: 0,
    width: 5.4,
    depth: 7,
    color: '#e4d3bc',
  },
  {
    id: 'bedroom',
    name: 'Спальня',
    shortName: 'Спальня',
    x: 5.4,
    z: 0,
    width: 3.6,
    depth: 3.6,
    color: '#d5d8c9',
  },
  {
    id: 'bathroom',
    name: 'Ванная',
    shortName: 'Ванная',
    x: 5.4,
    z: 5.1,
    width: 3.6,
    depth: 1.9,
    color: '#d3dfe1',
  },
  {
    id: 'hall',
    name: 'Прихожая',
    shortName: 'Прихожая',
    x: 5.4,
    z: 3.6,
    width: 3.6,
    depth: 1.5,
    color: '#e2ded6',
  },
];
export const palettes = {
  natural: {
    name: 'Натуральный',
    description: 'Светлый дуб · лён · известняк',
    wood: '#c8a779',
    fabric: '#d5d5c9',
    accent: '#738170',
    stone: '#d4d0c7',
    wall: '#f2efe8',
    swatch: 'linear-gradient(135deg, #c3a078 0 50%, #d4d7cb 50%)',
  },
  warm: {
    name: 'Тёплый',
    description: 'Медовый дуб · терракота · травертин',
    wood: '#b78652',
    fabric: '#c48c70',
    accent: '#8e573e',
    stone: '#d9c6b1',
    wall: '#f1e7db',
    swatch: 'linear-gradient(135deg, #b58a58 0 50%, #c68c72 50%)',
  },
  contrast: {
    name: 'Контрастный',
    description: 'Тёмный дуб · графит · светлый камень',
    wood: '#74604b',
    fabric: '#727c80',
    accent: '#485655',
    stone: '#d5d8d6',
    wall: '#eaece9',
    swatch: 'linear-gradient(135deg, #78634c 0 50%, #647274 50%)',
  },
} as const;
export function roomArea(room: Room) {
  return room.width * room.depth;
}
export function formatArea(area: number) {
  return new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 1 }).format(
    area,
  );
}
export interface SceneOptions {
  cutaway: boolean;
  furniture: boolean;
  labels: boolean;
  night: boolean;
  palette: PaletteId;
}
export const defaultOptions: SceneOptions = {
  cutaway: true,
  furniture: true,
  labels: true,
  night: false,
  palette: 'natural',
};
