import {
  clone,
  editNode,
  removeNode,
  duplicateNode,
  paintNode,
  saveArrangement,
  loadArrangement,
  validateProject,
  importProject,
  exportProject,
  flattenNodes,
  findNode,
  type EditorProject,
  type EditorView,
  type Vec3,
  type MaterialKind,
} from './editor-model.ts';
import { resizeObject, objectDimensions } from './editor-geometry.ts';
import {
  createFurniture as catalogObject,
  furnitureCatalog as catalog,
  type FurnitureId as CatalogId,
} from './furniture-catalog.ts';
interface Runtime {
  read(): EditorProject;
  commit(project: EditorProject): void;
  view(patch: Partial<EditorView>): void;
  undo(): void;
  redo(): void;
  save(): void;
  status(): unknown;
}
interface Tool {
  name: string;
  description: string;
  inputSchema: object;
  annotations: { readOnlyHint: boolean };
  execute: (input: unknown) => unknown;
}
interface ModelContext {
  registerTool(
    tool: Tool,
    options: { signal: AbortSignal },
  ): void | Promise<void>;
}
const objectSchema = (properties: object) => ({
  type: 'object',
  properties,
  additionalProperties: false,
});
function input(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Expected an object');
  return value as Record<string, unknown>;
}
export function registerEditorTools(runtime: Runtime) {
  const context = (document as Document & { modelContext?: ModelContext })
    .modelContext;
  if (!context?.registerTool) return () => {};
  const lifecycle = new AbortController();
  const tools: Tool[] = [
    {
      name: 'get_editor_project',
      description:
        'Read the current FlatPlan project or one editable object. Compact summary includes root object IDs, saved variants, exact camera, view, and save/renderer status.',
      inputSchema: objectSchema({ objectId: { type: 'string' } }),
      annotations: { readOnlyHint: true },
      execute: (value) => {
        const args = input(value),
          project = runtime.read();
        if (args.objectId) {
          const node = findNode(
            project.scene.objects,
            typeof args.objectId === 'string' ? args.objectId : '',
          );
          if (!node) throw new Error('Object not found');
          return {
            node,
            dimensions: objectDimensions(project.scene.objects, node),
          };
        }
        return {
          name: project.name,
          view: project.scene.view,
          activeArrangement: project.activeArrangement,
          arrangements: project.arrangements.map((a) => ({
            id: a.id,
            name: a.name,
          })),
          objects: project.scene.objects.map((n) => ({
            id: n.id,
            name: n.name,
            kind: n.geometry.kind,
            children: n.children.length,
          })),
          objectCount: flattenNodes(project.scene.objects).length,
          status: runtime.status(),
        };
      },
    },
    {
      name: 'export_editor_project',
      description:
        'Return the complete portable JSON project, including all nested objects, edits, saved arrangements and camera.',
      inputSchema: objectSchema({}),
      annotations: { readOnlyHint: true },
      execute: () => ({ json: exportProject(runtime.read()) }),
    },
    {
      name: 'edit_editor_object',
      description:
        'Edit an apartment object or any subpart; update name, precise physical dimensions along object axes, local position/rotation, independent color/material, visibility or lock; add, duplicate or delete. One undo step per operation.',
      inputSchema: objectSchema({
        action: {
          type: 'string',
          enum: ['update', 'add', 'duplicate', 'remove'],
        },
        id: { type: 'string' },
        catalog: { type: 'string', enum: catalog.map((c) => c.id) },
        name: { type: 'string' },
        size: {
          type: 'array',
          items: { type: 'number' },
          minItems: 3,
          maxItems: 3,
        },
        position: {
          type: 'array',
          items: { type: 'number' },
          minItems: 3,
          maxItems: 3,
        },
        rotation: {
          type: 'array',
          items: { type: 'number' },
          minItems: 3,
          maxItems: 3,
        },
        color: { type: 'string' },
        material: {
          type: 'string',
          enum: ['paint', 'wood', 'fabric', 'stone', 'metal', 'glass', 'light'],
        },
        visible: { type: 'boolean' },
        locked: { type: 'boolean' },
      }),
      annotations: { readOnlyHint: false },
      execute: (value) => {
        const args = input(value),
          project = runtime.read();
        if (
          Object.hasOwn(args, 'color') &&
          (typeof args.color !== 'string' || !/^#[\da-f]{6}$/i.test(args.color))
        )
          throw new Error('Invalid color');
        if (
          Object.hasOwn(args, 'material') &&
          ![
            'paint',
            'wood',
            'fabric',
            'stone',
            'metal',
            'glass',
            'light',
          ].includes(args.material as string)
        )
          throw new Error('Invalid material');
        if (
          args.action === 'remove' &&
          findNode(project.scene.objects, String(args.id))?.locked
        )
          throw new Error('Object is locked');
        let next: EditorProject;
        if (args.action === 'add') {
          if (!catalog.some((c) => c.id === args.catalog))
            throw new Error('Unknown catalog item');
          next = clone(project);
          const node = catalogObject(args.catalog as CatalogId);
          next.scene.objects.push(node);
          next.scene.view.selected = node.id;
        } else if (args.action === 'duplicate')
          next = duplicateNode(project, String(args.id));
        else if (args.action === 'remove')
          next = removeNode(project, String(args.id));
        else if (args.action === 'update')
          next = editNode(project, String(args.id), (node) => {
            if (node.locked && args.locked !== false)
              throw new Error('Object is locked');
            if (args.name !== undefined) node.name = args.name as string;
            if (args.position !== undefined)
              node.position = args.position as Vec3;
            if (args.rotation !== undefined)
              node.rotation = args.rotation as Vec3;
            if (args.size !== undefined) {
              if (
                !Array.isArray(args.size) ||
                args.size.length !== 3 ||
                args.size.some(
                  (n) => typeof n !== 'number' || !Number.isFinite(n) || n <= 0,
                )
              )
                throw new Error('Invalid dimensions');
              resizeObject(project.scene.objects, node, args.size as Vec3);
            }
            if (args.color !== undefined || args.material !== undefined)
              paintNode(
                node,
                (args.color ?? node.color) as string,
                args.material as MaterialKind | undefined,
              );
            if (args.visible !== undefined)
              node.visible = args.visible as boolean;
            if (args.locked !== undefined) node.locked = args.locked as boolean;
          });
        else throw new Error('Unknown action');
        next = validateProject(next);
        runtime.commit(next);
        return {
          selected: next.scene.view.selected,
          objects: flattenNodes(next.scene.objects).length,
        };
      },
    },
    {
      name: 'configure_editor_view',
      description:
        'Set visible 2D/3D mode, palette, lighting, cutaway, furniture, labels, grid, 2D zoom, selected object, or exact camera position/target. Does not change geometry.',
      inputSchema: objectSchema({
        mode: { type: 'string', enum: ['2d', '3d'] },
        palette: { type: 'string', enum: ['natural', 'warm', 'contrast'] },
        night: { type: 'boolean' },
        cutaway: { type: 'boolean' },
        furniture: { type: 'boolean' },
        labels: { type: 'boolean' },
        grid: { type: 'boolean' },
        planZoom: { type: 'number', minimum: 0.5, maximum: 3 },
        planOffset: {
          type: 'array',
          items: { type: 'number', minimum: -200, maximum: 200 },
          minItems: 2,
          maxItems: 2,
        },
        selected: { type: ['string', 'null'] },
        camera: {
          type: ['object', 'null'],
          properties: {
            position: {
              type: 'array',
              items: { type: 'number' },
              minItems: 3,
              maxItems: 3,
            },
            target: {
              type: 'array',
              items: { type: 'number' },
              minItems: 3,
              maxItems: 3,
            },
          },
          additionalProperties: false,
        },
      }),
      annotations: { readOnlyHint: false },
      execute: (value) => {
        const patch = input(value),
          project = runtime.read();
        if (
          Object.keys(patch).some((k) => !Object.hasOwn(project.scene.view, k))
        )
          throw new Error('Unknown view field');
        const next = validateProject({
          ...project,
          scene: {
            ...project.scene,
            view: { ...project.scene.view, ...patch },
          },
        });
        runtime.view(next.scene.view);
        return next.scene.view;
      },
    },
    {
      name: 'manage_editor_arrangement',
      description:
        'Save an independent full arrangement, replace the current saved arrangement, or open a saved arrangement. Opening restores geometry and view and is undoable.',
      inputSchema: objectSchema({
        action: { type: 'string', enum: ['save', 'replace', 'open'] },
        name: { type: 'string' },
        id: { type: 'string' },
      }),
      annotations: { readOnlyHint: false },
      execute: (value) => {
        const args = input(value);
        let next: EditorProject;
        if (args.action === 'open')
          next = loadArrangement(runtime.read(), String(args.id));
        else if (args.action === 'save' || args.action === 'replace')
          next = saveArrangement(
            runtime.read(),
            typeof args.name === 'string' ? args.name : '',
            args.action === 'replace',
          );
        else throw new Error('Unknown action');
        runtime.commit(next);
        return {
          active: next.activeArrangement,
          arrangements: next.arrangements.map((a) => ({
            id: a.id,
            name: a.name,
          })),
        };
      },
    },
    {
      name: 'import_editor_project',
      description:
        'Validate and open complete exported FlatPlan JSON. Invalid input leaves the current project untouched. Successful import is one undo step.',
      inputSchema: objectSchema({ json: { type: 'string' } }),
      annotations: { readOnlyHint: false },
      execute: (value) => {
        const args = input(value);
        if (typeof args.json !== 'string')
          throw new Error('JSON string required');
        const next = importProject(args.json);
        runtime.commit(next);
        return {
          name: next.name,
          objects: flattenNodes(next.scene.objects).length,
          arrangements: next.arrangements.length,
        };
      },
    },
    {
      name: 'editor_history',
      description: 'Undo or redo one completed editor operation.',
      inputSchema: objectSchema({
        action: { type: 'string', enum: ['undo', 'redo'] },
      }),
      annotations: { readOnlyHint: false },
      execute: (value) => {
        const args = input(value);
        if (args.action === 'undo') runtime.undo();
        else if (args.action === 'redo') runtime.redo();
        else throw new Error('Unknown action');
        return { accepted: true };
      },
    },
    {
      name: 'save_editor_project',
      description:
        'Flush the current project into this browser local storage. Report save status through get_editor_project.',
      inputSchema: objectSchema({}),
      annotations: { readOnlyHint: false },
      execute: () => {
        runtime.save();
        return { requested: true };
      },
    },
  ];
  for (const tool of tools)
    void Promise.resolve(
      context.registerTool(tool, { signal: lifecycle.signal }),
    ).catch((error) => {
      if (!lifecycle.signal.aborted)
        console.warn('Editor tools unavailable', error);
    });
  return () => lifecycle.abort();
}
