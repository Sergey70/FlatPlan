import { parseViewPatch, type ViewPatch } from './view-state';
import { rooms, palettes } from './apartment';

interface Tool {
  name: string;
  title: string;
  description: string;
  inputSchema: object;
  annotations: { readOnlyHint: boolean };
  execute: (input: unknown) => unknown;
}
interface ModelContext {
  registerTool(
    tool: Tool,
    options?: { signal: AbortSignal },
  ): void | Promise<void>;
}

export function registerViewTools(
  apply: (patch: ViewPatch) => unknown,
  read: () => unknown,
) {
  const context = (document as Document & { modelContext?: ModelContext })
    .modelContext;
  if (!context?.registerTool) return () => {};
  const lifecycle = new AbortController();
  const tools: Tool[] = [
    {
      name: 'get_apartment_view',
      title: 'Read apartment view',
      description: 'Read current demo rooms, palette and viewer settings.',
      inputSchema: {
        type: 'object',
        properties: {},
        additionalProperties: false,
      },
      annotations: { readOnlyHint: true },
      execute: () => ({
        view: read(),
        rooms,
        palettes: Object.keys(palettes),
        demo: true,
      }),
    },
    {
      name: 'configure_apartment_view',
      title: 'Configure apartment view',
      description:
        'Change the visible demo apartment view, selected room, materials or display options. Does not edit the apartment layout or save data.',
      inputSchema: {
        type: 'object',
        properties: {
          room: {
            type: ['string', 'null'],
            enum: [null, ...rooms.map((room) => room.id)],
          },
          palette: { type: 'string', enum: Object.keys(palettes) },
          view: { type: 'string', enum: ['2d', '3d'] },
          ...Object.fromEntries(
            ['furniture', 'cutaway', 'labels', 'night'].map((key) => [
              key,
              { type: 'boolean' },
            ]),
          ),
        },
        additionalProperties: false,
      },
      annotations: { readOnlyHint: false },
      execute: (input) => apply(parseViewPatch(input)),
    },
  ];
  for (const tool of tools) {
    try {
      void Promise.resolve(
        context.registerTool(tool, { signal: lifecycle.signal }),
      ).catch((error) =>
        console.warn('View tool registration unavailable', error),
      );
    } catch (error) {
      console.warn('View tool registration unavailable', error);
    }
  }
  return () => lifecycle.abort();
}
