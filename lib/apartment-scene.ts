import * as THREE from 'three';
import { fitCamera, apartmentBounds } from './camera-fit';
import { createTapTracker } from './tap-tracker';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import {
  apartment,
  rooms,
  palettes,
  defaultOptions,
  formatArea,
  roomArea,
  type RoomId,
  type SceneOptions,
} from './apartment';

export interface ApartmentScene {
  setOptions(options: SceneOptions): void;
  selectRoom(room: RoomId | null): void;
  reset(): void;
  zoom(factor: number): void;
  dispose(): void;
}

type Callbacks = {
  onSelect: (room: RoomId) => void;
  onError: (message: string | null) => void;
};

export function createApartmentScene(
  host: HTMLElement,
  callbacks: Callbacks,
): ApartmentScene {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#eef1f3');
  const renderer = new THREE.WebGLRenderer({
    antialias: true,
    powerPreference: 'high-performance',
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.domElement.setAttribute(
    'aria-label',
    'Трёхмерная модель демонстрационной квартиры. Управление видом доступно кнопками рядом с моделью.',
  );
  renderer.domElement.setAttribute('role', 'img');
  host.appendChild(renderer.domElement);
  const camera = new THREE.PerspectiveCamera(36, 1, 0.1, 100);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = !window.matchMedia(
    '(prefers-reduced-motion: reduce)',
  ).matches;
  controls.dampingFactor = 0.1;
  controls.minDistance = 5;
  controls.maxDistance = 32;
  controls.maxPolarAngle = Math.PI / 2.15;
  controls.minPolarAngle = 0.05;
  controls.enablePan = true;
  controls.target.set(4.5, 0.3, 3.5);
  camera.position.set(-8.5, 14.5, 17.8);
  controls.update();
  let selectedRoom: RoomId | null = null;
  let options: SceneOptions = { ...defaultOptions };
  let dirty = true;
  let disposed = false;
  let frame = 0;
  const materials = new Set<THREE.Material>();
  const geometries = new Set<THREE.BufferGeometry>();
  const textures = new Set<THREE.Texture>();
  const geometryCache = new Map<string, THREE.BufferGeometry>();
  const mat = (
    color: THREE.ColorRepresentation,
    roughness = 0.75,
    metalness = 0,
  ) => {
    const result = new THREE.MeshStandardMaterial({
      color,
      roughness,
      metalness,
    });
    materials.add(result);
    return result;
  };
  const wood = mat('#c8a779', 0.52);
  const floorWood = mat('#dfc29a', 0.6);
  const stone = mat('#d4d0c7', 0.67);
  const wallMaterial = mat('#f2efe8', 0.92);
  const fabric = mat('#d5d5c9', 0.97);
  const accent = mat('#738170', 0.92);
  const porcelain = mat('#f4f2ed', 0.22);
  const black = mat('#252d30', 0.42, 0.35);
  const brass = mat('#b49560', 0.34, 0.65);
  const white = mat('#f6f3ed', 0.95);
  const glass = new THREE.MeshPhysicalMaterial({
    color: '#dbe7e9',
    transparent: true,
    opacity: 0.25,
    roughness: 0.1,
    metalness: 0.05,
    depthWrite: false,
  });
  materials.add(glass);
  const plantMat = mat('#52644b', 0.88);
  const soil = mat('#514332');
  const mattressMat = mat('#e9e5db');
  const screenMat = mat('#17232c', 0.19, 0.15);
  const glowMat = new THREE.MeshStandardMaterial({
    color: '#ffe5b4',
    emissive: '#ffd8a0',
    emissiveIntensity: 0.7,
    roughness: 0.6,
  });
  materials.add(glowMat);
  const loader = new THREE.TextureLoader();
  loader.load(
    `${import.meta.env.BASE_URL}textures/oak.jpg`,
    (texture) => {
      if (disposed) {
        texture.dispose();
        return;
      }
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
      texture.anisotropy = Math.min(
        renderer.capabilities.getMaxAnisotropy(),
        8,
      );
      wood.map = texture;
      wood.needsUpdate = true;
      const floorTexture = texture.clone();
      floorTexture.repeat.set(3, 2);
      floorTexture.needsUpdate = true;
      floorWood.map = floorTexture;
      floorWood.needsUpdate = true;
      textures.add(texture);
      textures.add(floorTexture);
      dirty = true;
    },
    undefined,
    () => {
      if (!disposed)
        callbacks.onError(
          'Текстура дерева не загрузилась. Модель доступна с однотонными материалами.',
        );
    },
  );

  function mesh(
    geometry: THREE.BufferGeometry,
    material: THREE.Material,
    parent: THREE.Object3D,
    x = 0,
    y = 0,
    z = 0,
  ) {
    geometries.add(geometry);
    const object = new THREE.Mesh(geometry, material);
    object.position.set(x, y, z);
    object.castShadow = true;
    object.receiveShadow = true;
    parent.add(object);
    return object;
  }
  function box(
    parent: THREE.Object3D,
    w: number,
    h: number,
    d: number,
    x: number,
    y: number,
    z: number,
    material: THREE.Material,
    radius = 0,
  ) {
    const key = `${w},${h},${d},${radius}`;
    let geometry = geometryCache.get(key);
    if (!geometry) {
      geometry = radius
        ? new RoundedBoxGeometry(
            w,
            h,
            d,
            2,
            Math.min(radius, w / 3, h / 3, d / 3),
          )
        : new THREE.BoxGeometry(w, h, d);
      geometryCache.set(key, geometry);
    }
    return mesh(geometry, material, parent, x, y, z);
  }
  function cylinder(
    parent: THREE.Object3D,
    r1: number,
    r2: number,
    h: number,
    x: number,
    y: number,
    z: number,
    material: THREE.Material,
  ) {
    return mesh(
      new THREE.CylinderGeometry(r1, r2, h, 24),
      material,
      parent,
      x,
      y,
      z,
    );
  }
  function sphere(
    parent: THREE.Object3D,
    x: number,
    y: number,
    z: number,
    radius: number,
    material: THREE.Material,
  ) {
    return mesh(
      new THREE.SphereGeometry(radius, 16, 12),
      material,
      parent,
      x,
      y,
      z,
    );
  }
  function group(parent: THREE.Object3D, x = 0, z = 0, angle = 0) {
    const g = new THREE.Group();
    g.position.set(x, 0, z);
    g.rotation.y = angle;
    parent.add(g);
    return g;
  }
  const ground = box(scene, 100, 0.1, 100, 4.5, -0.44, 3.5, mat('#eef1f3'));
  ground.castShadow = false;
  const grid = new THREE.GridHelper(50, 100, '#d8dfe3', '#e2e7ea');
  grid.position.set(4.5, -0.382, 3.5);
  scene.add(grid);
  geometries.add(grid.geometry);
  (Array.isArray(grid.material) ? grid.material : [grid.material]).forEach(
    (m) => materials.add(m),
  );
  box(scene, 9.32, 0.26, 7.32, 4.5, -0.19, 3.5, mat('#d8d4ca'), 0.06);
  box(scene, 9.35, 0.065, 7.35, 4.5, -0.34, 3.5, mat('#c7cbd0'), 0.025);
  const roomFloors: THREE.Mesh[] = [];
  for (const room of rooms) {
    const tile = room.id === 'bathroom' || room.id === 'hall';
    const floor = box(
      scene,
      room.width,
      0.06,
      room.depth,
      room.x + room.width / 2,
      -0.025,
      room.z + room.depth / 2,
      tile ? stone : floorWood,
    );
    floor.userData.room = room.id;
    roomFloors.push(floor);
    // Thin joints read as floorboards/tiles at close range without external meshes.
    const vertices: number[] = [];
    const pitch = tile ? 0.6 : 0.22;
    for (let x = room.x + pitch; x < room.x + room.width - 0.01; x += pitch) {
      vertices.push(x, 0.009, room.z, x, 0.009, room.z + room.depth);
    }
    if (tile) {
      for (let z = room.z + 0.6; z < room.z + room.depth; z += 0.6)
        vertices.push(room.x, 0.009, z, room.x + room.width, 0.009, z);
    } else {
      for (let col = 0; col < room.width / pitch; col++) {
        for (
          let z = room.z + 0.8 + (col % 3) * 0.48;
          z < room.z + room.depth;
          z += 1.65
        ) {
          vertices.push(
            room.x + col * pitch,
            0.009,
            z,
            Math.min(room.x + (col + 1) * pitch, room.x + room.width),
            0.009,
            z,
          );
        }
      }
    }
    const joints = new THREE.BufferGeometry().setAttribute(
      'position',
      new THREE.Float32BufferAttribute(vertices, 3),
    );
    const jointMat = new THREE.LineBasicMaterial({
      color: tile ? '#b9b4aa' : '#ae906b',
      transparent: true,
      opacity: 0.29,
    });
    materials.add(jointMat);
    geometries.add(joints);
    scene.add(new THREE.LineSegments(joints, jointMat));
  }
  const permanentWalls = new THREE.Group();
  scene.add(permanentWalls);
  const cutawayWalls = new THREE.Group();
  scene.add(cutawayWalls);
  const wallItems: { object: THREE.Mesh; fullHeight: number; base: number }[] =
    [];
  function wall(
    w: number,
    d: number,
    x: number,
    z: number,
    cut: boolean,
    height = apartment.ceiling,
    base = 0,
  ) {
    const object = box(
      cut ? cutawayWalls : permanentWalls,
      w,
      height,
      d,
      x,
      base + height / 2,
      z,
      wallMaterial,
    );
    if (cut) wallItems.push({ object, fullHeight: height, base });
    return object;
  }
  // Back wall with actual window openings, rather than glass pasted over a wall.
  wall(9.16, 0.16, 4.5, 0, false, 0.88);
  wall(9.16, 0.16, 4.5, 0, false, 0.35, 2.45);
  for (const [x, width] of [
    [0.7, 1.4],
    [4.65, 2.1],
    [8.75, 0.5],
  ])
    wall(width, 0.16, x, 0, false, 1.57, 0.88);
  function windowAt(x: number, width: number) {
    box(permanentWalls, width, 0.06, 0.25, x, 0.9, 0.01, white);
    box(permanentWalls, width, 0.05, 0.12, x, 2.44, 0, white);
    for (const offset of [-width / 2, 0, width / 2])
      box(permanentWalls, 0.045, 1.55, 0.12, x + offset, 1.68, 0, white);
    box(permanentWalls, width, 1.48, 0.015, x, 1.67, -0.005, glass).castShadow =
      false;
  }
  windowAt(2.5, 2.2);
  windowAt(7.1, 2.8);
  // Exterior entry on the right connects to the central hall.
  wall(0.16, 3.8, 9, 1.9, false);
  wall(0.16, 2.25, 9, 5.875, false);
  wall(0.16, 0.95, 9, 4.275, false, 0.6, 2.2);
  wall(0.16, 7.16, 0, 3.5, true);
  wall(9.16, 0.16, 4.5, 7, true);
  // Central circulation connects all rooms independently.
  wall(0.14, 3.75, 5.4, 1.875, true);
  wall(0.14, 2.3, 5.4, 5.85, true);
  wall(0.14, 0.95, 5.4, 4.225, true, 0.65, 2.15);
  for (const z of [3.6, 5.1]) {
    wall(2.05, 0.14, 6.425, z, true);
    wall(0.65, 0.14, 8.675, z, true);
    wall(0.9, 0.14, 7.9, z, true, 0.65, 2.15);
  }
  // Door leaves are independent from furniture visibility.
  const doors = new THREE.Group();
  scene.add(doors);
  const doorMat = mat('#e2d8c7');
  const entryDoor = group(doors, 9, 3.8, -Math.PI + 0.5);
  box(entryDoor, 0.9, 2.12, 0.05, 0.45, 1.06, 0, doorMat);
  for (const [x, z, angle] of [
    [7.45, 3.6, 0.8],
    [8.35, 5.1, -Math.PI + 0.8],
  ]) {
    const door = group(doors, x, z, angle);
    box(door, 0.88, 2.1, 0.045, 0.44, 1.05, 0, doorMat);
    box(door, 0.12, 0.025, 0.08, 0.73, 1.02, 0.045, brass);
  }
  const furniture = new THREE.Group();
  scene.add(furniture);
  function plant(
    parent: THREE.Object3D,
    x: number,
    z: number,
    scale = 1,
    y = 0,
  ) {
    const p = group(parent, x, z);
    p.position.y = y;
    p.scale.setScalar(scale);
    cylinder(p, 0.18, 0.135, 0.32, 0, 0.16, 0, mat('#b8a08a'));
    cylinder(p, 0.165, 0.165, 0.018, 0, 0.33, 0, soil);
    cylinder(p, 0.012, 0.019, 0.65, 0, 0.6, 0, plantMat);
    for (let i = 0; i < 8; i++) {
      const a = i * 2.4;
      const leaf = sphere(
        p,
        Math.sin(a) * 0.17,
        0.53 + i * 0.052,
        Math.cos(a) * 0.17,
        0.17,
        plantMat,
      );
      leaf.scale.set(0.55, 1.7, 0.55);
      leaf.rotation.z = Math.sin(a) * 0.65;
      leaf.rotation.x = Math.cos(a) * 0.65;
    }
  }
  function vase(parent: THREE.Object3D, x: number, y: number, z: number) {
    cylinder(parent, 0.055, 0.085, 0.2, x, y + 0.1, z, porcelain);
    for (let i = 0; i < 3; i++) {
      const stem = cylinder(
        parent,
        0.004,
        0.004,
        0.3,
        x + i * 0.018,
        y + 0.34,
        z,
        plantMat,
      );
      stem.rotation.z = (i - 1) * 0.18;
      sphere(parent, x + i * 0.025, y + 0.49, z, 0.032, white);
    }
  }
  // Kitchen: cabinetry, countertop, sink, hob, oven and upper storage.
  const kitchen = group(furniture, 0.2, 0.2);
  for (let i = 0; i < 7; i++) {
    const x = 0.36 + i * 0.67;
    box(kitchen, 0.65, 0.82, 0.61, x, 0.47, 0.31, i < 2 ? wood : accent, 0.018);
    box(kitchen, 0.42, 0.022, 0.033, x, 0.79, 0.64, brass);
    box(kitchen, 0.64, 0.69, 0.32, x, 1.94, 0.17, i < 2 ? wood : white, 0.012);
  }
  box(kitchen, 4.7, 0.055, 0.69, 2.37, 0.91, 0.35, stone, 0.018);
  box(kitchen, 4.72, 0.46, 0.04, 2.37, 1.17, -0.1, stone);
  box(kitchen, 4.5, 0.018, 0.028, 2.37, 1.575, 0.28, glowMat);
  box(kitchen, 0.68, 0.03, 0.47, 1.9, 0.955, 0.36, black, 0.012);
  for (const x of [1.72, 2.08])
    for (const z of [0.24, 0.49])
      cylinder(
        kitchen,
        0.085,
        0.085,
        0.008,
        x,
        0.977,
        z,
        mat('#465055', 0.22, 0.5),
      );
  box(kitchen, 0.52, 0.44, 0.025, 1.9, 0.44, 0.633, black, 0.02);
  box(kitchen, 0.48, 0.055, 0.035, 1.9, 0.69, 0.655, black);
  box(
    kitchen,
    0.56,
    0.015,
    0.41,
    3.23,
    0.95,
    0.34,
    mat('#8b9390', 0.25, 0.7),
    0.05,
  );
  box(
    kitchen,
    0.44,
    0.018,
    0.3,
    3.23,
    0.957,
    0.34,
    mat('#67716e', 0.4, 0.7),
    0.05,
  );
  cylinder(kitchen, 0.018, 0.018, 0.31, 3.23, 1.09, 0.1, brass);
  box(kitchen, 0.033, 0.033, 0.19, 3.23, 1.24, 0.18, brass, 0.012);
  box(kitchen, 0.63, 1.57, 0.64, 0.37, 0.91, 1.18, white, 0.025);
  box(kitchen, 0.035, 0.5, 0.04, 0.6, 1.04, 1.52, black);
  vase(kitchen, 4.2, 0.95, 0.33);
  // Round dining table, four curved chairs and a pendant.
  const dining = group(furniture, 3.15, 2.3);
  cylinder(dining, 0.72, 0.72, 0.065, 0, 0.77, 0, wood);
  cylinder(dining, 0.15, 0.29, 0.72, 0, 0.37, 0, wood);
  for (let i = 0; i < 4; i++) {
    const a = (i * Math.PI) / 2;
    const chair = group(dining, Math.sin(a) * 1.0, Math.cos(a) * 1.0, a);
    box(chair, 0.47, 0.11, 0.45, 0, 0.46, 0, fabric, 0.07);
    box(chair, 0.48, 0.35, 0.075, 0, 0.69, 0.19, wood, 0.035);
    for (const x of [-0.18, 0.18])
      for (const z of [-0.17, 0.17])
        cylinder(chair, 0.018, 0.025, 0.43, x, 0.22, z, wood);
  }
  cylinder(dining, 0.21, 0.21, 0.013, -0.2, 0.816, 0.07, porcelain);
  vase(dining, 0.13, 0.81, -0.12);
  const pendant = group(furniture, 3.15, 2.3);
  cylinder(pendant, 0.009, 0.009, 0.45, 0, 2.42, 0, black);
  cylinder(pendant, 0.18, 0.43, 0.23, 0, 2.09, 0, mat('#c5a47c', 0.93));
  cylinder(pendant, 0.37, 0.37, 0.025, 0, 1.97, 0, glowMat);
  // Living area: sectional sofa, woven rug, tables, sideboard and TV.
  box(furniture, 3.4, 0.025, 2.9, 2.68, 0.035, 5.24, mat('#ddd9cf', 1), 0.09);
  const sofa = group(furniture, 1.0, 5.15, -Math.PI / 2);
  box(sofa, 2.6, 0.31, 0.93, 0, 0.25, 0, fabric, 0.09);
  box(sofa, 2.6, 0.49, 0.2, 0, 0.62, 0.4, fabric, 0.065);
  for (const x of [-1.23, 1.23])
    box(sofa, 0.18, 0.42, 1.04, x, 0.47, -0.015, fabric, 0.06);
  for (const x of [-0.79, 0, 0.79]) {
    box(sofa, 0.74, 0.17, 0.75, x, 0.48, -0.07, fabric, 0.07);
    box(sofa, 0.68, 0.42, 0.17, x, 0.68, 0.25, mattressMat, 0.06).rotation.x =
      -0.13;
  }
  box(sofa, 0.43, 0.39, 0.16, -0.82, 0.72, 0.07, accent, 0.075).rotation.z =
    0.22;
  box(
    sofa,
    0.42,
    0.34,
    0.17,
    0.69,
    0.72,
    0.07,
    mat('#b88f74'),
    0.075,
  ).rotation.z = -0.25;
  box(sofa, 0.82, 0.44, 1.15, 0.78, 0.29, -0.69, fabric, 0.08);
  cylinder(furniture, 0.59, 0.59, 0.055, 2.9, 0.41, 5.08, wood);
  cylinder(furniture, 0.36, 0.41, 0.35, 2.9, 0.2, 5.08, wood);
  box(furniture, 0.27, 0.055, 0.36, 2.84, 0.468, 5.08, white, 0.01).rotation.y =
    0.25;
  cylinder(furniture, 0.07, 0.058, 0.1, 3.12, 0.49, 5.12, porcelain);
  const media = group(furniture, 4.98, 5.33, Math.PI / 2);
  box(media, 2.17, 0.43, 0.4, 0, 0.31, 0, wood, 0.026);
  for (const x of [-0.9, 0.9]) box(media, 0.04, 0.1, 0.31, x, 0.05, 0, black);
  box(media, 1.56, 0.88, 0.055, 0, 1.11, 0, black, 0.015);
  box(media, 1.46, 0.78, 0.008, 0, 1.12, 0.031, screenMat, 0.01);
  box(media, 0.035, 0.22, 0.03, 0, 0.61, 0, black);
  box(media, 0.37, 0.025, 0.21, 0, 0.51, 0, black);
  plant(furniture, 0.48, 3.0, 1.08);
  plant(furniture, 4.55, 6.57, 0.9);
  const lamp = group(furniture, 0.47, 6.55);
  cylinder(lamp, 0.19, 0.19, 0.025, 0, 0.025, 0, black);
  cylinder(lamp, 0.013, 0.013, 1.49, 0, 0.78, 0, brass);
  cylinder(lamp, 0.16, 0.25, 0.35, 0, 1.53, 0, white);
  // Bedroom.
  box(furniture, 2.8, 0.023, 2.85, 7.18, 0.03, 1.95, mat('#dcded4', 1), 0.025);
  box(furniture, 1.83, 0.3, 2.17, 7.15, 0.22, 1.83, wood, 0.04);
  box(furniture, 1.74, 0.25, 2.05, 7.15, 0.47, 1.83, mattressMat, 0.09);
  box(furniture, 1.96, 1.04, 0.13, 7.15, 0.59, 0.74, accent, 0.035);
  box(furniture, 1.76, 0.12, 1.39, 7.15, 0.625, 2.14, white, 0.08);
  box(furniture, 1.79, 0.05, 0.48, 7.15, 0.712, 2.53, accent, 0.022);
  for (const x of [6.73, 7.57])
    box(furniture, 0.69, 0.16, 0.47, x, 0.65, 1.19, white, 0.08);
  for (const x of [5.94, 8.36]) {
    box(furniture, 0.49, 0.46, 0.43, x, 0.26, 1.05, wood, 0.024);
    cylinder(furniture, 0.075, 0.12, 0.16, x, 0.59, 1.05, porcelain);
    cylinder(furniture, 0.12, 0.17, 0.18, x, 0.77, 1.05, white);
  }
  // Hall: built-in storage and bench.
  box(furniture, 1.63, 2.25, 0.39, 6.37, 1.13, 4.84, white, 0.013);
  for (const x of [5.97, 6.78])
    box(furniture, 0.02, 0.36, 0.025, x, 1.05, 4.63, brass);
  box(furniture, 0.86, 0.34, 0.38, 8.19, 0.24, 4.79, wood, 0.015);
  box(furniture, 0.84, 0.09, 0.39, 8.19, 0.455, 4.79, fabric, 0.025);
  // Bathroom: walk-in shower, vanity, round mirror, toilet, towels.
  const bathroom = group(furniture, 5.4, 5.1);
  box(bathroom, 1.03, 0.05, 1.65, 0.62, 0.04, 0.99, porcelain, 0.025);
  box(bathroom, 0.028, 1.95, 1.64, 1.16, 1.025, 0.99, glass).castShadow = false;
  cylinder(bathroom, 0.012, 0.012, 1.83, 0.16, 1.04, 0.55, brass);
  cylinder(bathroom, 0.14, 0.14, 0.025, 0.34, 1.97, 0.55, brass);
  box(bathroom, 0.19, 0.02, 0.025, 0.25, 1.95, 0.55, brass);
  box(bathroom, 1.08, 0.44, 0.45, 2.87, 0.56, 1.57, wood, 0.018);
  box(bathroom, 1.12, 0.04, 0.48, 2.87, 0.8, 1.57, stone, 0.012);
  cylinder(bathroom, 0.21, 0.17, 0.12, 2.84, 0.88, 1.57, porcelain);
  cylinder(bathroom, 0.012, 0.012, 0.21, 2.84, 0.99, 1.76, brass);
  const mirror = cylinder(
    bathroom,
    0.32,
    0.32,
    0.028,
    2.85,
    1.52,
    1.81,
    mat('#a7b9bd', 0.08, 0.7),
  );
  mirror.rotation.x = Math.PI / 2;
  box(bathroom, 0.41, 0.36, 0.21, 1.77, 0.42, 1.64, porcelain, 0.09);
  const toilet = sphere(bathroom, 1.77, 0.31, 1.35, 0.25, porcelain);
  toilet.scale.set(0.86, 1, 1.35);
  box(bathroom, 0.39, 0.05, 0.5, 1.77, 0.51, 1.36, white, 0.09);
  box(bathroom, 0.6, 0.025, 0.4, 2.77, 0.043, 0.66, mat('#c1c9c6', 1), 0.02);
  for (let i = 0; i < 3; i++)
    box(
      bathroom,
      0.27,
      0.045,
      0.19,
      3.21,
      0.85 + i * 0.045,
      1.55,
      i === 2 ? accent : white,
      0.02,
    );
  // Room labels remain legible independent of model complexity.
  const labelGroup = new THREE.Group();
  scene.add(labelGroup);
  for (const room of rooms) {
    const canvas = document.createElement('canvas');
    canvas.width = 640;
    canvas.height = 160;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = 'rgba(255,255,255,0.94)';
    ctx.beginPath();
    ctx.roundRect(3, 3, 634, 154, 25);
    ctx.fill();
    ctx.fillStyle = '#394850';
    ctx.textAlign = 'center';
    ctx.font = '500 44px -apple-system, Arial';
    ctx.fillText(room.shortName, 320, 67);
    ctx.fillStyle = '#77848c';
    ctx.font = '34px -apple-system, Arial';
    ctx.fillText(`${formatArea(roomArea(room))} м²`, 320, 118);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    textures.add(texture);
    const material = new THREE.SpriteMaterial({
      map: texture,
      depthTest: false,
      transparent: true,
    });
    materials.add(material);
    const sprite = new THREE.Sprite(material);
    sprite.scale.set(1.63, 0.4075, 1);
    sprite.position.set(room.x + room.width / 2, 1.15, room.z + room.depth / 2);
    sprite.renderOrder = 5;
    labelGroup.add(sprite);
  }
  const selection = box(
    scene,
    1,
    0.015,
    1,
    0,
    0.019,
    0,
    new THREE.MeshBasicMaterial({
      color: '#bb7043',
      transparent: true,
      opacity: 0.13,
      depthWrite: false,
    }),
  );
  materials.add(selection.material);
  selection.castShadow = false;
  selection.receiveShadow = false;
  selection.visible = false;
  const ambient = new THREE.HemisphereLight('#ffffff', '#bab5a7', 2.0);
  scene.add(ambient);
  const sun = new THREE.DirectionalLight('#fff4df', 3.5);
  sun.position.set(-3, 12, 8);
  sun.target.position.set(4, 0, 3);
  scene.add(sun, sun.target);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, {
    left: -10,
    right: 10,
    top: 10,
    bottom: -10,
    near: 0.5,
    far: 35,
  });
  sun.shadow.normalBias = 0.028;
  sun.shadow.bias = -0.0003;
  const fill = new THREE.DirectionalLight('#dceaf9', 1.2);
  fill.position.set(7, 6, -5);
  scene.add(fill);
  const practicals: THREE.PointLight[] = [];
  for (const [x, y, z] of [
    [3.15, 1.85, 2.3],
    [0.5, 1.4, 6.5],
    [7.2, 2, 1.8],
    [7.1, 2.1, 6.1],
  ]) {
    const light = new THREE.PointLight('#ffd49c', 0, 7, 2);
    light.position.set(x, y, z);
    scene.add(light);
    practicals.push(light);
  }
  function setOptions(next: SceneOptions) {
    options = { ...next };
    furniture.visible = options.furniture;
    labelGroup.visible = options.labels;
    for (const item of wallItems) {
      const visibleHeight = options.cutaway
        ? Math.min(0.24, item.fullHeight)
        : item.fullHeight;
      item.object.visible = !(options.cutaway && item.base > 0);
      item.object.scale.y = visibleHeight / item.fullHeight;
      item.object.position.y = item.base + visibleHeight / 2;
    }
    doors.visible = !options.cutaway;
    const palette = palettes[options.palette];
    wood.color.set(palette.wood);
    floorWood.color.set(palette.wood).lerp(new THREE.Color('#ffffff'), 0.25);
    stone.color.set(palette.stone);
    wallMaterial.color.set(palette.wall);
    fabric.color.set(palette.fabric);
    accent.color.set(palette.accent);
    ambient.intensity = options.night ? 0.65 : 2.0;
    sun.intensity = options.night ? 0.45 : 3.5;
    fill.intensity = options.night ? 0.35 : 1.2;
    glowMat.emissiveIntensity = options.night ? 2.8 : 0.7;
    practicals.forEach((light) => {
      light.intensity = options.night ? 22 : 0;
    });
    scene.background = new THREE.Color(options.night ? '#27343e' : '#eef1f3');
    (ground.material as THREE.MeshStandardMaterial).color.set(
      options.night ? '#374751' : '#eef1f3',
    );
    grid.visible = !options.night;
    dirty = true;
  }
  function selectRoom(id: RoomId | null) {
    selectedRoom = id;
    const room = rooms.find((r) => r.id === id);
    selection.visible = !!room;
    if (room) {
      selection.scale.set(room.width, 1, room.depth);
      selection.position.set(
        room.x + room.width / 2,
        0.019,
        room.z + room.depth / 2,
      );
      const fit = fitCamera(
        {
          min: [room.x, -0.1, room.z],
          max: [room.x + room.width, apartment.ceiling, room.z + room.depth],
        },
        camera.aspect,
        camera.fov,
      );
      controls.target.copy(fit.target);
      camera.position.copy(fit.position);
    } else {
      frameOverview();
    }
    controls.update();
    dirty = true;
  }
  function frameOverview() {
    const fit = fitCamera(apartmentBounds, camera.aspect, camera.fov);
    controls.target.copy(fit.target);
    camera.position.copy(fit.position);
    controls.maxDistance = Math.max(
      42,
      camera.position.distanceTo(controls.target) * 1.6,
    );
    controls.update();
    dirty = true;
  }
  function resize() {
    if (disposed) return;
    const { width, height } = host.getBoundingClientRect();
    if (!width || !height) return;
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height);
    if (selectedRoom === null) frameOverview();
    else selectRoom(selectedRoom);
    dirty = true;
  }
  const observer = new ResizeObserver(resize);
  observer.observe(host);
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  const taps = createTapTracker();
  const onDown = (event: PointerEvent) => {
    taps.down(event.pointerId, event.clientX, event.clientY, event.button);
  };
  const onCancel = (event: PointerEvent) => {
    taps.cancel(event.pointerId);
  };
  const onUp = (event: PointerEvent) => {
    if (!taps.up(event.pointerId, event.clientX, event.clientY)) return;
    const rect = renderer.domElement.getBoundingClientRect();
    pointer.set(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      -((event.clientY - rect.top) / rect.height) * 2 + 1,
    );
    raycaster.setFromCamera(pointer, camera);
    const hit = raycaster.intersectObjects(roomFloors)[0];
    if (hit) callbacks.onSelect(hit.object.userData.room as RoomId);
  };
  const onContextLost = (event: Event) => {
    event.preventDefault();
    callbacks.onError(
      '3D-контекст потерян. Можно открыть план сверху или перезагрузить страницу.',
    );
  };
  const onContextRestored = () => {
    dirty = true;
    callbacks.onError(null);
  };
  renderer.domElement.addEventListener('pointercancel', onCancel);
  renderer.domElement.addEventListener(
    'webglcontextrestored',
    onContextRestored,
  );
  renderer.domElement.addEventListener('pointerdown', onDown);
  renderer.domElement.addEventListener('pointerup', onUp);
  renderer.domElement.addEventListener('webglcontextlost', onContextLost);
  const onChange = () => {
    dirty = true;
  };
  controls.addEventListener('change', onChange);
  function animate() {
    if (disposed) return;
    frame = requestAnimationFrame(animate);
    if (host.offsetParent === null || document.hidden) return;
    const moved = controls.update();
    if (dirty || moved) {
      renderer.render(scene, camera);
      dirty = false;
    }
  }
  setOptions(options);
  resize();
  animate();
  return {
    setOptions,
    selectRoom,
    reset() {
      selectedRoom = null;
      selection.visible = false;
      frameOverview();
    },
    zoom(factor: number) {
      const offset = camera.position.clone().sub(controls.target);
      offset.setLength(
        THREE.MathUtils.clamp(
          offset.length() * factor,
          controls.minDistance,
          controls.maxDistance,
        ),
      );
      camera.position.copy(controls.target).add(offset);
      controls.update();
      dirty = true;
    },
    dispose() {
      disposed = true;
      cancelAnimationFrame(frame);
      observer.disconnect();
      controls.removeEventListener('change', onChange);
      controls.dispose();
      renderer.domElement.removeEventListener('pointerdown', onDown);
      renderer.domElement.removeEventListener('pointerup', onUp);
      renderer.domElement.removeEventListener(
        'webglcontextlost',
        onContextLost,
      );
      renderer.domElement.removeEventListener(
        'webglcontextrestored',
        onContextRestored,
      );
      renderer.domElement.removeEventListener('pointercancel', onCancel);
      geometries.forEach((g) => g.dispose());
      materials.forEach((m) => m.dispose());
      textures.forEach((t) => t.dispose());
      sun.shadow.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    },
  };
}
