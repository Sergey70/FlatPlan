import type { CameraState } from './editor-model.ts';
export interface SnapSettings {
  enabled: boolean;
  grid: boolean;
  objects: boolean;
  step: number;
  gap: number;
}
export const defaultSnap: SnapSettings = {
  enabled: true,
  grid: true,
  objects: true,
  step: 0.05,
  gap: 0.05,
};
export interface WalkSettings {
  enabled: boolean;
  eyeHeight: number;
  speed: number;
}
export const defaultWalk: WalkSettings = {
  enabled: false,
  eyeHeight: 1.6,
  speed: 1.4,
};
export interface SunSettings {
  enabled: boolean;
  mode: 'location' | 'manual';
  city: string;
  latitude: number;
  longitude: number;
  utcOffset: number;
  north: number;
  date: string;
  minutes: number;
  azimuth: number;
  elevation: number;
}
// City-centre coordinates; south-facing glazing is on the left of the supplied plan.
export const defaultSun: SunSettings = {
  enabled: false,
  mode: 'location',
  city: 'Минск',
  latitude: 53.90019,
  longitude: 27.56653,
  utcOffset: 3,
  north: 90,
  date: '2026-06-21',
  minutes: 720,
  azimuth: 180,
  elevation: 40,
};
export type FinishKind = 'paint' | 'oak' | 'tile' | 'fabric' | 'stone';
export interface Finish {
  kind: FinishKind;
  color: string;
  angle: number;
  width: number;
  height: number;
  joint: number;
  jointColor: string;
  roughness: number;
}
export type WallFace = 'front' | 'back' | 'top' | 'edge';
export const defaultFinish = (kind: FinishKind = 'paint'): Finish => ({
  kind,
  color: kind === 'oak' ? '#c8a779' : kind === 'fabric' ? '#c5c7bd' : '#ece8df',
  angle: 0,
  width: kind === 'oak' ? 1.2 : 0.6,
  height: kind === 'oak' ? 0.18 : 0.6,
  joint: kind === 'oak' ? 0.002 : 0.003,
  jointColor: '#b6b3aa',
  roughness: kind === 'tile' ? 0.35 : 0.85,
});
export interface SavedViewpoint {
  id: string;
  name: string;
  camera: CameraState;
}
