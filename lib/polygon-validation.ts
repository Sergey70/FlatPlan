import { polygonArea, polygonContains, type Point } from './apartment.ts';
const epsilon = 1e-8;
function cross(a: Point, b: Point, c: Point) {
  return (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
}
function onSegment(a: Point, b: Point, p: Point) {
  return (
    Math.abs(cross(a, b, p)) < epsilon &&
    p[0] >= Math.min(a[0], b[0]) - epsilon &&
    p[0] <= Math.max(a[0], b[0]) + epsilon &&
    p[1] >= Math.min(a[1], b[1]) - epsilon &&
    p[1] <= Math.max(a[1], b[1]) + epsilon
  );
}
function intersects(a: Point, b: Point, c: Point, d: Point) {
  const ab1 = cross(a, b, c),
    ab2 = cross(a, b, d),
    cd1 = cross(c, d, a),
    cd2 = cross(c, d, b);
  return (
    (ab1 * ab2 < 0 && cd1 * cd2 < 0) ||
    onSegment(a, b, c) ||
    onSegment(a, b, d) ||
    onSegment(c, d, a) ||
    onSegment(c, d, b)
  );
}
function contoursCross(a: Point[], b: Point[]) {
  return a.some((p, i) =>
    b.some((q, j) =>
      intersects(p, a[(i + 1) % a.length], q, b[(j + 1) % b.length]),
    ),
  );
}
export function validateContours(outer: Point[], holes: Point[][] = []) {
  for (const polygon of [outer, ...holes]) {
    if (polygonArea(polygon) < 0.000001)
      throw new Error('Контур имеет нулевую площадь.');
    for (let i = 0; i < polygon.length; i++) {
      const next = (i + 1) % polygon.length;
      if (
        Math.hypot(
          polygon[i][0] - polygon[next][0],
          polygon[i][1] - polygon[next][1],
        ) < epsilon
      )
        throw new Error('В контуре повторяются соседние точки.');
      for (let j = i + 1; j < polygon.length; j++)
        if (
          j !== next &&
          (j + 1) % polygon.length !== i &&
          intersects(
            polygon[i],
            polygon[next],
            polygon[j],
            polygon[(j + 1) % polygon.length],
          )
        )
          throw new Error('Контур пересекает сам себя.');
    }
  }
  for (let i = 0; i < holes.length; i++) {
    const hole = holes[i];
    if (
      !hole.every((p) => polygonContains(outer, p)) ||
      contoursCross(outer, hole)
    )
      throw new Error('Отверстие выходит за границу контура.');
    for (let j = i + 1; j < holes.length; j++)
      if (
        contoursCross(hole, holes[j]) ||
        polygonContains(hole, holes[j][0]) ||
        polygonContains(holes[j], hole[0])
      )
        throw new Error('Отверстия пересекаются.');
  }
}
