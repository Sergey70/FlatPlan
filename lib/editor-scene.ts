import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { TransformControls } from 'three/addons/controls/TransformControls.js';
import { finishGeometry, finishTexture } from './surface-finish';
import { sunDirection } from './sunlight';
import { defaultWalk } from './design-types';
import type { Finish, WallFace } from './design-types';
import {
  constrainedWalk,
  lookCamera,
  viewAngles,
  walkShapes,
} from './walkthrough';
import { createTapTracker } from './tap-tracker';
import { fitCamera } from './camera-fit';
import {
  createNodeGeometry,
  nodeColor,
  wallBlocks,
  wallBlockGeometry,
  sceneBounds,
  roomLabelPosition,
} from './editor-geometry';
import type { SceneNode, EditorView, CameraState, Vec3 } from './editor-model';
export type EditTool = 'orbit' | 'translate' | 'rotate';
export interface EditorScene {
  update(nodes: SceneNode[], view: EditorView): void;
  select(id: string | null, tool: EditTool, detail: boolean): void;
  camera(state: CameraState | null): void;
  focus(id?: string): void;
  viewpoint(kind: 'overview' | 'top' | 'living' | 'bedroom' | 'bathroom'): void;
  zoom(factor: number): void;
  snapshot(): Promise<Blob>;
  walkInput(forward: number, side: number, turn?: number): void;
  dispose(): void;
}
interface Callbacks {
  select(id: string | null): void;
  change(id: string, position: Vec3, rotation: Vec3): void;
  camera(state: CameraState): void;
  error(message: string | null): void;
  ready(): void;
}
export function createEditorScene(
  host: HTMLElement,
  callbacks: Callbacks,
  renderOptions: { fov?: number; ceilingHeight?: number } = {},
): EditorScene {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#eef1f3');
  const renderer = new THREE.WebGLRenderer({
    antialias: true,
    powerPreference: 'high-performance',
    preserveDrawingBuffer: true,
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.domElement.setAttribute('aria-label', '3D-редактор квартиры');
  host.appendChild(renderer.domElement);
  const camera = new THREE.PerspectiveCamera(
      renderOptions.fov ?? 40,
      1,
      0.03,
      500,
    ),
    orbit = new OrbitControls(camera, renderer.domElement);
  orbit.enableDamping = false;
  orbit.minDistance = 0.3;
  orbit.maxDistance = 150;
  orbit.maxPolarAngle = Math.PI / 2 + 0.03;
  const transform = new TransformControls(camera, renderer.domElement);
  scene.add(transform.getHelper());
  transform.setSize(1.1);
  transform.setTranslationSnap(0.01);
  transform.setRotationSnap(THREE.MathUtils.degToRad(5));
  let content = new THREE.Group();
  scene.add(content);
  let lookup = new Map<string, THREE.Object3D>();
  let nodes: SceneNode[] = [];
  let view: EditorView;
  let selected: string | null = null;
  let detail = false;
  let tool: EditTool = 'orbit';
  let dirty = true,
    disposed = false,
    frame = 0,
    restoring = false,
    initialized = false,
    cancelled = false;
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(150, 150),
    new THREE.MeshStandardMaterial({ color: '#e9edef', roughness: 1 }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.08;
  ground.receiveShadow = true;
  scene.add(ground);
  const grid = new THREE.GridHelper(60, 120, '#c9d1d6', '#dee4e7');
  grid.position.y = -0.075;
  scene.add(grid);
  const ambient = new THREE.HemisphereLight('#fff', '#a6aab1', 2.2),
    sun = new THREE.DirectionalLight('#fff4df', 3.5),
    fill = new THREE.DirectionalLight('#dceaf9', 1.2);
  sun.position.set(-3, 12, 8);
  sun.target.position.set(3.5, 0, 4.5);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, {
    left: -13,
    right: 13,
    top: 13,
    bottom: -13,
    near: 0.5,
    far: 40,
  });
  sun.shadow.normalBias = 0.025;
  fill.position.set(8, 6, -5);
  scene.add(ambient, sun, sun.target, fill);
  const lights = [
    [2.5, 2.1, 4.9],
    [3.75, 2, 1.3],
    [6.2, 2.1, 8.2],
  ].map((p) => {
    const light = new THREE.PointLight('#ffd6ad', 0, 9, 2);
    light.position.set(...(p as Vec3));
    scene.add(light);
    return light;
  });
  let oak: THREE.Texture | null = null;
  const finishMaps = new Map<string, THREE.Texture>();
  let navigationShapes: ReturnType<typeof walkShapes> = [],
    previousFrame = 0,
    lastCameraEmit = 0;
  const walkKeys = new Set<string>();
  let pad = { forward: 0, side: 0, turn: 0 },
    lookPointer: { id: number; x: number; y: number } | null = null;
  const walking = () => view?.mode === '3d' && view.walk?.enabled === true;
  function finishedMaterial(f: Finish) {
    const texture = (bump: boolean) => {
      const key = JSON.stringify(f) + bump;
      if (!finishMaps.has(key))
        finishMaps.set(key, finishTexture(f, oak, bump));
      return finishMaps.get(key)!;
    };
    return new THREE.MeshStandardMaterial({
      color: '#ffffff',
      map: texture(false),
      bumpMap: texture(true),
      bumpScale:
        f.kind === 'tile' ? 0.002 : f.kind === 'paint' ? 0.0006 : 0.0015,
      roughness: f.roughness,
      side: THREE.DoubleSide,
    });
  }

  new THREE.TextureLoader().load(
    `${import.meta.env.BASE_URL}textures/oak.jpg`,
    (texture) => {
      if (disposed) {
        texture.dispose();
        return;
      }
      oak = texture;
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
      texture.repeat.set(0.5, 0.5);
      if (view) build();
    },
    undefined,
    () =>
      callbacks.error(
        'Текстура не загрузилась; цвета и редактирование доступны.',
      ),
  );
  const selectionBox = new THREE.BoxHelper(new THREE.Object3D(), '#d96c31');
  selectionBox.visible = false;
  scene.add(selectionBox);
  function release(root: THREE.Object3D) {
    root.traverse((object) => {
      if (object instanceof THREE.Sprite) {
        object.material.map?.dispose();
        object.material.dispose();
      }
      if (object instanceof THREE.Mesh) {
        object.geometry.dispose();
        const ms = Array.isArray(object.material)
          ? object.material
          : [object.material];
        ms.forEach((m) => m.dispose());
      }
    });
  }
  function material(node: SceneNode) {
    const type = node.material;
    return new THREE.MeshStandardMaterial({
      color: nodeColor(node, view),
      roughness: type === 'metal' ? 0.3 : type === 'paint' ? 0.7 : 0.9,
      metalness: type === 'metal' ? 0.65 : 0,
      transparent: type === 'glass',
      opacity: type === 'glass' ? 0.28 : 1,
      depthWrite: type !== 'glass',
      emissive: type === 'light' ? '#ffd6ad' : '#000',
      emissiveIntensity: type === 'light' ? (view.night ? 2 : 0.4) : 0,
      map: type === 'wood' ? oak : null,
      side: node.geometry.kind === 'floor' ? THREE.DoubleSide : THREE.FrontSide,
    });
  }
  function build() {
    cancelDrag();
    transform.detach();
    release(content);
    finishMaps.forEach((t) => t.dispose());
    finishMaps.clear();
    scene.remove(content);
    content = new THREE.Group();
    scene.add(content);
    lookup = new Map();
    function visit(node: SceneNode, parent: THREE.Object3D, rootId: string) {
      const object = new THREE.Group();
      object.position.set(...node.position);
      object.rotation.set(
        ...(node.rotation.map(THREE.MathUtils.degToRad) as Vec3),
      );
      object.scale.set(...node.scale);
      object.userData = { id: node.id, rootId };
      object.visible =
        node.visible &&
        (view.furniture || node.category === 'structure') &&
        !(view.cutaway && node.cutaway && node.category === 'furniture');
      parent.add(object);
      lookup.set(node.id, object);
      const m = material(node);
      let used = false,
        baseUsed = false;
      function mesh(geometry: THREE.BufferGeometry, position?: Vec3) {
        let materials: THREE.Material | THREE.Material[] = m;
        if (node.finish || node.surfaces) {
          object.updateWorldMatrix(true, false);
          const scale = new THREE.Vector3().setFromMatrixScale(
            object.matrixWorld,
          );
          geometry = finishGeometry(
            geometry,
            node,
            scale,
            new THREE.Vector3(...(position ?? [0, 0, 0])),
          );
          materials = (['front', 'back', 'top', 'edge'] as WallFace[]).map(
            (face) => {
              const f = node.surfaces?.[face] ?? node.finish;
              if (!f) baseUsed = true;
              return f ? finishedMaterial(f) : m;
            },
          );
        } else baseUsed = true;
        const mesh = new THREE.Mesh(geometry, materials);
        if (position) mesh.position.set(...position);
        mesh.userData = { id: node.id, rootId };
        mesh.castShadow =
          (!!node.finish || node.material !== 'glass') &&
          node.geometry.kind !== 'floor';
        mesh.receiveShadow = true;
        object.add(mesh);
        used = true;
      }
      if (node.geometry.kind === 'wall')
        for (const block of wallBlocks(node, view.cutaway))
          mesh(wallBlockGeometry(block), block.position);
      else {
        const geometry = createNodeGeometry(node);
        if (geometry) mesh(geometry);
      }
      if (!used || !baseUsed) m.dispose();
      for (const child of node.children) {
        visit(child, object, rootId);
        if (view.cutaway && node.cutaway && child.geometry.kind === 'opening')
          lookup.get(child.id)!.visible = false;
      }
    }
    for (const node of nodes) visit(node, content, node.id);
    // Optional render environment for eye-level gallery shots. Derive the
    // ceiling from the same room contours; do not add or edit scene objects.
    const ceilingHeight =
      renderOptions.ceilingHeight ??
      (walking() || view.sunlight?.enabled
        ? Math.max(
            2.4,
            ...nodes
              .filter((n) => n.geometry.kind === 'wall')
              .map((n) => n.geometry.size[1] * n.scale[1]),
          )
        : undefined);
    if (!view.cutaway && ceilingHeight !== undefined) {
      for (const node of nodes.filter(
        (n) => n.visible && n.category === 'structure' && n.geometry.polygon,
      )) {
        const geometry = createNodeGeometry(node);
        if (!geometry) continue;
        const ceiling = new THREE.Mesh(
          geometry,
          new THREE.MeshStandardMaterial({
            color: '#f4f2ed',
            roughness: 1,
            side: THREE.DoubleSide,
          }),
        );
        ceiling.position.set(node.position[0], ceilingHeight, node.position[2]);
        ceiling.rotation.set(
          ...(node.rotation.map(THREE.MathUtils.degToRad) as Vec3),
        );
        ceiling.scale.set(...node.scale);
        ceiling.receiveShadow = true;
        ceiling.castShadow = !!view.sunlight?.enabled;
        content.add(ceiling);
      }
    }
    if (view.labels) {
      content.updateMatrixWorld(true);
      for (const node of nodes.filter(
        (n) => n.geometry.kind === 'floor' && n.visible,
      )) {
        const [labelX, labelZ] = roomLabelPosition(node);
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d')!;
        const name = node.name.replace('Пол — ', '');
        context.font = '500 40px -apple-system,Arial';
        canvas.width = Math.ceil(context.measureText(name).width) + 28;
        canvas.height = 72;
        context.fillStyle = 'rgba(255,255,255,.94)';
        context.beginPath();
        context.roundRect(1, 1, canvas.width - 2, 70, 12);
        context.fill();
        context.fillStyle = '#344b55';
        context.textAlign = 'center';
        context.font = '500 40px -apple-system,Arial';
        context.fillText(name, canvas.width / 2, 49);
        const texture = new THREE.CanvasTexture(canvas);
        texture.colorSpace = THREE.SRGBColorSpace;
        const label = new THREE.Sprite(
          new THREE.SpriteMaterial({
            map: texture,
            depthTest: false,
            transparent: true,
            sizeAttenuation: false,
          }),
        );
        label.position.set(labelX, 0.9, labelZ);
        label.userData.labelAspect = canvas.width / canvas.height;
        const h =
          (22 * 2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2))) /
          Math.max(1, host.clientHeight);
        label.scale.set(h * label.userData.labelAspect, h, 1);
        label.renderOrder = 10;
        label.userData.helper = true;
        content.add(label);
      }
    }
    updateLighting();
    navigationShapes = walking() ? walkShapes(nodes, view.walk?.eyeHeight) : [];
    orbit.enabled = !walking();
    if (walking()) {
      transform.detach();
      selectionBox.visible = false;
    }
    select(selected, tool, detail);
    dirty = true;
  }
  function updateLighting() {
    grid.visible = view.grid && !view.night;
    ambient.intensity = view.night ? 0.75 : 2.2;
    sun.intensity = view.night ? 0.35 : 3.5;
    fill.intensity = view.night ? 0.35 : 1.2;
    lights.forEach((l) => (l.intensity = view.night ? 20 : 0));
    scene.background = new THREE.Color(view.night ? '#263440' : '#eef1f3');
    (ground.material as THREE.MeshStandardMaterial).color.set(
      view.night ? '#35434e' : '#e9edef',
    );
    if (view.sunlight?.enabled) {
      const light = sunDirection(view.sunlight),
        box = sceneBounds(nodes),
        centre = box.getCenter(new THREE.Vector3());
      sun.target.position.copy(centre);
      sun.position
        .copy(centre)
        .addScaledVector(new THREE.Vector3(...light.direction), 24);
      const span = Math.max(box.max.x - box.min.x, box.max.z - box.min.z) + 3;
      Object.assign(sun.shadow.camera, {
        left: -span,
        right: span,
        top: span,
        bottom: -span,
        near: 0.1,
        far: 60,
      });
      sun.shadow.camera.updateProjectionMatrix();
      sun.intensity = light.elevation > 0 ? 3.8 : 0;
      sun.color.set(light.elevation < 15 ? '#ffc48b' : '#fff6e5');
      ambient.intensity = light.elevation > 0 ? 0.65 : 0.15;
      fill.intensity = light.elevation > 0 ? 0.2 : 0.05;
    } else {
      sun.position.set(-3, 12, 8);
      sun.target.position.set(3.5, 0, 4.5);
      sun.color.set('#fff4df');
      Object.assign(sun.shadow.camera, {
        left: -13,
        right: 13,
        top: 13,
        bottom: -13,
        near: 0.5,
        far: 40,
      });
      sun.shadow.camera.updateProjectionMatrix();
    }
    dirty = true;
  }
  function select(id: string | null, nextTool: EditTool, nextDetail: boolean) {
    selected = id;
    tool = nextTool;
    detail = nextDetail;
    cancelDrag();
    transform.detach();
    const object = !walking() && id ? lookup.get(id) : null;
    selectionBox.visible = !!object;
    if (object) {
      object.updateWorldMatrix(true, true);
      selectionBox.setFromObject(object);
      const node = find(nodes, id!);
      if (
        tool !== 'orbit' &&
        !node?.locked &&
        node?.geometry.kind !== 'opening'
      ) {
        transform.attach(object);
        transform.setMode(tool);
        transform.setSpace('world');
        transform.showX = tool === 'translate';
        transform.showZ = tool === 'translate';
        transform.showY = tool === 'rotate';
        transform.showXZ = tool === 'translate';
        transform.showXY = false;
        transform.showYZ = false;
        transform.showE = false;
        transform.showXYZE = false;
      }
    }
    dirty = true;
  }
  function find(nodes: SceneNode[], id: string): SceneNode | undefined {
    for (const n of nodes) {
      if (n.id === id) return n;
      const f = find(n.children, id);
      if (f) return f;
    }
  }
  function emitCamera() {
    if (!restoring && initialized)
      callbacks.camera({
        position: camera.position.toArray(),
        target: orbit.target.toArray(),
      });
  }
  function setCamera(state: CameraState | null) {
    if (!state) {
      focus();
      return;
    }
    restoring = true;
    camera.position.set(...state.position);
    orbit.target.set(...state.target);
    if (walking()) camera.lookAt(orbit.target);
    else orbit.update();
    restoring = false;
    initialized = true;
    dirty = true;
  }
  function focus(id?: string) {
    const object = id ? lookup.get(id) : undefined;
    const box = object
      ? new THREE.Box3().setFromObject(object)
      : sceneBounds(nodes, view?.furniture);
    if (box.isEmpty()) return;
    const fit = fitCamera(
      { min: box.min.toArray(), max: box.max.toArray() },
      camera.aspect,
      camera.fov,
    );
    setCamera({
      position: fit.position.toArray(),
      target: fit.target.toArray(),
    });
    emitCamera();
  }
  function resize() {
    const { width, height } = host.getBoundingClientRect();
    if (!width || !height) return;
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height);
    const labelHeight =
      (22 * 2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2))) / height;
    for (const label of content.children)
      if (label.userData.helper && label.userData.labelAspect)
        label.scale.set(
          labelHeight * label.userData.labelAspect,
          labelHeight,
          1,
        );
    dirty = true;
  }
  const observer = new ResizeObserver(resize);
  observer.observe(host);
  function onOrbit() {
    dirty = true;
    emitCamera();
  }
  orbit.addEventListener('change', onOrbit);
  transform.addEventListener('dragging-changed', (event) => {
    orbit.enabled = !walking() && !event.value;
    dirty = true;
  });
  transform.addEventListener('mouseDown', () => {
    cancelled = false;
  });
  transform.addEventListener('objectChange', () => {
    selectionBox.update();
    dirty = true;
  });
  transform.addEventListener('mouseUp', () => {
    const object = transform.object;
    if (object && selected && !cancelled) {
      callbacks.change(
        selected,
        object.position.toArray(),
        [object.rotation.x, object.rotation.y, object.rotation.z].map(
          THREE.MathUtils.radToDeg,
        ) as Vec3,
      );
    }
    dirty = true;
  });
  const pointers = new Set<number>(),
    taps = createTapTracker();
  let wasDragging = false;
  function cancelDrag() {
    if (transform.dragging) {
      cancelled = true;
      transform.reset();
      transform.pointerUp(null);
    }
    orbit.enabled = !walking();
    dirty = true;
  }
  function down(event: PointerEvent) {
    if (walking()) {
      if (!lookPointer && event.button === 0) {
        lookPointer = {
          id: event.pointerId,
          x: event.clientX,
          y: event.clientY,
        };
        canvas.setPointerCapture(event.pointerId);
      }
      return;
    }
    pointers.add(event.pointerId);
    taps.down(event.pointerId, event.clientX, event.clientY, event.button);
    wasDragging = false;
    if (pointers.size > 1) {
      cancelDrag();
      transform.enabled = false;
    }
  }
  function markMove(event: PointerEvent) {
    if (walking() && lookPointer?.id === event.pointerId) {
      const current = {
          position: camera.position.toArray(),
          target: orbit.target.toArray(),
        },
        angles = viewAngles(current);
      const next = lookCamera(
        current.position,
        angles.yaw + (event.clientX - lookPointer.x) * 0.004,
        angles.pitch - (event.clientY - lookPointer.y) * 0.004,
      );
      lookPointer = { id: event.pointerId, x: event.clientX, y: event.clientY };
      setCamera(next);
      emitCamera();
      return;
    }
    if (transform.dragging) wasDragging = true;
  }
  const ray = new THREE.Raycaster();
  function up(event: PointerEvent) {
    if (walking()) {
      if (lookPointer?.id === event.pointerId) lookPointer = null;
      return;
    }
    const tapped = taps.up(event.pointerId, event.clientX, event.clientY);
    pointers.delete(event.pointerId);
    if (!pointers.size) transform.enabled = true;
    if (!tapped || wasDragging || transform.dragging) return;
    const rect = renderer.domElement.getBoundingClientRect();
    ray.setFromCamera(
      new THREE.Vector2(
        ((event.clientX - rect.left) / rect.width) * 2 - 1,
        (-(event.clientY - rect.top) / rect.height) * 2 + 1,
      ),
      camera,
    );
    const hits = ray.intersectObject(content, true).filter((hit) => {
      if (
        hit.object.userData.helper ||
        typeof hit.object.userData.id !== 'string' ||
        typeof hit.object.userData.rootId !== 'string'
      )
        return false;
      let p: THREE.Object3D | null = hit.object;
      while (p) {
        if (!p.visible) return false;
        p = p.parent;
      }
      return true;
    });
    if (hits[0])
      callbacks.select(
        detail ? hits[0].object.userData.id : hits[0].object.userData.rootId,
      );
    else callbacks.select(null);
  }
  function cancel(event: PointerEvent) {
    if (lookPointer?.id === event.pointerId) lookPointer = null;
    taps.cancel(event.pointerId);
    pointers.delete(event.pointerId);
    cancelDrag();
    if (!pointers.size) transform.enabled = true;
  }
  function lost(event: PointerEvent) {
    if (pointers.has(event.pointerId)) cancel(event);
  }
  function contextLost(event: Event) {
    event.preventDefault();
    callbacks.error(
      '3D-контекст потерян. Переключитесь на план или обновите страницу.',
    );
  }
  function contextRestored() {
    dirty = true;
    callbacks.error(null);
  }
  const canvas = renderer.domElement;
  canvas.addEventListener('pointerdown', down, true);
  canvas.addEventListener('pointermove', markMove, true);
  canvas.addEventListener('pointerup', up);
  canvas.addEventListener('pointercancel', cancel);
  canvas.addEventListener('lostpointercapture', lost);
  canvas.addEventListener('webglcontextlost', contextLost);
  canvas.addEventListener('webglcontextrestored', contextRestored);
  function walkKey(event: KeyboardEvent) {
    if (event.type === 'keyup' && walkKeys.delete(event.code)) {
      emitCamera();
      return;
    }
    if (
      !walking() ||
      (event.target as HTMLElement)?.closest(
        'input,textarea,select,[contenteditable=true]',
      )
    )
      return;
    if (
      [
        'KeyW',
        'KeyA',
        'KeyS',
        'KeyD',
        'ArrowUp',
        'ArrowDown',
        'ArrowLeft',
        'ArrowRight',
      ].includes(event.code)
    ) {
      event.preventDefault();
      if (event.type === 'keydown') walkKeys.add(event.code);
      else {
        walkKeys.delete(event.code);
        emitCamera();
      }
    }
  }
  function clearWalk() {
    walkKeys.clear();
    pad = { forward: 0, side: 0, turn: 0 };
    lookPointer = null;
  }
  function focusField(event: FocusEvent) {
    if (
      (event.target as HTMLElement)?.closest(
        'input,textarea,select,[contenteditable=true]',
      )
    )
      clearWalk();
  }
  window.addEventListener('keydown', walkKey);
  window.addEventListener('keyup', walkKey);
  window.addEventListener('blur', clearWalk);
  document.addEventListener('visibilitychange', clearWalk);
  document.addEventListener('focusin', focusField);
  function animate(now = performance.now()) {
    if (disposed) return;
    frame = requestAnimationFrame(animate);
    const dt = Math.min(0.05, (now - previousFrame) / 1000);
    previousFrame = now;
    if (walking() && !document.hidden && host.offsetParent !== null) {
      const forward =
        pad.forward +
        Number(walkKeys.has('KeyW') || walkKeys.has('ArrowUp')) -
        Number(walkKeys.has('KeyS') || walkKeys.has('ArrowDown'));
      const side =
        pad.side + Number(walkKeys.has('KeyD')) - Number(walkKeys.has('KeyA'));
      const turn =
        pad.turn +
        Number(walkKeys.has('ArrowRight')) -
        Number(walkKeys.has('ArrowLeft'));
      if (forward || side || turn) {
        let current = {
          position: camera.position.toArray(),
          target: orbit.target.toArray(),
        };
        if (turn) {
          const { yaw, pitch } = viewAngles(current);
          current = lookCamera(current.position, yaw + turn * dt * 1.4, pitch);
        }
        const next = constrainedWalk(
          nodes,
          navigationShapes,
          current,
          forward,
          side,
          dt * (view.walk?.speed ?? defaultWalk.speed),
        );
        setCamera(next);
        if (now - lastCameraEmit > 100) {
          emitCamera();
          lastCameraEmit = now;
        }
        dirty = true;
      }
    }
    if (dirty && host.offsetParent !== null && !document.hidden) {
      renderer.render(scene, camera);
      dirty = false;
    }
  }
  animate();
  resize();
  callbacks.ready();
  return {
    update(nextNodes, nextView) {
      const rebuild =
        nodes !== nextNodes ||
        !view ||
        view.sunlight?.enabled !== nextView.sunlight?.enabled ||
        (
          [
            'palette',
            'night',
            'cutaway',
            'furniture',
            'grid',
            'labels',
            'walk',
            'mode',
          ] as const
        ).some((k) => view[k] !== nextView[k]);
      const lightingChanged =
        !view ||
        ['sunlight', 'night', 'grid'].some(
          (k) =>
            view[k as keyof EditorView] !== nextView[k as keyof EditorView],
        );
      const selectionChanged = selected !== nextView.selected;
      selected = nextView.selected;
      const wasWalking = walking();
      nodes = nextNodes;
      view = nextView;
      if (wasWalking && !walking()) clearWalk();
      orbit.enabled = !walking();
      if (rebuild) build();
      else {
        if (lightingChanged) updateLighting();
        if (selectionChanged) select(selected, tool, detail);
      }
      if (!initialized) {
        resize();
        setCamera(view.camera);
      }
    },
    select,
    walkInput(forward, side, turn = 0) {
      pad = { forward, side, turn };
      if (!forward && !side && !turn) emitCamera();
    },
    camera: setCamera,
    focus,
    viewpoint(kind) {
      if (kind === 'overview') {
        focus();
        return;
      }
      if (kind === 'top') {
        const box = sceneBounds(nodes, view.furniture),
          center = box.getCenter(new THREE.Vector3()),
          size = box.getSize(new THREE.Vector3());
        setCamera({
          position: [
            center.x,
            Math.max(size.x / camera.aspect, size.z) * 1.7,
            center.z + 0.001,
          ],
          target: [center.x, 0, center.z],
        });
      } else {
        const labels = {
          living: /Кухня|Гостиная/i,
          bedroom: /Спальня|Комната 1|Жилая комната/i,
          bathroom: /Санузел/i,
        };
        const room = nodes.find(
          (n) => n.geometry.kind === 'floor' && labels[kind].test(n.name),
        );
        if (room) {
          const box = sceneBounds([room], false),
            center = box.getCenter(new THREE.Vector3()),
            size = box.getSize(new THREE.Vector3());
          setCamera({
            position: [center.x + size.x * 0.34, 1.6, center.z + size.z * 0.34],
            target: [center.x - size.x * 0.25, 0.95, center.z - size.z * 0.25],
          });
          emitCamera();
          return;
        }
        const presets = {
          living: {
            position: [6.65, 1.65, 6.4] as Vec3,
            target: [1.1, 1.1, 6.2] as Vec3,
          },
          bedroom: {
            position: [6.3, 1.6, 2.1] as Vec3,
            target: [2.4, 1, 1.2] as Vec3,
          },
          bathroom: {
            position: [5.5, 1.6, 7.4] as Vec3,
            target: [6.75, 0.7, 8.25] as Vec3,
          },
        };
        setCamera(presets[kind]);
      }
      emitCamera();
    },
    zoom(factor) {
      const offset = camera.position.clone().sub(orbit.target);
      offset.setLength(
        THREE.MathUtils.clamp(offset.length() * factor, 0.3, 150),
      );
      setCamera({
        position: orbit.target.clone().add(offset).toArray(),
        target: orbit.target.toArray(),
      });
      emitCamera();
    },
    snapshot() {
      renderer.render(scene, camera);
      return new Promise((resolve, reject) =>
        canvas.toBlob(
          (blob) =>
            blob
              ? resolve(blob)
              : reject(new Error('Не удалось сохранить изображение.')),
          'image/png',
        ),
      );
    },
    dispose() {
      disposed = true;
      cancelDrag();
      cancelAnimationFrame(frame);
      observer.disconnect();
      transform.detach();
      transform.dispose();
      orbit.dispose();
      release(content);
      oak?.dispose();
      finishMaps.forEach((t) => t.dispose());
      finishMaps.clear();
      window.removeEventListener('keydown', walkKey);
      window.removeEventListener('keyup', walkKey);
      window.removeEventListener('blur', clearWalk);
      document.removeEventListener('visibilitychange', clearWalk);
      document.removeEventListener('focusin', focusField);
      ground.geometry.dispose();
      (ground.material as THREE.Material).dispose();
      grid.geometry.dispose();
      (grid.material as THREE.Material).dispose();
      selectionBox.geometry.dispose();
      (selectionBox.material as THREE.Material).dispose();
      sun.shadow.dispose();
      canvas.removeEventListener('pointerdown', down, true);
      canvas.removeEventListener('pointermove', markMove, true);
      canvas.removeEventListener('pointerup', up);
      canvas.removeEventListener('pointercancel', cancel);
      canvas.removeEventListener('lostpointercapture', lost);
      canvas.removeEventListener('webglcontextlost', contextLost);
      canvas.removeEventListener('webglcontextrestored', contextRestored);
      renderer.dispose();
      canvas.remove();
    },
  };
}
