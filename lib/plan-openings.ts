import { baseNode } from './editor-seed.ts';
import type { SceneNode } from './editor-model.ts';
import type { PlanHole } from './plan-data.ts';

/** Source l/r is the side of the oriented wall; the second letter selects its hinge. */
export function addPlanDoor(node: SceneNode, hole: PlanHole, offset: number) {
  if (!['single', 'double', 'french_window'].includes(hole.type)) return;
  const pair = hole.type !== 'single';
  const side = hole.opening.startsWith('l') ? -1 : 1;
  const hinge = pair ? 'both' : hole.opening.endsWith('-r') ? 'end' : 'start';
  node.geometry.doorSwing = { hinge, side, offset };
  node.name = hole.type === 'french_window' ? 'Балконная дверь' : 'Дверь';
  const [w, h] = node.geometry.size;
  const leafWidth = pair ? w / 2 : w;
  // Balcony leaves replace the closed glazing; retain the existing outer frames.
  if (hole.type === 'french_window')
    node.children = node.children.filter(
      (c) =>
        c.name !== 'Стекло' &&
        !(c.name === 'Вертикальная рама' && c.position[0] === 0),
    );
  for (const end of pair ? [-1, 1] : [hinge === 'start' ? -1 : 1]) {
    const leaf = baseNode(
      `${node.id}-leaf-${end === -1 ? 'start' : 'end'}`,
      'Дверное полотно',
      { kind: 'box', size: [leafWidth, h, hole.frameDepth / 100] },
      'structure',
    );
    leaf.position = [
      (end * w) / 2 - (end * leafWidth) / (2 * Math.sqrt(2)),
      h / 2,
      offset + (side * leafWidth) / (2 * Math.sqrt(2)),
    ];
    leaf.rotation[1] = side * end * 45;
    leaf.color = hole.type === 'french_window' ? '#b5d6df' : '#ede7dc';
    leaf.material = hole.type === 'french_window' ? 'glass' : 'wood';
    node.children.push(leaf);
  }
}
