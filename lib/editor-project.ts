import { polygonContains } from './apartment.ts';
import {
  clone,
  findNode,
  validateProject,
  persistProject,
  ROOM_WORKSPACE_STORAGE_KEY,
  type Arrangement,
  type EditorProject,
  type StoragePort,
} from './editor-model.ts';
import {
  createPlanProject,
  DEFAULT_PLAN_ID,
  planLayouts,
} from './plan-project.ts';
import { createRoomProposalScene, ROOM_REPLACED_IDS } from './room-proposal.ts';

// This is an editor default, not a revision of the supplied .plan or gallery assets.
export function createDefaultProject(): EditorProject {
  return upgradeRoomWorkspace(createPlanProject());
}

// Node and Chromium differ only by floating-point round-off in source transforms.
function same(a: unknown, b: unknown): boolean {
  if (typeof a === 'number' && typeof b === 'number')
    return Math.abs(a - b) < 1e-8;
  if (a && b && typeof a === 'object' && typeof b === 'object') {
    const left = a as Record<string, unknown>,
      right = b as Record<string, unknown>;
    return (
      Object.keys(left).length === Object.keys(right).length &&
      Object.keys(left).every(
        (key) => Object.hasOwn(right, key) && same(left[key], right[key]),
      )
    );
  }
  return a === b;
}

/** Upgrade only the untouched starter room; never rewrite a custom furniture study. */
export function upgradeRoomWorkspace(project: EditorProject): EditorProject {
  const source = createPlanProject().scene;
  const proposal = createRoomProposalScene();
  const room = planLayouts[0].rooms.find((r) => r.area === 14.91)!;
  const inside = (position: number[]) =>
    polygonContains(room.polygon, [position[0] * 100, position[2] * 100]);
  const roomItems = source.objects.filter(
    (n) =>
      ROOM_REPLACED_IDS.includes(n.id) ||
      (n.category === 'furniture' && inside(n.position)),
  );
  const sourceIds = new Set(source.objects.map((n) => n.id));
  const added = proposal.objects.filter((n) => !sourceIds.has(n.id));
  const next = clone(project);
  function update(scene: Arrangement) {
    if (!roomItems.every((n) => same(findNode(scene.objects, n.id), n))) return;
    // An added desk, wall or other object in this room is a deliberate user layout.
    if (scene.objects.some((n) => !sourceIds.has(n.id) && inside(n.position)))
      return;
    scene.objects = scene.objects.filter(
      (n) => !ROOM_REPLACED_IDS.includes(n.id),
    );
    scene.objects.push(...clone(added));
    if (scene.view.selected && !findNode(scene.objects, scene.view.selected))
      scene.view.selected = null;
  }
  if (
    next.activeArrangement === DEFAULT_PLAN_ID ||
    next.activeArrangement === null
  )
    update(next.scene);
  const starter = next.arrangements.find((a) => a.id === DEFAULT_PLAN_ID);
  if (starter) update(starter.scene);
  return validateProject(next);
}

/** Mark only a successfully saved editor session. Later explicit imports stay exact. */
export function persistEditorProject(
  storage: StoragePort,
  project: EditorProject,
) {
  persistProject(storage, project);
  storage.setItem(ROOM_WORKSPACE_STORAGE_KEY, '1');
}
