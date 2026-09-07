/** PLAN-001: approximate reconstruction of a technical-passport drawing.
 * Coordinates in meters: X left-to-right, Z top-to-bottom on the upright plan.
 * Reported areas are independent of approximate model polygon areas.
 * See PLAN_ASSUMPTIONS.md. No apartment/location identifiers are retained here.
 */
export type Point = [number, number];
export type RoomId = 'living' | 'bedroom' | 'bathroom' | 'balcony';
export type PaletteId = 'natural' | 'warm' | 'contrast';
export type ViewMode = '3d' | '2d';
export interface Room {
  id: RoomId;
  name: string;
  shortName: string;
  polygon: Point[];
  holes: Point[][];
  x: number;
  z: number;
  width: number;
  depth: number;
  color: string;
  reportedArea: number;
  accountedArea?: number;
  label: Point;
}
export const apartment = {
  name: 'План из техпаспорта',
  width: 7.13,
  depth: 9,
  ceiling: 2.8,
  wallThickness: 0.27,
  insideArea: 58.1,
  livingArea: 54.1,
  accountedArea: 60.5,
  source: 'technical-passport',
  approximate: true,
};
const rectangle = (x: number, z: number, w: number, d: number): Point[] => [
  [x, z],
  [x + w, z],
  [x + w, z + d],
  [x, z + d],
];
export const columnOutline = rectangle(4.04, 5.65, 0.45, 0.45);
export const serviceOutline: Point[] = [
  [4.26, 7.21],
  [5.31, 7.21],
  [5.31, 7.66],
  [4.71, 7.66],
  [4.71, 8.97],
  [4.26, 8.97],
];
export const rooms: Room[] = [
  {
    id: 'living',
    name: 'Кухня-гостиная',
    shortName: 'Кухня-гостиная',
    x: 0,
    z: 2.65,
    width: 7.13,
    depth: 6.35,
    polygon: [
      [0, 2.65],
      [7.13, 2.65],
      [7.13, 7.1],
      [4.15, 7.1],
      [4.15, 9],
      [0, 9],
      [0, 6.1],
      [0.3, 6.1],
      [0.3, 5.65],
      [0, 5.65],
    ],
    holes: [columnOutline],
    reportedArea: 39.4,
    label: [2.5, 6.25],
    color: '#e4d3bc',
  },
  {
    id: 'bedroom',
    name: 'Жилая комната',
    shortName: 'Жилая комната',
    x: 1.29,
    z: 0,
    width: 5.84,
    depth: 2.55,
    polygon: rectangle(1.29, 0, 5.84, 2.55),
    holes: [],
    reportedArea: 14.7,
    label: [4.4, 1.25],
    color: '#d5d8c9',
  },
  {
    id: 'bathroom',
    name: 'Санузел',
    shortName: 'Санузел',
    x: 4.26,
    z: 7.21,
    width: 2.87,
    depth: 1.76,
    polygon: [
      [5.31, 7.21],
      [7.13, 7.21],
      [7.13, 8.97],
      [4.71, 8.97],
      [4.71, 7.66],
      [5.31, 7.66],
    ],
    holes: [],
    reportedArea: 4,
    label: [6.15, 8.25],
    color: '#d3dfe1',
  },
  {
    id: 'balcony',
    name: 'Лоджия',
    shortName: 'Лоджия',
    x: -0.08,
    z: -0.19,
    width: 1.26,
    depth: 2.74,
    polygon: rectangle(-0.08, -0.19, 1.26, 2.74),
    holes: [],
    reportedArea: 3.4,
    accountedArea: 2.4,
    label: [0.55, 1.15],
    color: '#deddd3',
  },
];
export interface Opening {
  kind: 'window' | 'door';
  from: number;
  to: number;
  bottom: number;
  top: number;
}
export interface Wall {
  id: string;
  from: Point;
  to: Point;
  thickness: number;
  cutaway: boolean;
  openings: Opening[];
}
const win = (from: number, to: number, bottom = 0.9, top = 2.4): Opening => ({
  kind: 'window',
  from,
  to,
  bottom,
  top,
});
const door = (from: number, to: number): Opening => ({
  kind: 'door',
  from,
  to,
  bottom: 0,
  top: 2.1,
});
export const walls: Wall[] = [
  {
    id: 'bedroom-back',
    from: [1.235, -0.135],
    to: [7.4, -0.135],
    thickness: 0.27,
    cutaway: false,
    openings: [win(1.16, 4.86)],
  },
  {
    id: 'east',
    from: [7.265, -0.135],
    to: [7.265, 9.27],
    thickness: 0.27,
    cutaway: false,
    openings: [door(6.235, 7.175)],
  },
  {
    id: 'south',
    from: [-0.27, 9.135],
    to: [7.4, 9.135],
    thickness: 0.27,
    cutaway: true,
    openings: [],
  },
  {
    id: 'living-west',
    from: [-0.135, 2.65],
    to: [-0.135, 9],
    thickness: 0.27,
    cutaway: true,
    // Photo: two separate glazed spans, with a broad solid pier between them.
    openings: [win(0.4, 2.3), win(3.95, 5.75)],
  },
  {
    id: 'bedroom-divider',
    from: [1.18, 2.6],
    to: [7.13, 2.6],
    thickness: 0.1,
    cutaway: true,
    openings: [door(4.25, 5.15)],
  },
  {
    id: 'balcony-door',
    from: [1.235, -0.19],
    to: [1.235, 2.6],
    thickness: 0.11,
    cutaway: true,
    openings: [door(0.98, 1.85)],
  },
  {
    id: 'balcony-bottom',
    from: [-0.14, 2.6],
    to: [1.29, 2.6],
    thickness: 0.1,
    cutaway: true,
    openings: [],
  },
  {
    id: 'balcony-west',
    from: [-0.115, -0.26],
    to: [-0.115, 2.6],
    thickness: 0.07,
    cutaway: true,
    openings: [win(0.06, 2.79, 0.2, 2.5)],
  },
  {
    id: 'balcony-back',
    from: [-0.15, -0.225],
    to: [1.29, -0.225],
    thickness: 0.07,
    cutaway: false,
    openings: [win(0.06, 1.38, 0.2, 2.5)],
  },
  {
    id: 'bathroom-top',
    from: [4.15, 7.155],
    to: [7.13, 7.155],
    thickness: 0.11,
    cutaway: true,
    openings: [door(1.26, 2.1)],
  },
  // 3 cm closure allowance for the rounded bathroom dimension chain; see assumptions.
  {
    id: 'bathroom-south-finish',
    from: [4.15, 8.985],
    to: [7.13, 8.985],
    thickness: 0.03,
    cutaway: true,
    openings: [],
  },
  {
    id: 'bathroom-left',
    from: [4.205, 7.1],
    to: [4.205, 9],
    thickness: 0.11,
    cutaway: true,
    openings: [],
  },
];
export function wallLength(wall: Wall) {
  return Math.hypot(wall.to[0] - wall.from[0], wall.to[1] - wall.from[1]);
}
export function wallPoint(wall: Wall, distance: number): Point {
  const t = distance / wallLength(wall);
  return [
    wall.from[0] + (wall.to[0] - wall.from[0]) * t,
    wall.from[1] + (wall.to[1] - wall.from[1]) * t,
  ];
}
export const solidOutlines = [
  {
    id: 'column',
    name: 'Колонна · размер приблизительный',
    polygon: columnOutline,
    height: 2.8,
  },
  {
    id: 'facade-pier',
    name: 'Выступ у фасада',
    polygon: rectangle(-0.15, 5.65, 0.45, 0.45),
    height: 2.8,
  },
  {
    id: 'service',
    name: 'Заштрихованная зона · назначение уточняется',
    polygon: serviceOutline,
    height: 2.8,
  },
];
export function polygonArea(points: Point[]) {
  return (
    Math.abs(
      points.reduce((sum, p, i) => {
        const q = points[(i + 1) % points.length];
        return sum + p[0] * q[1] - q[0] * p[1];
      }, 0),
    ) / 2
  );
}
export function polygonContains(points: Point[], [x, z]: Point) {
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const a = points[i],
      b = points[j];
    if (
      a[1] > z !== b[1] > z &&
      x < ((b[0] - a[0]) * (z - a[1])) / (b[1] - a[1]) + a[0]
    )
      inside = !inside;
  }
  return inside;
}
export function roomContains(room: Room, point: Point) {
  return (
    polygonContains(room.polygon, point) &&
    !room.holes.some((hole) => polygonContains(hole, point))
  );
}
export function roomModelArea(room: Room) {
  return (
    polygonArea(room.polygon) -
    room.holes.reduce((sum, hole) => sum + polygonArea(hole), 0)
  );
}
export function roomArea(room: Room) {
  return room.reportedArea;
}
export function polygonPath(points: Point[]) {
  return (
    points
      .map((point, index) => `${index ? 'L' : 'M'}${point[0]} ${point[1]}`)
      .join(' ') + 'Z'
  );
}
export function roomPath(room: Room) {
  return [room.polygon, ...room.holes].map(polygonPath).join(' ');
}
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
  furniture: false,
  labels: true,
  night: false,
  palette: 'natural',
};
