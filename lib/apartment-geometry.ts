import { Shape, Path, Vector2, ShapeGeometry } from 'three';
import type { Point, Room } from './apartment.ts';

/** Map the upright plan (X/Z) onto Three's horizontal X/Z plane. */
export function planShape(polygon: Point[], holes: Point[][] = []) {
  const shape = new Shape(polygon.map(([x, z]) => new Vector2(x, -z)));
  shape.holes = holes.map(
    (points) => new Path(points.map(([x, z]) => new Vector2(x, -z))),
  );
  return shape;
}
export function createFloorGeometry(room: Room) {
  const geometry = new ShapeGeometry(planShape(room.polygon, room.holes));
  geometry.rotateX(-Math.PI / 2);
  return geometry;
}
