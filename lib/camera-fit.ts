import { Vector3 } from 'three';

export interface Bounds {
  min: [number, number, number];
  max: [number, number, number];
}
export const apartmentBounds: Bounds = {
  min: [-0.2, -0.4, -0.2],
  max: [9.2, 2.9, 7.2],
};
/** Fit every corner to both axes, reserving space for the viewer toolbar/caption. */
export function fitCamera(bounds: Bounds, aspect: number, verticalFov = 36) {
  const target = new Vector3()
    .addVectors(new Vector3(...bounds.min), new Vector3(...bounds.max))
    .multiplyScalar(0.5);
  const direction = new Vector3(-13, 14.2, 14.3).normalize();
  const right = new Vector3()
    .crossVectors(new Vector3(0, 1, 0), direction)
    .normalize();
  const up = new Vector3().crossVectors(direction, right).normalize();
  const tangent = Math.tan((verticalFov * Math.PI) / 360);
  let distance = 5;
  for (const x of [bounds.min[0], bounds.max[0]])
    for (const y of [bounds.min[1], bounds.max[1]])
      for (const z of [bounds.min[2], bounds.max[2]]) {
        const delta = new Vector3(x, y, z).sub(target);
        distance = Math.max(
          distance,
          delta.dot(direction) +
            Math.abs(delta.dot(right)) /
              (tangent * Math.max(0.1, aspect) * 0.85),
          delta.dot(direction) + Math.abs(delta.dot(up)) / (tangent * 0.7),
        );
      }
  return {
    target,
    position: target.clone().addScaledVector(direction, distance),
  };
}
