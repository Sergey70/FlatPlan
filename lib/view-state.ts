import {
  palettes,
  rooms,
  type SceneOptions,
  type RoomId,
  type ViewMode,
} from './apartment.ts';

export type ViewPatch = Partial<
  SceneOptions & { room: RoomId | null; view: ViewMode }
>;
const booleans = new Set(['furniture', 'cutaway', 'labels', 'night']);
/** Validate every field before applying anything, so invalid patches are atomic. */
export function parseViewPatch(input: unknown): ViewPatch {
  if (!input || typeof input !== 'object' || Array.isArray(input))
    throw new Error('Expected an object.');
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input)) {
    if (booleans.has(key)) {
      if (typeof value !== 'boolean')
        throw new Error(`${key} must be boolean.`);
    } else if (key === 'palette') {
      if (typeof value !== 'string' || !Object.hasOwn(palettes, value))
        throw new Error('Unknown palette.');
    } else if (key === 'room') {
      if (value !== null && !rooms.some((room) => room.id === value))
        throw new Error('Unknown room.');
    } else if (key === 'view') {
      if (value !== '2d' && value !== '3d') throw new Error('Unknown view.');
    } else throw new Error(`Unknown setting: ${key}.`);
    result[key] = value;
  }
  return result as ViewPatch;
}
