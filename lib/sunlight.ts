import type { SunSettings } from './design-types.ts';
import type { Vec3 } from './editor-model.ts';
const rad = Math.PI / 180,
  degrees = 180 / Math.PI;
/** NOAA fractional-year approximation. Geometric elevation, no atmospheric refraction.
 * https://www.gml.noaa.gov/grad/solcalc/solareqns.PDF
 * Date/time are explicit local civil time; UTC offset is supplied, never browser timezone.
 */
export function solarPosition(
  s: Pick<
    SunSettings,
    'date' | 'minutes' | 'latitude' | 'longitude' | 'utcOffset'
  >,
) {
  const date = new Date(`${s.date}T00:00:00Z`),
    year = date.getUTCFullYear();
  const days = (Date.UTC(year + 1, 0, 1) - Date.UTC(year, 0, 1)) / 86400000;
  const day = (date.getTime() - Date.UTC(year, 0, 1)) / 86400000 + 1;
  const gamma = ((2 * Math.PI) / days) * (day - 1 + (s.minutes / 60 - 12) / 24);
  const eq =
    229.18 *
    (0.000075 +
      0.001868 * Math.cos(gamma) -
      0.032077 * Math.sin(gamma) -
      0.014615 * Math.cos(2 * gamma) -
      0.040849 * Math.sin(2 * gamma));
  const dec =
    0.006918 -
    0.399912 * Math.cos(gamma) +
    0.070257 * Math.sin(gamma) -
    0.006758 * Math.cos(2 * gamma) +
    0.000907 * Math.sin(2 * gamma) -
    0.002697 * Math.cos(3 * gamma) +
    0.00148 * Math.sin(3 * gamma);
  const time =
    (((s.minutes + eq + 4 * s.longitude - 60 * s.utcOffset) % 1440) + 1440) %
    1440;
  const hour = (time / 4 - 180) * rad,
    lat = s.latitude * rad;
  const elevation =
    Math.asin(
      Math.max(
        -1,
        Math.min(
          1,
          Math.sin(lat) * Math.sin(dec) +
            Math.cos(lat) * Math.cos(dec) * Math.cos(hour),
        ),
      ),
    ) * degrees;
  const azimuth =
    (Math.atan2(
      Math.sin(hour),
      Math.cos(hour) * Math.sin(lat) - Math.tan(dec) * Math.cos(lat),
    ) *
      degrees +
      180 +
      360) %
    360;
  return { azimuth, elevation };
}
export function sunDirection(s: SunSettings): {
  azimuth: number;
  elevation: number;
  direction: Vec3;
} {
  const pos =
    s.mode === 'manual'
      ? { azimuth: s.azimuth, elevation: s.elevation }
      : solarPosition(s);
  const a = (pos.azimuth + s.north) * rad,
    h = pos.elevation * rad;
  return {
    ...pos,
    direction: [
      Math.sin(a) * Math.cos(h),
      Math.sin(h),
      -Math.cos(a) * Math.cos(h),
    ],
  };
}
export const seasonDates = [
  ['03-21', 'Весна'],
  ['06-21', 'Лето'],
  ['09-22', 'Осень'],
  ['12-21', 'Зима'],
] as const;
