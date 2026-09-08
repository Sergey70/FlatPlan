import { baseNode, makeOpening } from '../lib/editor-seed.ts';
import { createPlanProject } from '../lib/plan-project.ts';
import {
  defaultView,
  validateProject,
  flattenNodes,
} from '../lib/editor-model.ts';
export function designFixture() {
  const p = createPlanProject();
  const floor = baseNode(
    'design-floor',
    'Пол — Кухня',
    {
      kind: 'floor',
      holes: [],
      size: [6, 0.1, 6],
      polygon: [
        [0, 0],
        [6, 0],
        [6, 6],
        [0, 6],
      ],
    },
    'structure',
  );
  floor.position[1] = -0.1;
  const a = baseNode('design-a', 'Тумба A', { kind: 'box', size: [1, 1, 1] });
  a.position = [2, 0.5, 2];
  const b = baseNode('design-b', 'Тумба B', { kind: 'box', size: [1, 1, 1] });
  b.position = [3.5, 0.5, 2];
  const w = baseNode(
    'design-wall',
    'Южная стена с окном',
    {
      kind: 'wall',
      size: [6, 2.7, 0.2],
      wallProfile: [
        [-0.5, -0.5],
        [0.5, -0.5],
        [0.5, 0.5],
        [-0.5, 0.5],
      ],
    },
    'structure',
  );
  w.position = [0, 0, 3];
  w.rotation[1] = 90;
  const window = makeOpening(2, 1.6, 0.2, 'window');
  window.id = 'design-window';
  window.position = [0, 0.65, 0];
  w.children = [window];
  const north = baseNode(
    'design-north',
    'Северная стена',
    { kind: 'wall', size: [6, 2.7, 0.2] },
    'structure',
  );
  north.position = [6, 0, 3];
  north.rotation[1] = 90;
  const rear = baseNode(
    'design-rear',
    'Стена с дверью',
    { kind: 'wall', size: [6, 2.7, 0.2] },
    'structure',
  );
  rear.position = [3, 0, 0];
  const door = makeOpening(1.2, 2.1, 0.2, 'door');
  door.geometry.doorSwing = { hinge: 'start', side: 1, offset: 0 };
  door.id = 'design-door';
  const leaf = baseNode(
    'design-leaf',
    'Полотно двери',
    { kind: 'box', size: [1.13, 2.1, 0.04] },
    'structure',
  );
  leaf.position = [-0.2, 1.05, 0.4];
  leaf.rotation[1] = -45;
  door.children.push(leaf);
  rear.children = [door];
  const front = baseNode(
    'design-front',
    'Стена напротив двери',
    { kind: 'wall', size: [6, 2.7, 0.2] },
    'structure',
  );
  front.position = [3, 0, 6];
  p.scene = {
    objects: [floor, w, north, rear, front, a, b],
    view: { ...defaultView(), mode: '2d', labels: false },
  };
  let index = 0;
  for (const { node } of flattenNodes(p.scene.objects))
    if (!node.id.startsWith('design-')) node.id = `design-part-${index++}`;
  p.activeArrangement = 'design-fixture';
  p.arrangements = [
    {
      id: p.activeArrangement,
      name: 'Проверка проектирования',
      scene: structuredClone(p.scene),
    },
  ];
  return validateProject(p);
}
