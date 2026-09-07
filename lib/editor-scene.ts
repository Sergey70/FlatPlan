import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { TransformControls } from 'three/addons/controls/TransformControls.js';
import { createTapTracker } from './tap-tracker';
import { fitCamera } from './camera-fit';
import {
  createNodeGeometry,
  nodeColor,
  wallBlocks,
  sceneBounds,
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
  const camera = new THREE.PerspectiveCamera(40, 1, 0.03, 500),
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
        node.visible && (view.furniture || node.category === 'structure');
      parent.add(object);
      lookup.set(node.id, object);
      const m = material(node);
      let used = false;
      function mesh(geometry: THREE.BufferGeometry, position?: Vec3) {
        const mesh = new THREE.Mesh(geometry, m);
        if (position) mesh.position.set(...position);
        mesh.userData = { id: node.id, rootId };
        mesh.castShadow =
          node.material !== 'glass' && node.geometry.kind !== 'floor';
        mesh.receiveShadow = true;
        object.add(mesh);
        used = true;
      }
      if (node.geometry.kind === 'wall')
        for (const block of wallBlocks(node, view.cutaway))
          mesh(new THREE.BoxGeometry(...block.size), block.position);
      else {
        const geometry = createNodeGeometry(node);
        if (geometry) mesh(geometry);
      }
      if (!used) m.dispose();
      for (const child of node.children) {
        visit(child, object, rootId);
        if (view.cutaway && node.cutaway && child.geometry.kind === 'opening')
          lookup.get(child.id)!.visible = false;
      }
    }
    for (const node of nodes) visit(node, content, node.id);
    if (view.labels) {
      content.updateMatrixWorld(true);
      for (const node of nodes.filter(
        (n) => n.geometry.kind === 'floor' && n.visible,
      )) {
        const box = new THREE.Box3().setFromObject(lookup.get(node.id)!);
        const center = box.getCenter(new THREE.Vector3());
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
        label.position.set(center.x, 0.9, center.z);
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
    grid.visible = view.grid && !view.night;
    ambient.intensity = view.night ? 0.75 : 2.2;
    sun.intensity = view.night ? 0.35 : 3.5;
    fill.intensity = view.night ? 0.35 : 1.2;
    lights.forEach((l) => (l.intensity = view.night ? 20 : 0));
    scene.background = new THREE.Color(view.night ? '#263440' : '#eef1f3');
    (ground.material as THREE.MeshStandardMaterial).color.set(
      view.night ? '#35434e' : '#e9edef',
    );
    select(selected, tool, detail);
    dirty = true;
  }
  function select(id: string | null, nextTool: EditTool, nextDetail: boolean) {
    selected = id;
    tool = nextTool;
    detail = nextDetail;
    cancelDrag();
    transform.detach();
    const object = id ? lookup.get(id) : null;
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
    orbit.update();
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
    orbit.enabled = !event.value;
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
    orbit.enabled = true;
    dirty = true;
  }
  function down(event: PointerEvent) {
    pointers.add(event.pointerId);
    taps.down(event.pointerId, event.clientX, event.clientY, event.button);
    wasDragging = false;
    if (pointers.size > 1) {
      cancelDrag();
      transform.enabled = false;
    }
  }
  function markMove() {
    if (transform.dragging) wasDragging = true;
  }
  const ray = new THREE.Raycaster();
  function up(event: PointerEvent) {
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
  function animate() {
    if (disposed) return;
    frame = requestAnimationFrame(animate);
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
        (
          [
            'palette',
            'night',
            'cutaway',
            'furniture',
            'grid',
            'labels',
          ] as const
        ).some((k) => view[k] !== nextView[k]);
      const selectionChanged = selected !== nextView.selected;
      selected = nextView.selected;
      nodes = nextNodes;
      view = nextView;
      if (rebuild) build();
      else if (selectionChanged) select(selected, tool, detail);
      if (!initialized) {
        resize();
        setCamera(view.camera);
      }
    },
    select,
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
