import * as THREE from 'three';
import type { Finish, WallFace } from './design-types.ts';
import type { SceneNode } from './editor-model.ts';
export function finishUV(
  position: THREE.Vector3,
  normal: THREE.Vector3,
  worldScale: THREE.Vector3,
  angle: number,
): [number, number] {
  const p = position.clone().multiply(worldScale),
    n = normal.clone().normalize();
  let u: number, v: number;
  if (Math.abs(n.y) > 0.5) {
    u = p.x;
    v = -p.z;
  } else if (Math.abs(n.z) >= Math.abs(n.x)) {
    u = p.x;
    v = p.y;
  } else {
    u = p.z;
    v = p.y;
  }
  const a = (angle * Math.PI) / 180;
  return [u * Math.cos(a) - v * Math.sin(a), u * Math.sin(a) + v * Math.cos(a)];
}
export function faceForNormal(normal: THREE.Vector3): WallFace {
  return Math.abs(normal.y) > 0.5
    ? 'top'
    : Math.abs(normal.z) >= Math.abs(normal.x)
      ? normal.z > 0
        ? 'front'
        : 'back'
      : 'edge';
}
/** Physical UVs and per-face material groups; hidden/profiler wall cutouts keep their original vertices. */
export function finishGeometry(
  geometry: THREE.BufferGeometry,
  node: SceneNode,
  scale: THREE.Vector3,
  offset = new THREE.Vector3(),
) {
  const geo = geometry.index ? geometry.toNonIndexed() : geometry;
  if (geo !== geometry) geometry.dispose();
  const position = geo.getAttribute('position'),
    normal = geo.getAttribute('normal'),
    uv = new Float32Array(position.count * 2);
  const faces: WallFace[] = ['front', 'back', 'top', 'edge'];
  geo.clearGroups();
  for (let i = 0; i < position.count; i += 3) {
    const n = new THREE.Vector3(normal.getX(i), normal.getY(i), normal.getZ(i)),
      face = faceForNormal(n),
      finish = node.surfaces?.[face] ?? node.finish;
    const index = faces.indexOf(face);
    geo.addGroup(i, 3, index);
    for (let j = i; j < i + 3; j++) {
      const p = new THREE.Vector3(
          position.getX(j),
          position.getY(j),
          position.getZ(j),
        ).add(offset),
        pair = finishUV(p, n, scale, finish?.angle ?? 0);
      uv[j * 2] = pair[0];
      uv[j * 2 + 1] = pair[1];
    }
  }
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return geo;
}
export function finishTexture(
  f: Finish,
  oak: THREE.Texture | null,
  bump = false,
): THREE.Texture {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 256;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = bump ? '#b0b0b0' : f.color;
  ctx.fillRect(0, 0, 256, 256);
  if (f.kind === 'oak' && oak?.image && !bump) {
    ctx.save();
    ctx.translate(256, 0);
    ctx.rotate(Math.PI / 2);
    ctx.drawImage(oak.image as CanvasImageSource, 0, 0, 256, 256);
    ctx.restore();
    ctx.globalCompositeOperation = 'multiply';
    ctx.fillStyle = f.color;
    ctx.fillRect(0, 0, 256, 256);
    ctx.globalCompositeOperation = 'source-over';
  }
  let seed = 23117;
  const random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  const image = ctx.getImageData(0, 0, 256, 256);
  for (let y = 0; y < 256; y++)
    for (let x = 0; x < 256; x++) {
      const i = (y * 256 + x) * 4;
      const noise =
        (random() - 0.5) *
        (f.kind === 'paint' ? 10 : f.kind === 'stone' ? 18 : 9);
      const weave =
        f.kind === 'fabric' ? (x % 4 < 2 ? 5 : -5) + (y % 4 < 2 ? 5 : -5) : 0;
      const grain =
        f.kind === 'oak' && (bump || !oak)
          ? Math.sin(y * 0.44 + Math.sin(x * 0.02) * 3) * 9
          : 0;
      const vein =
        f.kind === 'stone'
          ? Math.sin(x * 0.035 + y * 0.08 + Math.sin(y * 0.025) * 2) * 7
          : 0;
      for (let c = 0; c < 3; c++)
        image.data[i + c] = Math.max(
          0,
          Math.min(255, image.data[i + c] + noise + weave + grain + vein),
        );
    }
  ctx.putImageData(image, 0, 0);
  if ((f.kind === 'tile' || f.kind === 'oak') && f.joint > 0) {
    ctx.fillStyle = bump ? '#353535' : f.jointColor;
    const x = Math.min(64, (256 * f.joint) / f.width),
      y = Math.min(64, (256 * f.joint) / f.height);
    ctx.fillRect(0, 0, x, 256);
    ctx.fillRect(0, 0, 256, y);
  }
  const t = new THREE.CanvasTexture(canvas);
  t.colorSpace = bump ? THREE.NoColorSpace : THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(1 / f.width, 1 / f.height);
  t.anisotropy = 4;
  return t;
}
