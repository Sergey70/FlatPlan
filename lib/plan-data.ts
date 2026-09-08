import raw from './plan-source.json' with { type: 'json' };
import type { Point } from './apartment.ts';
export interface PlanItem {
  id: string;
  type: string;
  center: Point;
  width: number;
  depth: number;
  height: number;
  angle: number;
  bottom: number;
  hasBottom: boolean;
  mirrorX: number;
  mirrorZ: number;
}
export interface PlanHole {
  id: string;
  type: string;
  group: string;
  width: number;
  height: number;
  bottom: number;
  center: Point;
  fromPoint: Point;
  frameCenter: Point;
  toPoint: Point;
  opening: string;
  frameDepth: number;
}
export interface PlanWall {
  id: string;
  start: Point;
  end: Point;
  profile: Point[];
  thickness: number;
  height: number;
  holes: PlanHole[];
}
export interface PlanRoom {
  id: string;
  name: string;
  micro: boolean;
  area: number;
  polygon: Point[];
  center: Point;
}
export interface PlanLayout {
  id: string;
  name: string;
  width: number;
  depth: number;
  height: number;
  walls: PlanWall[];
  rooms: PlanRoom[];
  items: PlanItem[];
}
export const planSource = raw as {
  version: number;
  units: string;
  defaultLayout: string;
  layouts: PlanLayout[];
};
export const planLayouts = planSource.layouts;
export const PLAN_REVISION = 'plan-010';
// Arrangement identity stays stable across source revisions and user edits.
export const planArrangementId = (layout: string) => `plan-008-${layout}`;
export const DEFAULT_PLAN_ID = planArrangementId(planSource.defaultLayout);
