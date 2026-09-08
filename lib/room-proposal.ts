import { baseNode } from './editor-seed.ts';
import {
  clone,
  validateProject,
  type SceneNode,
  type Vec3,
} from './editor-model.ts';
import {
  createPlanProject,
  planLayouts,
  planArrangementId,
} from './plan-project.ts';
import { planFurniture } from './plan-furniture.ts';

export const ROOM_PROPOSAL_REVISION = 'gallery-014';
export const ROOM_PROPOSAL_ID = 'room-014-workspace';
export const ROOM_REPLACED_IDS = [
  'plan-item-011',
  'plan-item-065',
  'plan-item-066',
  'plan-item-070',
];
export const ROOM_PROPOSAL_NOTE =
  'Комната 14,91 м²: кровать 90 × 200 см, стол 160 × 70 см, компьютер и два монитора. Кресло направлено к столу; экраны стоят боком к свету от лоджии. Это предлагаемая расстановка мебели.';

/** A separate furniture study; never changes the imported source or visitor saves. */
export function createRoomProposalScene() {
  const layout = planLayouts.find((l) => l.id === 'plan-2')!;
  const scene = createPlanProject().arrangements.find(
    (a) => a.id === planArrangementId(layout.id),
  )!.scene;
  scene.objects = scene.objects.filter(
    (n) => !ROOM_REPLACED_IDS.includes(n.id),
  );
  const desk = planFurniture(
    {
      id: 'proposal-desk',
      type: 'work_table',
      center: [340, 72],
      width: 160,
      depth: 70,
      height: 75,
      angle: 0,
      bottom: 0,
      hasBottom: true,
      mirrorX: 1,
      mirrorZ: 1,
    },
    2.7,
  );
  desk.name = 'Рабочий стол · 160 × 70 см';
  const chair = planFurniture(
    {
      id: 'proposal-chair',
      type: 'office_chair',
      center: [340, 149],
      width: 62,
      depth: 64,
      height: 115,
      angle: 180,
      bottom: 0,
      hasBottom: true,
      mirrorX: 1,
      mirrorZ: 1,
    },
    2.7,
  );
  chair.name = 'Рабочее кресло · лицом к столу';
  function part(
    id: string,
    name: string,
    size: Vec3,
    position: Vec3,
    color = '#252b30',
  ): SceneNode {
    const node = baseNode(`proposal-${id}`, name, { kind: 'box', size });
    node.position = position;
    node.color = color;
    node.material = 'metal';
    return node;
  }
  // Screen planes run along X, the glazing along Z: their normals are perpendicular.
  // Chair front is -Z, toward the screens; daylight arrives from -X, on the user's left.
  const monitors = [3.07, 3.73].map((x, i) => {
    const monitor = baseNode(
      `proposal-monitor-${i + 1}`,
      `Монитор ${i + 1} · 27″`,
      { kind: 'group', size: [0.61, 0.6, 0.25] },
    );
    monitor.position = [x, 0.75, 0.57];
    monitor.children = [
      part(
        `monitor-${i + 1}-base`,
        'Подставка',
        [0.22, 0.02, 0.22],
        [0, 0.01, 0],
      ),
      part(
        `monitor-${i + 1}-stand`,
        'Стойка',
        [0.035, 0.25, 0.035],
        [0, 0.145, -0.06],
      ),
      part(
        `monitor-${i + 1}-panel`,
        'Корпус экрана',
        [0.61, 0.35, 0.035],
        [0, 0.405, -0.06],
      ),
      part(
        `monitor-${i + 1}-screen`,
        'Экран · к рабочему креслу',
        [0.585, 0.325, 0.005],
        [0, 0.405, -0.04],
        '#394850',
      ),
    ];
    return monitor;
  });
  scene.objects.push(
    desk,
    chair,
    ...monitors,
    part(
      'computer',
      'Системный блок под столом',
      [0.22, 0.46, 0.42],
      [4.0, 0.23, 0.72],
    ),
    part('keyboard', 'Клавиатура', [0.44, 0.022, 0.15], [3.4, 0.763, 0.925]),
    part('mouse', 'Мышь', [0.065, 0.03, 0.11], [3.72, 0.768, 0.925]),
  );
  return scene;
}

export function usesRoomProposal(layoutId: string, shotId: string) {
  return layoutId === 'plan-2' && ['room', 'overview'].includes(shotId);
}
export function createGalleryScene(layoutId: string, shotId: string) {
  const layout = planLayouts.find((l) => l.id === layoutId);
  if (!layout) throw new Error(`Unknown gallery layout: ${layoutId}`);
  return usesRoomProposal(layoutId, shotId)
    ? createRoomProposalScene()
    : createPlanProject().arrangements.find(
        (a) => a.id === planArrangementId(layoutId),
      )!.scene;
}
export function createRoomProposalProject() {
  const project = createPlanProject();
  project.name = 'Квартира — комната с рабочим местом';
  project.scene = createRoomProposalScene();
  project.arrangements.push({
    id: ROOM_PROPOSAL_ID,
    name: 'Комната · кровать и рабочее место',
    scene: clone(project.scene),
  });
  project.activeArrangement = ROOM_PROPOSAL_ID;
  return validateProject(project);
}
