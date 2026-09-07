import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { planShape } from './apartment-geometry.ts';
import { palettes, type Point } from './apartment.ts';
import {
  findParent,
  type SceneNode,
  type EditorView,
  type Vec3,
} from './editor-model.ts';

export function nodeColor(node: SceneNode, view: Pick<EditorView, 'palette'>) {
  return node.role ? palettes[view.palette][node.role] : node.color;
}
export function nodeMatrix(node: SceneNode) {
  return new THREE.Matrix4().compose(
    new THREE.Vector3(...node.position),
    new THREE.Quaternion().setFromEuler(
      new THREE.Euler(...(node.rotation.map(THREE.MathUtils.degToRad) as Vec3)),
    ),
    new THREE.Vector3(...node.scale),
  );
}
export function createNodeGeometry(
  node: SceneNode,
): THREE.BufferGeometry | null {
  const g = node.geometry,
    [w, h, d] = g.size;
  if (g.kind === 'group' || g.kind === 'opening' || g.kind === 'wall')
    return null;
  if (g.kind === 'floor') {
    const geo = new THREE.ExtrudeGeometry(planShape(g.polygon!, g.holes), {
      depth: h,
      bevelEnabled: false,
    });
    geo.rotateX(-Math.PI / 2);
    return geo;
  }
  if (g.kind === 'solid') {
    const geo = new THREE.ExtrudeGeometry(planShape(g.polygon!, g.holes), {
      depth: h,
      bevelEnabled: false,
    });
    geo.rotateX(-Math.PI / 2);
    return geo;
  }
  if (g.kind === 'sphere') {
    const geo = new THREE.SphereGeometry(0.5, 16, 12);
    geo.scale(w, h, d);
    return geo;
  }
  if (g.kind === 'cylinder') {
    const geo = new THREE.CylinderGeometry(
      (g.topRadius ?? 1) / 2,
      (g.bottomRadius ?? 1) / 2,
      1,
      24,
    );
    geo.scale(w, h, d);
    return geo;
  }
  return g.radius
    ? new RoundedBoxGeometry(
        w,
        h,
        d,
        2,
        Math.min(g.radius, w / 3, h / 3, d / 3),
      )
    : new THREE.BoxGeometry(w, h, d);
}
export interface WallBlock {
  position: Vec3;
  size: Vec3;
  planVisible: boolean;
}
export function wallBlocks(node: SceneNode, cutaway = false): WallBlock[] {
  const [width, fullHeight, depth] = node.geometry.size,
    blocks: WallBlock[] = [];
  const height =
    cutaway && node.cutaway ? Math.min(0.24, fullHeight) : fullHeight;
  function add(from: number, to: number, bottom: number, top: number) {
    top = Math.min(top, height);
    if (to - from > 0.00001 && top - bottom > 0.00001)
      blocks.push({
        position: [(from + to) / 2, (bottom + top) / 2, 0],
        size: [to - from, top - bottom, depth],
        planVisible: bottom < 0.001,
      });
  }
  let cursor = -width / 2;
  for (const o of node.children
    .filter((n) => n.visible && n.geometry.kind === 'opening')
    .sort((a, b) => a.position[0] - b.position[0])) {
    const w = o.geometry.size[0] * o.scale[0],
      h = o.geometry.size[1] * o.scale[1],
      left = o.position[0] - w / 2,
      right = left + w;
    add(cursor, left, 0, fullHeight);
    add(left, right, 0, o.position[1]);
    add(left, right, o.position[1] + h, fullHeight);
    cursor = right;
  }
  add(cursor, width / 2, 0, fullHeight);
  return blocks;
}
export function localBounds(node: SceneNode): THREE.Box3 {
  const bounds = new THREE.Box3();
  if (['wall', 'opening'].includes(node.geometry.kind)) {
    const [w, h, d] = node.geometry.size;
    bounds.set(
      new THREE.Vector3(-w / 2, 0, -d / 2),
      new THREE.Vector3(w / 2, h, d / 2),
    );
  } else {
    const g = createNodeGeometry(node);
    if (g) {
      g.computeBoundingBox();
      bounds.copy(g.boundingBox!);
      g.dispose();
    }
  }
  if (!['wall', 'opening'].includes(node.geometry.kind))
    for (const child of node.children)
      bounds.union(localBounds(child).applyMatrix4(nodeMatrix(child)));
  if (bounds.isEmpty())
    bounds.set(
      new THREE.Vector3(-0.05, 0, -0.05),
      new THREE.Vector3(0.05, 0.1, 0.05),
    );
  return bounds;
}
export function nodeDimensions(node: SceneNode): Vec3 {
  return localBounds(node)
    .getSize(new THREE.Vector3())
    .multiply(new THREE.Vector3(...node.scale))
    .toArray();
}
export function resizeNode(node: SceneNode, dimensions: Vec3) {
  if (node.geometry.kind === 'wall') {
    node.geometry.size = dimensions.map((n, i) => n / node.scale[i]) as Vec3;
    return;
  }
  const current = nodeDimensions(node);
  node.scale = node.scale.map(
    (scale, i) => (dimensions[i] / Math.max(current[i], 0.001)) * scale,
  ) as Vec3;
}
export function nodeWorldMatrix(
  nodes: SceneNode[],
  id: string,
  parent = new THREE.Matrix4(),
): THREE.Matrix4 | undefined {
  for (const node of nodes) {
    const matrix = parent.clone().multiply(nodeMatrix(node));
    if (node.id === id) return matrix;
    const found = nodeWorldMatrix(node.children, id, matrix);
    if (found) return found;
  }
}
/** Physical lengths along the selected object's axes, including parent transforms. */
function inheritedAxisScale(nodes: SceneNode[], node: SceneNode): Vec3 {
  const parent = findParent(nodes, node.id);
  const matrix = (
    parent ? nodeWorldMatrix(nodes, parent.id)! : new THREE.Matrix4()
  ).multiply(nodeMatrix(node));
  return [0, 1, 2].map(
    (i) =>
      new THREE.Vector3().setFromMatrixColumn(matrix, i).length() /
      node.scale[i],
  ) as Vec3;
}
export function objectDimensions(nodes: SceneNode[], node: SceneNode): Vec3 {
  const inherited = inheritedAxisScale(nodes, node);
  return nodeDimensions(node).map((d, i) => d * inherited[i]) as Vec3;
}
export function resizeObject(
  nodes: SceneNode[],
  node: SceneNode,
  dimensions: Vec3,
) {
  const inherited = inheritedAxisScale(nodes, node);
  resizeNode(node, dimensions.map((d, i) => d / inherited[i]) as Vec3);
}
export interface DrawingPart {
  id: string;
  rootId: string;
  points: Point[];
  holes: Point[][];
  color: string;
  kind: string;
  category: SceneNode['category'];
  height: number;
}
function hull(points: Point[]): Point[] {
  const sorted = points.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (a: Point, b: Point, c: Point) =>
    (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
  const lower: Point[] = [],
    upper: Point[] = [];
  for (const point of sorted) {
    while (lower.length >= 2 && cross(lower.at(-2)!, lower.at(-1)!, point) <= 0)
      lower.pop();
    lower.push(point);
  }
  for (const point of sorted.reverse()) {
    while (upper.length >= 2 && cross(upper.at(-2)!, upper.at(-1)!, point) <= 0)
      upper.pop();
    upper.push(point);
  }
  return [...lower.slice(0, -1), ...upper.slice(0, -1)];
}
export function planDrawing(
  nodes: SceneNode[],
  view: Pick<EditorView, 'palette' | 'furniture'>,
): DrawingPart[] {
  const parts: DrawingPart[] = [];
  function walk(node: SceneNode, parent: THREE.Matrix4, rootId: string) {
    if (!node.visible || (!view.furniture && node.category === 'furniture'))
      return;
    const matrix = parent.clone().multiply(nodeMatrix(node));
    function add(points: Point[], holes: Point[][] = [], height = 0) {
      parts.push({
        id: node.id,
        rootId,
        points,
        holes,
        color: nodeColor(node, view),
        kind: node.geometry.kind,
        category: node.category,
        height,
      });
    }
    function project(points: Point[], y = 0) {
      return points.map(([x, z]) => {
        const p = new THREE.Vector3(x, y, z).applyMatrix4(matrix);
        return [p.x, p.z] as Point;
      });
    }
    if (node.geometry.polygon)
      add(
        project(node.geometry.polygon),
        node.geometry.holes?.map((h) => project(h)) ?? [],
        node.position[1],
      );
    else if (node.geometry.kind === 'wall')
      for (const block of wallBlocks(node)) {
        if (!block.planVisible) continue;
        const [x, y, z] = block.position,
          [w, , d] = block.size;
        add(
          project(
            [
              [x - w / 2, z - d / 2],
              [x + w / 2, z - d / 2],
              [x + w / 2, z + d / 2],
              [x - w / 2, z + d / 2],
            ],
            y,
          ),
          [],
          y,
        );
      }
    else if (
      node.geometry.kind === 'opening' &&
      node.geometry.openingType === 'window'
    ) {
      const [w, h, d] = node.geometry.size;
      add(
        project(
          [
            [-w / 2, -d / 2],
            [w / 2, -d / 2],
            [w / 2, d / 2],
            [-w / 2, d / 2],
          ],
          h,
        ),
        [],
        // The window symbol must remain above the projected horizontal frame.
        new THREE.Vector3(0, h + 0.1, 0).applyMatrix4(matrix).y,
      );
    } else {
      const geo = createNodeGeometry(node);
      if (geo) {
        geo.computeBoundingBox();
        const box = geo.boundingBox!;
        const points: Point[] = [];
        let height = -Infinity;
        for (const x of [box.min.x, box.max.x])
          for (const y of [box.min.y, box.max.y])
            for (const z of [box.min.z, box.max.z]) {
              const p = new THREE.Vector3(x, y, z).applyMatrix4(matrix);
              points.push([p.x, p.z]);
              height = Math.max(height, p.y);
            }
        add(hull(points), [], height);
        geo.dispose();
      }
    }
    for (const child of node.children) walk(child, matrix, rootId);
  }
  for (const node of nodes) walk(node, new THREE.Matrix4(), node.id);
  return parts.sort((a, b) => a.height - b.height);
}
export function sceneBounds(nodes: SceneNode[], furniture = true): THREE.Box3 {
  const result = new THREE.Box3();
  for (const node of nodes)
    if (node.visible && (furniture || node.category === 'structure'))
      result.union(localBounds(node).applyMatrix4(nodeMatrix(node)));
  if (result.isEmpty())
    result.set(new THREE.Vector3(0, 0, 0), new THREE.Vector3(8, 3, 9));
  return result;
}
