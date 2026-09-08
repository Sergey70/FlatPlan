import rawDelta from './plan-update-010.json' with { type: 'json' };
import {
  clone,
  findNode,
  flattenNodes,
  validateProject,
  type Arrangement,
  type EditorProject,
  type SceneNode,
} from './editor-model.ts';

interface FieldChange {
  path: string[];
  before?: unknown;
  after?: unknown;
}
const delta = rawDelta as unknown as {
  updates: Record<string, FieldChange[]>;
  added: { parentId: string; node: SceneNode }[];
  removed: { parentId: string; node: SceneNode }[];
  retired: { id: string; scene: Arrangement }[];
};
/** A numeric tolerance accounts solely for Node/Chromium round-off. */
function same(a: unknown, b: unknown): boolean {
  if (typeof a === 'number' && typeof b === 'number')
    return Math.abs(a - b) < 1e-8;
  if (a && b && typeof a === 'object' && typeof b === 'object') {
    const left = a as Record<string, unknown>,
      right = b as Record<string, unknown>;
    const keys = Object.keys(left);
    return (
      keys.length === Object.keys(right).length &&
      keys.every((k) => Object.hasOwn(right, k) && same(left[k], right[k]))
    );
  }
  return a === b;
}

/** Three-way field update: source changes apply only to fields the user has not edited. */
export function refreshPlanGeometry(
  project: EditorProject,
  defaultId: string,
  defaultScene: Arrangement,
): EditorProject {
  const next = clone(project);
  function update(scene: Arrangement) {
    scene.objects = scene.objects.map((original) => {
      const root = clone(original);
      for (const { node } of flattenNodes([root])) {
        for (const change of delta.updates[node.id] ?? []) {
          let target = node as unknown as Record<string, unknown>;
          for (const key of change.path.slice(0, -1))
            target = target?.[key] as Record<string, unknown>;
          const key = change.path.at(-1)!;
          if (target && same(target[key], change.before)) {
            if (change.after === undefined) delete target[key];
            else target[key] = clone(change.after);
          }
        }
      }
      for (const { parentId, node } of delta.removed) {
        const parent = findNode([root], parentId);
        if (parent)
          parent.children = parent.children.filter(
            (n) => n.id !== node.id || !same(n, node),
          );
      }
      for (const { parentId, node } of delta.added) {
        const parent = findNode([root], parentId);
        if (parent && !findNode(scene.objects, node.id))
          parent.children.push(clone(node));
      }
      // A user's resized wall can make a source opening update invalid. Keep that
      // complete edited root instead of leaving an invalid or partly reset object.
      try {
        validateProject({
          ...project,
          arrangements: [],
          activeArrangement: null,
          scene: { objects: [root], view: { ...scene.view, selected: null } },
        });
        return root;
      } catch {
        return original;
      }
    });
    if (scene.view.selected && !findNode(scene.objects, scene.view.selected))
      scene.view.selected = null;
  }
  const retired = delta.retired.find((a) => a.id === next.activeArrangement);
  const switchToDefault =
    retired && same(next.scene.objects, retired.scene.objects);
  next.arrangements = next.arrangements.filter(
    (a) =>
      !delta.retired.some(
        (r) => r.id === a.id && same(a.scene.objects, r.scene.objects),
      ),
  );
  for (const a of next.arrangements) update(a.scene);
  if (switchToDefault) {
    next.scene = clone(
      next.arrangements.find((a) => a.id === defaultId)?.scene ?? defaultScene,
    );
    next.activeArrangement = next.arrangements.some((a) => a.id === defaultId)
      ? defaultId
      : null;
  } else {
    update(next.scene);
    if (
      next.activeArrangement &&
      !next.arrangements.some((a) => a.id === next.activeArrangement)
    )
      next.activeArrangement = null;
  }
  return next;
}
