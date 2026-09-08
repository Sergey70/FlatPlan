import type { Arrangement, CameraState } from './editor-model.ts';
import { polygonContains, type Point } from './apartment.ts';
import { measuredRooms, roomContains } from './room-surfaces.ts';
import { analysisFootprints } from './plan-analysis.ts';
import { canStand } from './walkthrough.ts';
export interface PresentationView {
  id: string;
  label: string;
  roomId: string;
  camera: CameraState;
  fov: number;
}
/** Recompute useful free camera positions from the edited geometry rather than source-plan constants. */
export function presentationViews(
  scene: Arrangement,
  roomId: string,
  eyeHeight = 1.55,
): PresentationView[] {
  const room = measuredRooms(scene.objects).find((r) => r.id === roomId);
  if (!room) return [];
  const min: Point = [
      Math.min(...room.polygon.map((p) => p[0])),
      Math.min(...room.polygon.map((p) => p[1])),
    ],
    max: Point = [
      Math.max(...room.polygon.map((p) => p[0])),
      Math.max(...room.polygon.map((p) => p[1])),
    ];
  const obstacles = analysisFootprints(scene.objects, 'solids').filter(
    (s) =>
      (s.kind === 'wall' || s.kind === 'furniture') &&
      s.maxY > room.elevation + 0.12 &&
      s.minY < room.elevation + eyeHeight + 0.1,
  );
  const candidates: Point[] = [];
  for (let x = 0; x <= 24; x++)
    for (let z = 0; z <= 24; z++) {
      const p: Point = [
        min[0] + ((max[0] - min[0]) * (x + 0.5)) / 25,
        min[1] + ((max[1] - min[1]) * (z + 0.5)) / 25,
      ];
      if (
        roomContains(room, p) &&
        canStand(obstacles, p, 0.13) &&
        [
          [0.14, 0],
          [-0.14, 0],
          [0, 0.14],
          [0, -0.14],
        ].every(([dx, dz]) => roomContains(room, [p[0] + dx, p[1] + dz]))
      )
        candidates.push(p);
    }
  if (!candidates.length) return [];
  const center: Point = [(min[0] + max[0]) / 2, (min[1] + max[1]) / 2];
  function boundaryDistance(p: Point) {
    return Math.min(
      ...[room!.polygon, ...room!.holes].flatMap((contour) =>
        contour.map((a, i) => {
          const b = contour[(i + 1) % contour.length],
            dx = b[0] - a[0],
            dz = b[1] - a[1],
            t = Math.max(
              0,
              Math.min(
                1,
                ((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / (dx * dx + dz * dz),
              ),
            );
          return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dz);
        }),
      ),
    );
  }
  // Use the largest open part of an L-shaped floor so a kitchen viewpoint does not land in its entrance corridor.
  const interior: Point[] = [];
  for (let x = 1; x < 25; x++)
    for (let z = 1; z < 25; z++) {
      const p: Point = [
        min[0] + ((max[0] - min[0]) * x) / 25,
        min[1] + ((max[1] - min[1]) * z) / 25,
      ];
      if (roomContains(room, p)) interior.push(p);
    }
  let target =
    interior.sort(
      (a, b) =>
        boundaryDistance(b) -
        Math.hypot(b[0] - center[0], b[1] - center[1]) * 0.01 -
        (boundaryDistance(a) -
          Math.hypot(a[0] - center[0], a[1] - center[1]) * 0.01),
    )[0] ?? candidates[0];
  const walls = obstacles.filter(
    (s) => s.kind === 'wall' && s.maxY > room.elevation + 1.1,
  );
  if (walls.some((w) => polygonContains(w.points, target)))
    target = candidates.reduce((a, b) =>
      Math.hypot(a[0] - target[0], a[1] - target[1]) <
      Math.hypot(b[0] - target[0], b[1] - target[1])
        ? a
        : b,
    );
  const clearView = (p: Point) =>
    !walls.some((wall) =>
      wall.points.some((a, i) => {
        const b = wall.points[(i + 1) % wall.points.length],
          dx = target[0] - p[0],
          dz = target[1] - p[1],
          ex = b[0] - a[0],
          ez = b[1] - a[1],
          det = dx * ez - dz * ex;
        if (Math.abs(det) < 1e-9) return false;
        const t = ((a[0] - p[0]) * ez - (a[1] - p[1]) * ex) / det,
          u = ((a[0] - p[0]) * dz - (a[1] - p[1]) * dx) / det;
        return t > 0.001 && t < 0.999 && u >= 0 && u <= 1;
      }),
    );
  const visibleCandidates = candidates.filter(clearView);
  const reach = Math.max(1.2, boundaryDistance(target) * 1.25);
  const primary = visibleCandidates.filter(
    (p) =>
      Math.hypot(p[0] - target[0], p[1] - target[1]) <= reach &&
      Array.from({ length: 12 }, (_, i) => i / 11).every((t) =>
        roomContains(room, [
          p[0] + (target[0] - p[0]) * t,
          p[1] + (target[1] - p[1]) * t,
        ]),
      ),
  );
  const desired: Point[] = [
      [min[0], min[1]],
      [max[0], min[1]],
      [max[0], max[1]],
      [min[0], max[1]],
    ],
    chosen: Point[] = [];
  return desired.flatMap((corner, i) => {
    const available = (
      primary.length >= 4 ? primary : visibleCandidates
    ).filter((p) =>
      chosen.every((a) => Math.hypot(a[0] - p[0], a[1] - p[1]) > 0.35),
    );
    if (!available.length) return [];
    const position = available.sort(
      (a, b) =>
        Math.hypot(a[0] - corner[0], a[1] - corner[1]) -
        Math.hypot(b[0] - corner[0], b[1] - corner[1]),
    )[0];
    chosen.push(position);
    let aim = target;
    if (Math.hypot(position[0] - aim[0], position[1] - aim[1]) < 0.5)
      aim = candidates.reduce((a, b) =>
        Math.hypot(a[0] - position[0], a[1] - position[1]) >
        Math.hypot(b[0] - position[0], b[1] - position[1])
          ? a
          : b,
      );
    return [
      {
        id: `${roomId}-view-${i + 1}`,
        label: `${room.name} · ракурс ${i + 1}`,
        roomId,
        camera: {
          position: [position[0], room.elevation + eyeHeight, position[1]],
          target: [aim[0], room.elevation + 1.1, aim[1]],
        },
        fov: 68,
      },
    ];
  });
}
