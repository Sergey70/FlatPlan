import type { Vec3 } from './editor-model.ts';

/** The stored node transform is the current pose. Pivot is in unscaled part coordinates. */
export interface Mechanism {
  kind: 'hinge' | 'slide';
  axis: 'x' | 'y' | 'z';
  pivot: Vec3;
  extent: number;
  progress: number;
}
export type MechanismPreset =
  | 'door'
  | 'cabinet'
  | 'drawer'
  | 'fridge'
  | 'dishwasher'
  | 'oven'
  | 'sofa';
export const mechanismPresets: { id: MechanismPreset; name: string }[] = [
  { id: 'door', name: 'Дверь из плана' },
  { id: 'cabinet', name: 'Распашные фасады' },
  { id: 'drawer', name: 'Выдвижные ящики' },
  { id: 'fridge', name: 'Дверца холодильника' },
  { id: 'dishwasher', name: 'Дверца посудомойки' },
  { id: 'oven', name: 'Дверца духовки' },
  { id: 'sofa', name: 'Выкатной диван' },
];

export type ElectricalKind =
  | 'socket'
  | 'switch'
  | 'data'
  | 'appliance'
  | 'light';
export interface LightSpec {
  type: 'point' | 'spot';
  lumens: number;
  kelvin: number;
  beam: number;
  level: number;
  offset: Vec3;
  target: Vec3;
}
export interface ElectricalPoint {
  kind: ElectricalKind;
  group: string;
  controls: string[];
  fixture?: LightSpec;
}
export interface LightingScene {
  id: string;
  name: string;
  levels: { id: string; level: number }[];
}
export const electricalKinds: {
  id: ElectricalKind;
  name: string;
  symbol: string;
  height: number;
}[] = [
  { id: 'socket', name: 'Розетка', symbol: 'Р', height: 0.3 },
  { id: 'switch', name: 'Выключатель', symbol: 'В', height: 0.9 },
  { id: 'data', name: 'Интернет / данные', symbol: 'D', height: 0.3 },
  { id: 'appliance', name: 'Вывод для техники', symbol: 'Т', height: 0.3 },
  { id: 'light', name: 'Светильник', symbol: 'С', height: 2.6 },
];
export const defaultLight = (): LightSpec => ({
  type: 'spot',
  lumens: 600,
  kelvin: 3000,
  beam: 90,
  level: 1,
  offset: [0, -0.03, 0],
  target: [0, -1, 0],
});

export interface EstimateRate {
  key: string;
  unit: string;
  price: number;
  coverage: number;
  pack: number;
}
export interface EstimateSettings {
  currency: string;
  waste: number;
  rates: EstimateRate[];
}
export const defaultEstimate = (): EstimateSettings => ({
  currency: 'BYN',
  waste: 10,
  rates: [],
});

export type StudyFace = 'top' | 'front' | 'back';
export interface StudyTarget {
  id: string;
  face: StudyFace;
}
export interface StudyShades {
  windowIds: string[];
  roller: number;
  slatWidth: number;
  slatPitch: number;
  slatAngle: number;
}
export interface WorkplaceStudy {
  targets: StudyTarget[];
  rotateIds: string[];
  rotation: number;
  start: number;
  end: number;
  step: 15 | 30 | 60;
  ceilingHeight: number;
  shades: StudyShades;
}
export const defaultStudy = (): WorkplaceStudy => ({
  targets: [],
  rotateIds: [],
  rotation: 90,
  start: 540,
  end: 1080,
  step: 30,
  ceilingHeight: 2.7,
  shades: {
    windowIds: [],
    roller: 0.5,
    slatWidth: 0.025,
    slatPitch: 0.022,
    slatAngle: 0,
  },
});
