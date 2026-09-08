import { registerEditorTools } from '@/lib/editor-webmcp';
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  Box,
  Grid2X2,
  Move,
  RotateCw,
  MousePointer2,
  Undo2,
  Redo2,
  Plus,
  Minus,
  Focus,
  Download,
  Upload,
  Camera,
  Copy,
  Trash2,
  Eye,
  EyeOff,
  Lock,
  Unlock,
  ChevronRight,
  ChevronDown,
  Layers3,
  SlidersHorizontal,
  FolderOpen,
  Palette,
  Sun,
  Moon,
  Save,
  X,
} from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { palettes, polygonPath } from '@/lib/apartment';
import {
  createPlanProject as createInitialProject,
  applyPlanSource,
  hasPlanSource,
  planLayouts,
  planArrangementId,
  sourceLayout,
} from '@/lib/plan-project';
import {
  applyPartitionedPreset,
  PARTITION_PRESET_ID,
  PARTITION_WALL_IDS,
  togglePartitionWalls,
  catalog,
  catalogObject,
  makeOpening,
  type CatalogId,
} from '@/lib/editor-seed';
import {
  clone,
  findNode,
  findParent,
  flattenNodes,
  editNode,
  removeNode,
  duplicateNode,
  paintNode,
  saveArrangement,
  loadArrangement,
  importProject,
  exportProject,
  readStoredProject,
  persistProject,
  clearStoredProject,
  pushHistory,
  undoHistory,
  redoHistory,
  STORAGE_KEY,
  MAX_FILE_BYTES,
  type EditorProject,
  type SceneNode,
  type Vec3,
  type EditorView,
  type History,
  type MaterialKind,
} from '@/lib/editor-model';
import {
  objectDimensions,
  nodeColor,
  resizeObject,
  planDrawing,
  nodeWorldMatrix,
  roomLabelPosition,
} from '@/lib/editor-geometry';
import { Matrix4, Vector3 } from 'three';
import { validateContours } from '@/lib/polygon-validation';
import type { EditorScene, EditTool } from '@/lib/editor-scene';

function download(data: Blob, name: string) {
  const url = URL.createObjectURL(data);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function Field({
  label,
  value,
  onCommit,
  min = -200,
  max = 200,
  step = 0.001,
  disabled = false,
}: {
  label: string;
  value: number;
  onCommit: (n: number) => void;
  min?: number;
  max?: number;
  step?: number;
  disabled?: boolean;
}) {
  const [draft, setDraft] = useState(
    String(Math.round(value * 100000) / 100000),
  );
  const cancelInput = useRef(false);
  const [previous, setPrevious] = useState(value);
  if (previous !== value) {
    setPrevious(value);
    setDraft(String(Math.round(value * 100000) / 100000));
  }
  const valid =
    draft.trim() !== '' &&
    Number.isFinite(Number(draft.replace(',', '.'))) &&
    Number(draft.replace(',', '.')) >= min &&
    Number(draft.replace(',', '.')) <= max;
  return (
    <label className="ed-field">
      <span>{label}</span>
      <input
        value={draft}
        inputMode="decimal"
        disabled={disabled}
        aria-invalid={!valid}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
          const n = Number(draft.replace(',', '.'));
          setDraft(String(Math.round(value * 100000) / 100000));
          if (!cancelInput.current && valid && Math.abs(n - value) > 1e-7)
            onCommit(n);
          cancelInput.current = false;
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur();
          if (e.key === 'Escape') {
            cancelInput.current = true;
            setDraft(String(value));
            e.currentTarget.blur();
          }
          if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
            e.preventDefault();
            setDraft(
              String(
                Math.min(
                  max,
                  Math.max(
                    min,
                    Number(draft) + (e.key === 'ArrowUp' ? step : -step),
                  ),
                ),
              ),
            );
          }
        }}
      />
    </label>
  );
}
function TextField({
  label,
  value,
  onCommit,
}: {
  label: string;
  value: string;
  onCommit: (value: string) => void;
}) {
  const [draft, setDraft] = useState(value);
  const [previous, setPrevious] = useState(value);
  if (previous !== value) {
    setPrevious(value);
    setDraft(value);
  }
  return (
    <label className="ed-field ed-wide">
      <span>{label}</span>
      <input
        value={draft}
        maxLength={100}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
          if (draft.trim() && draft !== value) onCommit(draft.trim());
          else setDraft(value);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur();
        }}
      />
    </label>
  );
}
function ColorField({
  node,
  onColor,
}: {
  node: SceneNode;
  onColor: (color: string) => void;
}) {
  const [color, setColor] = useState(node.color);
  const [previous, setPrevious] = useState(node.color);
  if (previous !== node.color) {
    setPrevious(node.color);
    setColor(node.color);
  }
  return (
    <div className="ed-color">
      <label>
        Цвет объекта
        <input
          type="color"
          aria-label="Цвет объекта"
          value={color}
          onChange={(e) => setColor(e.target.value)}
          onBlur={() => {
            if (color !== node.color) onColor(color);
          }}
        />
      </label>
      <input
        aria-label="Цвет HEX"
        value={color}
        maxLength={7}
        onChange={(e) => setColor(e.target.value)}
        onBlur={() => {
          if (/^#[\da-f]{6}$/i.test(color)) onColor(color);
          else setColor(node.color);
        }}
      />
      {['#f2efe8', '#252d30', '#c8a779', '#d4d0c7', '#547869', '#bb785c'].map(
        (c) => (
          <button
            key={c}
            title={c}
            aria-label={`Цвет ${c}`}
            style={{ background: c }}
            onClick={() => onColor(c)}
          />
        ),
      )}
    </div>
  );
}
function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  const id = label.replaceAll(' ', '-');
  return (
    <div className="ed-toggle">
      <label htmlFor={id}>{label}</label>
      <Switch id={id} checked={checked} onCheckedChange={onChange} />
    </div>
  );
}
function IconButton({
  label,
  onClick,
  disabled = false,
  active = false,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  active?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      className={`ed-icon ${active ? 'active' : ''}`}
      title={label}
      aria-label={label}
      aria-pressed={active}
      onClick={onClick}
      disabled={disabled}
    >
      {children}
    </button>
  );
}

function ObjectTree({
  nodes,
  selected,
  onSelect,
  onToggle,
  filter,
}: {
  nodes: SceneNode[];
  selected: string | null;
  onSelect: (id: string) => void;
  onToggle: (id: string) => void;
  filter: string;
}) {
  const [open, setOpen] = useState<Set<string>>(() => new Set());
  function matches(node: SceneNode): boolean {
    return (
      node.name.toLowerCase().includes(filter.toLowerCase()) ||
      node.children.some(matches)
    );
  }
  function branch(nodes: SceneNode[], depth = 0): React.ReactNode {
    return nodes.filter(matches).map((node) => (
      <div key={node.id}>
        <div
          className={`ed-tree-row ${selected === node.id ? 'selected' : ''}`}
          data-object-id={node.id}
          style={{ paddingLeft: Math.min(depth, 4) * 14 + 2 }}
        >
          <button
            className="ed-tree-expand"
            aria-label={`${open.has(node.id) ? 'Свернуть' : 'Развернуть'} ${node.name}`}
            disabled={!node.children.length}
            onClick={() =>
              setOpen((prev) => {
                const next = new Set(prev);
                if (next.has(node.id)) next.delete(node.id);
                else next.add(node.id);
                return next;
              })
            }
          >
            {node.children.length ? (
              open.has(node.id) ? (
                <ChevronDown />
              ) : (
                <ChevronRight />
              )
            ) : (
              <span />
            )}
          </button>
          <button
            className="ed-tree-name"
            aria-pressed={selected === node.id}
            onClick={() => onSelect(node.id)}
          >
            <span>{node.name}</span>
            <small>
              {node.locked
                ? 'Закреплён'
                : node.geometry.kind === 'wall'
                  ? 'Стена'
                  : node.children.length
                    ? `${node.children.length} деталей`
                    : ''}
            </small>
          </button>
          <button
            className="ed-tree-visibility"
            aria-label={`${node.visible ? 'Скрыть' : 'Показать'} ${node.name}`}
            onClick={() => onToggle(node.id)}
          >
            {node.visible ? <Eye /> : <EyeOff />}
          </button>
        </div>
        {(open.has(node.id) || filter) && branch(node.children, depth + 1)}
      </div>
    ));
  }
  return <div className="ed-tree">{branch(nodes)}</div>;
}
function planExtent(points: [number, number][]) {
  const xs = points.map((p) => p[0]),
    zs = points.map((p) => p[1]);
  const left = points.length ? Math.min(...xs) - 0.6 : 0;
  const top = points.length ? Math.min(...zs) - 0.6 : 0;
  return {
    left,
    top,
    width: points.length ? Math.max(...xs) - left + 0.6 : 8,
    depth: points.length ? Math.max(...zs) - top + 0.6 : 9,
  };
}
function Plan({
  project,
  selected,
  tool,
  detail,
  onSelect,
  onMove,
  onView,
}: {
  project: EditorProject;
  selected: string | null;
  tool: EditTool;
  detail: boolean;
  onSelect: (id: string | null) => void;
  onMove: (id: string, position: Vec3) => void;
  onView: (patch: Partial<EditorView>) => void;
}) {
  const svg = useRef<SVGSVGElement>(null);
  const pointers = useRef(new Map<number, [number, number]>());
  type Gesture = {
    type: 'move' | 'pan' | 'pinch';
    start: [number, number];
    units: number;
    offset: [number, number];
    zoom: number;
    distance: number;
    id: string | null;
    position: Vec3;
    inverse: Matrix4;
    moved: boolean;
  };
  const gesture = useRef<Gesture | null>(null);
  const [offset, setOffset] = useState<{
    id: string;
    dx: number;
    dz: number;
  } | null>(null);
  const view = project.scene.view,
    zoom = view.planZoom;
  const parts = useMemo(
    () =>
      planDrawing(project.scene.objects, {
        palette: view.palette,
        furniture: view.furniture,
      }),
    [project.scene.objects, view.palette, view.furniture],
  );
  const extent = useMemo(
    () => planExtent(parts.flatMap((p) => p.points)),
    [parts],
  );
  const selectedIds = useMemo(
    () =>
      new Set(
        selected
          ? flattenNodes(
              [findNode(project.scene.objects, selected)!].filter(Boolean),
            ).map((x) => x.node.id)
          : [],
      ),
    [project.scene.objects, selected],
  );
  function position(e: React.PointerEvent): [number, number] {
    return [e.clientX, e.clientY];
  }
  function scale() {
    const r = svg.current!.getBoundingClientRect();
    return Math.max(extent.width / r.width, extent.depth / r.height) / zoom;
  }
  function panOffset(x: number, z: number): [number, number] {
    return [Math.max(-200, Math.min(200, x)), Math.max(-200, Math.min(200, z))];
  }
  function start(e: React.PointerEvent<SVGSVGElement>) {
    if (e.button !== 0) return;
    pointers.current.set(e.pointerId, position(e));
    e.currentTarget.setPointerCapture(e.pointerId);
    if (pointers.current.size === 2) {
      setOffset(null); // A second finger always cancels an unfinished object move.
      const [a, b] = [...pointers.current.values()];
      gesture.current = {
        type: 'pinch',
        start: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2],
        distance: Math.hypot(a[0] - b[0], a[1] - b[1]),
        units: scale(),
        zoom,
        offset: [...view.planOffset],
        id: null,
        position: [0, 0, 0],
        inverse: new Matrix4(),
        moved: true,
      };
      return;
    }
    if (pointers.current.size > 2) {
      gesture.current = null;
      setOffset(null);
      return;
    }
    const target = (e.target as Element).closest('[data-object-id]');
    const part = parts.find(
      (p) => p.id === target?.getAttribute('data-object-id'),
    );
    const id = part ? (detail ? part.id : part.rootId) : null;
    const node = findNode(project.scene.objects, id);
    const moving =
      tool === 'translate' &&
      node &&
      !node.locked &&
      node.geometry.kind !== 'opening';
    const parent = moving ? findParent(project.scene.objects, node.id) : null;
    gesture.current = {
      type: moving ? 'move' : 'pan',
      start: position(e),
      units: scale(),
      offset: [...view.planOffset],
      zoom,
      distance: 0,
      id,
      position: node ? clone(node.position) : [0, 0, 0],
      inverse: parent
        ? nodeWorldMatrix(project.scene.objects, parent.id)!.invert()
        : new Matrix4(),
      moved: false,
    };
    if (moving) onSelect(id);
  }
  function move(e: React.PointerEvent) {
    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.set(e.pointerId, position(e));
    const g = gesture.current;
    if (!g) return;
    if (g.type === 'pinch') {
      if (pointers.current.size !== 2) return;
      const [a, b] = [...pointers.current.values()],
        rect = svg.current!.getBoundingClientRect();
      const z = Math.max(
        0.5,
        Math.min(
          3,
          (g.zoom * Math.hypot(a[0] - b[0], a[1] - b[1])) /
            Math.max(1, g.distance),
        ),
      );
      const mid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2],
        center = [rect.x + rect.width / 2, rect.y + rect.height / 2],
        units = (g.units * g.zoom) / z;
      onView({
        planZoom: z,
        planOffset: panOffset(
          g.offset[0] +
            (g.start[0] - center[0]) * g.units -
            (mid[0] - center[0]) * units,
          g.offset[1] +
            (g.start[1] - center[1]) * g.units -
            (mid[1] - center[1]) * units,
        ),
      });
      return;
    }
    const dx = (e.clientX - g.start[0]) * g.units,
      dz = (e.clientY - g.start[1]) * g.units;
    if (Math.hypot(e.clientX - g.start[0], e.clientY - g.start[1]) > 5)
      g.moved = true;
    if (!g.moved) return;
    if (g.type === 'pan')
      onView({ planOffset: panOffset(g.offset[0] - dx, g.offset[1] - dz) });
    else if (g.id) setOffset({ id: g.id, dx, dz });
  }
  function stop(e: React.PointerEvent, apply: boolean) {
    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.delete(e.pointerId);
    const g = gesture.current;
    gesture.current = null;
    setOffset(null);
    if (!g || !apply || g.type === 'pinch') return;
    if (!g.moved) {
      onSelect(g.id);
      return;
    }
    if (g.type === 'move' && g.id) {
      const delta = new Vector3(
        (e.clientX - g.start[0]) * g.units,
        0,
        (e.clientY - g.start[1]) * g.units,
      );
      const origin = new Vector3().applyMatrix4(g.inverse);
      delta.applyMatrix4(g.inverse).sub(origin);
      onMove(
        g.id,
        [
          g.position[0] + delta.x,
          g.position[1] + delta.y,
          g.position[2] + delta.z,
        ].map((n) => Math.round(n * 1000) / 1000) as Vec3,
      );
    }
  }
  return (
    <div className="ed-plan">
      <svg
        ref={svg}
        viewBox={`${extent.left + (extent.width * (1 - 1 / zoom)) / 2 + view.planOffset[0]} ${extent.top + (extent.depth * (1 - 1 / zoom)) / 2 + view.planOffset[1]} ${extent.width / zoom} ${extent.depth / zoom}`}
        aria-label="Редактируемый план сверху"
        onPointerDown={start}
        onPointerMove={move}
        onPointerUp={(e) => stop(e, true)}
        onPointerCancel={(e) => stop(e, false)}
        onLostPointerCapture={(e) => stop(e, false)}
      >
        {parts.map((part, index) => (
          <path
            key={`${part.id}-${index}`}
            data-object-id={part.id}
            data-symbol={part.strokeOnly ? 'door-swing' : undefined}
            d={[
              part.strokeOnly
                ? polygonPath(part.points).replace(/Z$/i, '')
                : polygonPath(part.points),
              ...part.holes.map(polygonPath),
            ].join(' ')}
            fillRule="evenodd"
            fill={part.strokeOnly ? 'none' : part.color}
            fillOpacity={part.kind === 'floor' ? 0.6 : 1}
            stroke={selectedIds.has(part.id) ? '#d6652e' : '#798585'}
            strokeWidth={selectedIds.has(part.id) ? 0.045 : 0.018}
            transform={
              offset && selectedIds.has(part.id)
                ? `translate(${offset.dx} ${offset.dz})`
                : undefined
            }
          >
            <title>{findNode(project.scene.objects, part.id)?.name}</title>
          </path>
        ))}
        {view.labels &&
          project.scene.objects
            .filter((n) => n.geometry.kind === 'floor' && n.visible)
            .map((n) => {
              const own = parts.find((p) => p.id === n.id);
              if (!own) return null;
              const [x, z] = roomLabelPosition(n);
              return (
                <text
                  key={n.id}
                  x={x}
                  y={z}
                  textAnchor="middle"
                  fontSize={0.36 / Math.sqrt(zoom)}
                  fill="#243e44"
                  stroke="#fff"
                  strokeWidth=".025"
                  paintOrder="stroke"
                  pointerEvents="none"
                >
                  {n.name.replace('Пол — ', '')}
                </text>
              );
            })}
      </svg>
      <div className="ed-plan-zoom">
        <IconButton
          label="Приблизить план"
          onClick={() => onView({ planZoom: Math.min(3, zoom * 1.2) })}
        >
          <Plus />
        </IconButton>
        <IconButton
          label="Отдалить план"
          onClick={() => onView({ planZoom: Math.max(0.5, zoom / 1.2) })}
        >
          <Minus />
        </IconButton>
        <IconButton
          label="Весь план"
          onClick={() => onView({ planZoom: 1, planOffset: [0, 0] })}
        >
          <Focus />
        </IconButton>
      </div>
    </div>
  );
}

export default function Editor() {
  const [boot] = useState(() => {
    let restored: EditorProject | null = null;
    try {
      const saved = readStoredProject(window.localStorage);
      restored = saved;
      const requested = new URLSearchParams(window.location.search).get(
        'layout',
      );
      const upgraded = !!saved && !hasPlanSource(saved);
      let project = saved
        ? upgraded
          ? applyPlanSource(saved)
          : saved
        : createInitialProject();
      const layout = planLayouts.find(
        (l) =>
          l.id === requested ||
          (l.id === 'plan-2' &&
            ['separate-kitchen', 'kitchen-by-bathroom', 'plan-1'].includes(
              requested ?? '',
            )),
      );
      if (layout) {
        const id = planArrangementId(layout.id);
        if (!project.arrangements.some((a) => a.id === id))
          project = applyPlanSource(project);
        project = loadArrangement(project, id);
      }
      return {
        project,
        upgraded,
        selectionUpdated: ['plan-008', 'plan-009'].includes(
          saved?.sourceRevision ?? '',
        ),
        error: null as string | null,
      };
    } catch (error) {
      return {
        project: restored ?? createInitialProject(),
        upgraded: false,
        selectionUpdated: false,
        error: `${restored ? 'Не удалось открыть новый план' : 'Не удалось восстановить проект'}: ${(error as Error).message}`,
      };
    }
  });
  useEffect(() => {
    const url = new URL(window.location.href);
    if (
      [
        'separate-kitchen',
        'kitchen-by-bathroom',
        'plan-1',
        ...planLayouts.map((l) => l.id),
      ].includes(url.searchParams.get('layout') ?? '')
    ) {
      url.searchParams.delete('layout');
      window.history.replaceState(null, '', url);
    }
  }, []);
  const [history, setHistory] = useState<History>({
    past: [],
    present: boot.project,
    future: [],
  });
  const project = history.present;
  const projectRef = useRef(project);
  useLayoutEffect(() => {
    projectRef.current = project;
  }, [project]);
  const [storagePaused, setStoragePaused] = useState(!!boot.error);
  const [savedProject, setSavedProject] = useState<EditorProject | null>(null),
    [saveFailed, setSaveFailed] = useState(!!boot.error);
  const saveStatus = saveFailed
    ? 'error'
    : savedProject === project
      ? 'saved'
      : 'saving';
  const pausedRef = useRef(storagePaused);
  useLayoutEffect(() => {
    pausedRef.current = storagePaused;
  }, [storagePaused]);
  const [error, setError] = useState<string | null>(boot.error),
    [notice, setNotice] = useState<string | null>(
      boot.upgraded
        ? boot.selectionUpdated
          ? 'План обновлён по новому файлу. Пользовательские изменения сохранены; исходную схему можно открыть кнопкой «Открыть исходный .plan».'
          : 'Открыт план из файла .plan. Предыдущая сцена сохранена в варианте «До обновления по файлу .plan».'
        : null,
    ),
    [panel, setPanel] = useState<
      'objects' | 'properties' | 'variants' | 'files'
    >('objects');
  const [tool, setTool] = useState<EditTool>('orbit'),
    [detail, setDetail] = useState(false),
    [filter, setFilter] = useState(''),
    [add, setAdd] = useState(false),
    [variantName, setVariantName] = useState('Новый вариант');
  const [ready, setReady] = useState(false),
    [unavailable, setUnavailable] = useState(false);
  const host = useRef<HTMLDivElement>(null),
    controller = useRef<EditorScene | null>(null),
    fileInput = useRef<HTMLInputElement>(null),
    cameraEmitted = useRef<EditorView['camera'] | undefined>(undefined),
    importRef = useRef<EditorProject | null>(null),
    importRequest = useRef(0),
    [importName, setImportName] = useState<string | null>(null);
  const [resetPending, setResetPending] = useState(false);
  const selected = project.scene.view.selected,
    node = findNode(project.scene.objects, selected),
    view = project.scene.view;
  function attempt(action: () => void) {
    try {
      action();
      setError(null);
    } catch (error) {
      setError((error as Error).message);
    }
  }
  const commit = useCallback((next: EditorProject) => {
    projectRef.current = next;
    setHistory((old) => pushHistory(old, next));
    setNotice(null);
  }, []);
  const replaceProject = useCallback((next: EditorProject) => {
    // Update refs before any pending autosave or unload can use the old scene.
    projectRef.current = next;
    pausedRef.current = false;
    setHistory({ past: [], present: next, future: [] });
    setStoragePaused(false);
    setSavedProject(null);
    setSaveFailed(false);
    setError(null);
    setTool('orbit');
    setDetail(false);
    setFilter('');
    setAdd(false);
    setVariantName('Новый вариант');
    cameraEmitted.current = undefined;
    importRequest.current++;
    importRef.current = null;
    setImportName(null);
    if (fileInput.current) fileInput.current.value = '';
    setResetPending(false);
  }, []);
  function resetUserData() {
    try {
      const initial = createInitialProject();
      clearStoredProject(window.localStorage);
      replaceProject(initial);
      setNotice('Пользовательские данные удалены. Открыт исходный план.');
    } catch (error) {
      setError(
        `Не удалось удалить данные: ${(error as Error).message}. Текущий проект сохранён в редакторе. Скачайте JSON и повторите сброс.`,
      );
    }
  }
  const updateView = useCallback((patch: Partial<EditorView>) => {
    setHistory((old) => {
      const next = {
        ...old.present,
        scene: {
          ...old.present.scene,
          view: { ...old.present.scene.view, ...patch },
        },
      };
      projectRef.current = next;
      return { ...old, present: next };
    });
  }, []);
  const select = useCallback(
    (id: string | null) => {
      const validId =
        typeof id === 'string' && findNode(projectRef.current.scene.objects, id)
          ? id
          : null;
      updateView({ selected: validId });
      if (validId) setPanel('properties');
    },
    [updateView],
  );
  const change = useCallback(
    (id: string, position: Vec3, rotation?: Vec3) => {
      try {
        commit(
          editNode(projectRef.current, id, (node) => {
            if (node.locked) throw new Error('Объект закреплён.');
            node.position = position;
            if (rotation) node.rotation = rotation;
          }),
        );
      } catch (error) {
        setError((error as Error).message);
        controller.current?.update(
          clone(projectRef.current.scene.objects),
          projectRef.current.scene.view,
        );
      }
    },
    [commit],
  );
  const saveNow = useCallback(() => {
    if (pausedRef.current) {
      setError(
        'Сохранение приостановлено. В разделе «Файл» выберите, какой проект оставить, или скачайте JSON.',
      );
      return;
    }
    try {
      persistProject(window.localStorage, projectRef.current);
      setSavedProject(projectRef.current);
      setSaveFailed(false);
    } catch (error) {
      setSaveFailed(true);
      setError(
        `Не удалось сохранить в браузере: ${(error as Error).message}. Скачайте JSON проекта.`,
      );
    }
  }, []);
  useEffect(() => {
    if (storagePaused) return;
    const timer = setTimeout(saveNow, 400);
    return () => clearTimeout(timer);
  }, [project, storagePaused, saveNow]);
  useEffect(() => {
    const flush = () => saveNow();
    window.addEventListener('pagehide', flush);
    window.addEventListener('beforeunload', flush);
    const storage = (event: StorageEvent) => {
      if (
        event.key === STORAGE_KEY &&
        event.newValue !== exportProject(projectRef.current)
      ) {
        pausedRef.current = true;
        setStoragePaused(true);
        setSaveFailed(true);
        setError(
          'Проект изменился в другой вкладке. Автосохранение приостановлено. Откройте раздел «Файл».',
        );
      }
    };
    window.addEventListener('storage', storage);
    return () => {
      window.removeEventListener('pagehide', flush);
      window.removeEventListener('beforeunload', flush);
      window.removeEventListener('storage', storage);
    };
  }, [saveNow]);
  useEffect(() => {
    let active = true;
    let scene: EditorScene | undefined;
    void import('@/lib/editor-scene')
      .then(({ createEditorScene }) => {
        if (!active || !host.current) return;
        try {
          scene = createEditorScene(host.current, {
            select,
            change,
            camera: (camera) => {
              cameraEmitted.current = camera;
              updateView({ camera });
            },
            error: (message) => setError(message),
            ready: () => setReady(true),
          });
          controller.current = scene;
          scene.update(
            projectRef.current.scene.objects,
            projectRef.current.scene.view,
          );
          scene.camera(projectRef.current.scene.view.camera);
        } catch (error) {
          setUnavailable(true);
          updateView({ mode: '2d' });
          setError(
            `3D недоступен; редактирование плана работает. ${(error as Error).message}`,
          );
        }
      })
      .catch(() => {
        if (active) {
          setUnavailable(true);
          updateView({ mode: '2d' });
          setError('Не удалось загрузить 3D. План и редактирование доступны.');
        }
      });
    return () => {
      active = false;
      scene?.dispose();
      controller.current = null;
    };
  }, [select, change, updateView]);
  useEffect(() => {
    controller.current?.update(project.scene.objects, view);
  }, [project.scene.objects, view]);
  useEffect(() => {
    controller.current?.select(selected, tool, detail);
  }, [selected, tool, detail, project.scene.objects]);
  useEffect(() => {
    if (cameraEmitted.current !== view.camera)
      controller.current?.camera(view.camera);
  }, [view.camera]);
  useEffect(() => {
    const keyboard = (e: KeyboardEvent) => {
      if (
        (e.target as HTMLElement)?.closest(
          'input,textarea,select,[contenteditable=true]',
        )
      )
        return;
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        setHistory((h) => (e.shiftKey ? redoHistory(h) : undoHistory(h)));
      }
      if (e.key === 'Escape') {
        setTool('orbit');
        setAdd(false);
      }
      if (e.key === 'Delete' && projectRef.current.scene.view.selected) {
        const id = projectRef.current.scene.view.selected!;
        const current = findNode(projectRef.current.scene.objects, id);
        if (current && !current.locked)
          commit(removeNode(projectRef.current, id));
      }
    };
    window.addEventListener('keydown', keyboard);
    return () => window.removeEventListener('keydown', keyboard);
  }, [commit]);
  const statusRef = useRef({ ready, unavailable, saveStatus, storagePaused });
  useLayoutEffect(() => {
    statusRef.current = { ready, unavailable, saveStatus, storagePaused };
  }, [ready, unavailable, saveStatus, storagePaused]);
  useEffect(
    () =>
      registerEditorTools({
        read: () => projectRef.current,
        commit,
        view: updateView,
        undo: () => setHistory(undoHistory),
        redo: () => setHistory(redoHistory),
        save: saveNow,
        status: () => statusRef.current,
      }),
    [commit, updateView, saveNow],
  );
  function patchNode(edit: (node: SceneNode) => void) {
    if (node) attempt(() => commit(editNode(project, node.id, edit)));
  }
  function vector(
    field: 'position' | 'rotation',
    index: number,
    value: number,
  ) {
    patchNode((n) => {
      n[field][index] = value;
    });
  }
  function setDimension(index: number, value: number) {
    patchNode((n) => {
      const dimensions = objectDimensions(project.scene.objects, n);
      dimensions[index] = value;
      resizeObject(project.scene.objects, n, dimensions);
    });
  }
  function addObject(id: CatalogId) {
    attempt(() => {
      const next = clone(project),
        object = catalogObject(id);
      if (id === 'wall')
        object.geometry.size[1] =
          project.scene.objects.find((n) => n.geometry.kind === 'wall')
            ?.geometry.size[1] ?? 2.7;
      next.scene.objects.push(object);
      next.scene.view.selected = object.id;
      next.scene.view.furniture = true;
      commit(next);
      setAdd(false);
      setPanel('properties');
    });
  }
  function opening(type: 'door' | 'window') {
    patchNode((n) => {
      const width = 0.9,
        height = type === 'door' ? 2.1 : 1.4,
        bottom = type === 'door' ? 0 : 0.9;
      const occupied = n.children
        .filter((c) => c.geometry.kind === 'opening' && c.visible)
        .sort((a, b) => a.position[0] - b.position[0]);
      let left = -n.geometry.size[0] / 2 + 0.1;
      for (const item of occupied) {
        const a =
            item.position[0] - (item.geometry.size[0] * item.scale[0]) / 2,
          b = item.position[0] + (item.geometry.size[0] * item.scale[0]) / 2;
        if (left + width < a - 0.05) break;
        left = b + 0.1;
      }
      if (left + width > n.geometry.size[0] / 2 - 0.05)
        throw new Error(
          'В стене нет свободного места для этого проёма. Увеличьте стену или уменьшите существующие проёмы.',
        );
      const o = makeOpening(
        width,
        Math.min(height, n.geometry.size[1] - bottom - 0.1),
        n.geometry.size[2] + 0.03,
        type,
      );
      o.position = [left + width / 2, bottom, 0];
      n.children.push(o);
    });
  }
  async function readFile(file: File) {
    const request = ++importRequest.current;
    try {
      if (file.size > MAX_FILE_BYTES) throw new Error('Максимум 8 МБ.');
      const imported = importProject(await file.text());
      if (request !== importRequest.current) return;
      importRef.current = imported;
      setImportName(imported.name);
      setError(null);
    } catch (error) {
      if (request === importRequest.current) setError((error as Error).message);
    } finally {
      if (request === importRequest.current && fileInput.current)
        fileInput.current.value = '';
    }
  }
  async function saveImage() {
    try {
      if (view.mode !== '3d') throw new Error('Для снимка переключитесь в 3D.');
      const blob = await controller.current?.snapshot();
      if (blob) download(blob, 'flatplan-view.png');
    } catch (error) {
      setError((error as Error).message);
    }
  }
  const dimensions = node
    ? objectDimensions(project.scene.objects, node)
    : null;
  const active = project.arrangements.find(
    (item) => item.id === project.activeArrangement,
  );
  return (
    <div className="ed-app">
      <header className="ed-header">
        <div className="ed-brand">
          <Box />
          <span>
            flat<strong>plan</strong>
          </span>
          <small>редактор</small>
        </div>
        <span className={`ed-save ${saveStatus}`}>
          {storagePaused
            ? 'Сохранение на паузе'
            : saveStatus === 'saved'
              ? 'Сохранено в браузере'
              : saveStatus === 'saving'
                ? 'Сохраняем…'
                : 'Не сохранено'}
        </span>
        <div className="ed-history">
          <IconButton
            label="Отменить изменение"
            disabled={!history.past.length}
            onClick={() => setHistory(undoHistory)}
          >
            <Undo2 />
          </IconButton>
          <IconButton
            label="Повторить изменение"
            disabled={!history.future.length}
            onClick={() => setHistory(redoHistory)}
          >
            <Redo2 />
          </IconButton>
          <button className="ed-primary" onClick={() => setPanel('files')}>
            <FolderOpen />
            <span>Проект</span>
          </button>
        </div>
      </header>
      {(error || notice) && (
        <div
          className={`ed-message ${error ? 'error' : ''}`}
          role={error ? 'alert' : 'status'}
        >
          <span>{error || notice}</span>
          <button
            aria-label="Закрыть сообщение"
            onClick={() => {
              setError(null);
              setNotice(null);
            }}
          >
            <X />
          </button>
        </div>
      )}
      <main className="ed-workspace">
        <aside className="ed-sidebar">
          <nav className="ed-tabs" aria-label="Панели редактора">
            {(
              [
                ['objects', 'Объекты', Layers3],
                ['properties', 'Свойства', SlidersHorizontal],
                ['variants', 'Варианты', Palette],
                ['files', 'Файл', FolderOpen],
              ] as const
            ).map(([id, name, Icon]) => (
              <button
                key={id}
                aria-pressed={panel === id}
                className={panel === id ? 'active' : ''}
                onClick={() => setPanel(id)}
              >
                <Icon />
                <span>{name}</span>
              </button>
            ))}
          </nav>
          <div className="ed-panel">
            {panel === 'objects' && (
              <>
                <div className="ed-panel-title">
                  <h2>Объекты квартиры</h2>
                  <button className="ed-primary" onClick={() => setAdd(!add)}>
                    <Plus />
                    Добавить
                  </button>
                </div>
                <section className="ed-layout-card" aria-label="План из файла">
                  <strong>
                    {sourceLayout(project)?.name ?? 'Планировка из файла .plan'}
                  </strong>
                  <p>
                    Кухня — 21,43 м², спальня — 13,55 м². Размеры, положение
                    стен и проёмов перенесены из файла.
                  </p>
                  <button
                    className="ed-full"
                    onClick={() => setPanel('variants')}
                  >
                    Выбрать планировку
                  </button>
                  <button
                    className="ed-primary ed-full"
                    onClick={() =>
                      attempt(() => {
                        commit(applyPlanSource(project));
                        setNotice(
                          'Открыт исходный .plan. Предыдущая сцена сохранена отдельным вариантом.',
                        );
                      })
                    }
                  >
                    Открыть исходный .plan
                  </button>
                  <button
                    className="ed-full"
                    onClick={() => {
                      addObject('wall');
                      updateView({ mode: '2d' });
                      setTool('translate');
                    }}
                  >
                    <Plus />
                    Добавить стену на план
                  </button>
                </section>
                {!project.scene.objects.some((n) =>
                  n.id.startsWith('plan-'),
                ) && (
                  <section
                    className="ed-layout-card"
                    aria-label="Предложенные перегородки"
                  >
                    <strong>Кухня у стены санузла</strong>
                    <p>
                      Предложенная схема: кухня на прежнем месте ТВ, у нижнего
                      окна. Комната 2 — у верхнего левого окна.
                    </p>
                    {project.scene.objects.some(
                      (n) => n.id === 'floor-kitchen',
                    ) && (
                      <>
                        <button
                          className="ed-full"
                          onClick={() =>
                            attempt(() =>
                              commit(
                                togglePartitionWalls(
                                  project,
                                  !project.scene.objects.some(
                                    (n) =>
                                      (
                                        PARTITION_WALL_IDS as readonly string[]
                                      ).includes(n.id) && n.visible,
                                  ),
                                ),
                              ),
                            )
                          }
                        >
                          {project.scene.objects.some(
                            (n) =>
                              (
                                PARTITION_WALL_IDS as readonly string[]
                              ).includes(n.id) && n.visible,
                          )
                            ? 'Убрать новые перегородки'
                            : 'Вернуть новые перегородки'}
                        </button>
                        <p>
                          Каждую стену можно отдельно выбрать, передвинуть или
                          удалить. Окна на плане выделены голубым.
                        </p>
                      </>
                    )}
                    {(!project.arrangements.some(
                      (a) => a.id === PARTITION_PRESET_ID,
                    ) ||
                      !project.scene.objects.some(
                        (n) => n.id === 'floor-kitchen',
                      )) && (
                      <button
                        className="ed-primary ed-full"
                        onClick={() =>
                          attempt(() => {
                            commit(applyPartitionedPreset(project));
                            setNotice(
                              'Открыт новый план. Предыдущая сцена сохранена в варианте «До переноса кухни к санузлу».',
                            );
                          })
                        }
                      >
                        Открыть кухню у санузла
                      </button>
                    )}
                    {[
                      [PARTITION_WALL_IDS[0], 'Размер стены у кухни'],
                      [PARTITION_WALL_IDS[1], 'Стена между кухней и комнатой'],
                    ].map(
                      ([id, label]) =>
                        project.scene.objects.some((n) => n.id === id) && (
                          <button
                            className="ed-full"
                            key={id}
                            onClick={() => select(id)}
                          >
                            {label}
                          </button>
                        ),
                    )}
                  </section>
                )}
                <input
                  className="ed-search"
                  placeholder="Найти объект или деталь"
                  aria-label="Поиск объектов"
                  value={filter}
                  onChange={(e) => setFilter(e.target.value)}
                />
                {add && (
                  <div className="ed-catalog">
                    {catalog.map((item) => (
                      <button key={item.id} onClick={() => addObject(item.id)}>
                        <Plus />
                        {item.name}
                      </button>
                    ))}
                  </div>
                )}
                <ObjectTree
                  nodes={project.scene.objects}
                  selected={selected}
                  onSelect={select}
                  onToggle={(id) =>
                    attempt(() =>
                      commit(
                        editNode(project, id, (n) => {
                          n.visible = !n.visible;
                        }),
                      ),
                    )
                  }
                  filter={filter}
                />
                <p className="ed-hint">
                  Разверните предмет, чтобы изменить отдельную ножку, подушку
                  или раму.
                </p>
              </>
            )}
            {panel === 'properties' &&
              (node && dimensions ? (
                <>
                  <div className="ed-panel-title">
                    <h2>Свойства объекта</h2>
                    <IconButton
                      label="Снять выделение"
                      onClick={() => select(null)}
                    >
                      <X />
                    </IconButton>
                  </div>
                  <TextField
                    label="Название"
                    value={node.name}
                    onCommit={(name) =>
                      patchNode((n) => {
                        n.name = name;
                      })
                    }
                  />
                  <div className="ed-object-actions">
                    <button
                      onClick={() =>
                        patchNode((n) => {
                          n.locked = !n.locked;
                        })
                      }
                    >
                      {node.locked ? <Lock /> : <Unlock />}
                      {node.locked ? 'Закреплён' : 'Закрепить'}
                    </button>
                    <button
                      onClick={() =>
                        patchNode((n) => {
                          n.visible = !n.visible;
                        })
                      }
                    >
                      {node.visible ? <Eye /> : <EyeOff />}
                      {node.visible ? 'Виден' : 'Скрыт'}
                    </button>
                    <IconButton
                      label="Показать объект крупно"
                      onClick={() => {
                        if (view.mode === '3d')
                          controller.current?.focus(node.id);
                        else {
                          const parts = planDrawing(
                            project.scene.objects,
                            view,
                          );
                          const ids = new Set(
                            flattenNodes([node]).map((x) => x.node.id),
                          );
                          const all = planExtent(
                            parts.flatMap((p) => p.points),
                          );
                          const own = planExtent(
                            parts
                              .filter((p) => ids.has(p.id))
                              .flatMap((p) => p.points),
                          );
                          updateView({
                            planOffset: [
                              own.left +
                                own.width / 2 -
                                all.left -
                                all.width / 2,
                              own.top + own.depth / 2 - all.top - all.depth / 2,
                            ],
                            planZoom: Math.max(
                              0.5,
                              Math.min(
                                3,
                                all.width / own.width,
                                all.depth / own.depth,
                              ),
                            ),
                          });
                        }
                      }}
                    >
                      <Focus />
                    </IconButton>
                  </div>
                  <fieldset disabled={node.locked}>
                    <legend>Размеры, м</legend>
                    <div className="ed-fields">
                      {(node.geometry.kind === 'wall'
                        ? ['Длина', 'Высота', 'Толщина']
                        : ['Ширина', 'Высота', 'Глубина']
                      ).map((label, i) => (
                        <Field
                          key={label}
                          label={label}
                          value={dimensions[i]}
                          min={0.001}
                          max={100}
                          onCommit={(v) => setDimension(i, v)}
                        />
                      ))}
                    </div>
                    <legend>Положение, м</legend>
                    <div className="ed-fields">
                      {['X — вправо', 'Y — вверх', 'Z — вниз плана'].map(
                        (label, i) => (
                          <Field
                            key={label}
                            label={label}
                            value={node.position[i]}
                            disabled={
                              node.geometry.kind === 'opening' && i === 2
                            }
                            onCommit={(v) => vector('position', i, v)}
                          />
                        ),
                      )}
                    </div>
                    <Field
                      label="Поворот вокруг вертикали, °"
                      value={node.rotation[1]}
                      min={-3600}
                      max={3600}
                      step={1}
                      disabled={node.geometry.kind === 'opening'}
                      onCommit={(v) => vector('rotation', 1, v)}
                    />
                    <details>
                      <summary>Наклон и поворот по другим осям</summary>
                      <div className="ed-fields">
                        <Field
                          label="Вокруг X, °"
                          value={node.rotation[0]}
                          min={-3600}
                          max={3600}
                          step={1}
                          disabled={node.geometry.kind === 'opening'}
                          onCommit={(v) => vector('rotation', 0, v)}
                        />
                        <Field
                          label="Вокруг Z, °"
                          value={node.rotation[2]}
                          min={-3600}
                          max={3600}
                          step={1}
                          disabled={node.geometry.kind === 'opening'}
                          onCommit={(v) => vector('rotation', 2, v)}
                        />
                      </div>
                    </details>
                    <ColorField
                      node={{ ...node, color: nodeColor(node, view) }}
                      onColor={(color) => patchNode((n) => paintNode(n, color))}
                    />
                    <label className="ed-field">
                      <span>Материал</span>
                      <select
                        value={node.material}
                        onChange={(e) =>
                          patchNode((n) =>
                            paintNode(
                              n,
                              n.color,
                              e.target.value as MaterialKind,
                            ),
                          )
                        }
                      >
                        {(
                          [
                            ['paint', 'Краска'],
                            ['wood', 'Дерево'],
                            ['fabric', 'Ткань'],
                            ['stone', 'Камень'],
                            ['metal', 'Металл'],
                            ['glass', 'Стекло'],
                            ['light', 'Свечение'],
                          ] as const
                        ).map(([id, label]) => (
                          <option key={id} value={id}>
                            {label}
                          </option>
                        ))}
                      </select>
                    </label>
                  </fieldset>
                  <p className="ed-hint">
                    Размеры — по осям объекта с учётом масштаба родителей,
                    координаты — относительно родителя. Цвет группы применяется
                    ко всем её деталям. Для отдельной детали выберите её в
                    списке.
                  </p>
                  {node.geometry.kind === 'wall' && (
                    <>
                      <div className="ed-object-actions">
                        <button
                          disabled={node.locked}
                          onClick={() => opening('door')}
                        >
                          <Plus />
                          Дверной проём
                        </button>
                        <button
                          disabled={node.locked}
                          onClick={() => opening('window')}
                        >
                          <Plus />
                          Окно
                        </button>
                      </div>
                      <Toggle
                        label="Убирать стену в режиме среза"
                        checked={node.cutaway}
                        onChange={(v) =>
                          patchNode((n) => {
                            n.cutaway = v;
                          })
                        }
                      />
                      <p className="ed-hint">
                        Проёмы находятся внутри стены. Выберите их в списке для
                        точной ширины, высоты и положения.
                      </p>
                    </>
                  )}
                  {node.geometry.polygon && (
                    <details>
                      <summary>Контур и отверстия пола / объёма</summary>
                      <p className="ed-hint">
                        Координаты X/Z в метрах относительно объекта. Полы,
                        отверстия и стены редактируются отдельно.
                      </p>
                      <fieldset disabled={node.locked}>
                        {[
                          node.geometry.polygon,
                          ...(node.geometry.holes ?? []),
                        ].map((contour, ci) => (
                          <details key={ci}>
                            <summary>
                              {ci === 0 ? 'Внешний контур' : `Отверстие ${ci}`}
                            </summary>
                            {contour.map((p, i) => (
                              <div key={i}>
                                <div className="ed-point">
                                  <span>{i + 1}</span>
                                  {(['X', 'Z'] as const).map((axis, ai) => (
                                    <Field
                                      key={axis}
                                      label={`${axis} точки ${i + 1}`}
                                      value={p[ai]}
                                      onCommit={(v) =>
                                        patchNode((n) => {
                                          const points =
                                            ci === 0
                                              ? n.geometry.polygon!
                                              : n.geometry.holes![ci - 1];
                                          points[i][ai] = v;
                                        })
                                      }
                                    />
                                  ))}
                                </div>
                                <div className="ed-point-actions">
                                  <button
                                    onClick={() =>
                                      patchNode((n) => {
                                        const points =
                                          ci === 0
                                            ? n.geometry.polygon!
                                            : n.geometry.holes![ci - 1];
                                        const a = points[i],
                                          b = points[(i + 1) % points.length];
                                        points.splice(i + 1, 0, [
                                          (a[0] + b[0]) / 2,
                                          (a[1] + b[1]) / 2,
                                        ]);
                                      })
                                    }
                                  >
                                    Вставить после
                                  </button>
                                  <button
                                    disabled={contour.length <= 3}
                                    onClick={() =>
                                      patchNode((n) => {
                                        const points =
                                          ci === 0
                                            ? n.geometry.polygon!
                                            : n.geometry.holes![ci - 1];
                                        points.splice(i, 1);
                                      })
                                    }
                                  >
                                    Удалить точку
                                  </button>
                                </div>
                              </div>
                            ))}
                            {ci > 0 && (
                              <button
                                className="ed-danger"
                                onClick={() =>
                                  patchNode((n) => {
                                    n.geometry.holes!.splice(ci - 1, 1);
                                  })
                                }
                              >
                                Удалить отверстие
                              </button>
                            )}
                          </details>
                        ))}
                        <button
                          onClick={() =>
                            patchNode((n) => {
                              const p = n.geometry.polygon!,
                                xs = p.map((p) => p[0]),
                                zs = p.map((p) => p[1]);
                              const x0 = Math.min(...xs),
                                x1 = Math.max(...xs),
                                z0 = Math.min(...zs),
                                z1 = Math.max(...zs);
                              const half = Math.min(
                                0.2,
                                (x1 - x0) / 10,
                                (z1 - z0) / 10,
                              );
                              for (const fx of [0.2, 0.4, 0.6, 0.8])
                                for (const fz of [0.2, 0.4, 0.6, 0.8]) {
                                  const x = x0 + (x1 - x0) * fx,
                                    z = z0 + (z1 - z0) * fz;
                                  const hole: [number, number][] = [
                                    [x - half, z - half],
                                    [x + half, z - half],
                                    [x + half, z + half],
                                    [x - half, z + half],
                                  ];
                                  const holes = [
                                    ...(n.geometry.holes ?? []),
                                    hole,
                                  ];
                                  try {
                                    validateContours(p, holes);
                                    n.geometry.holes = holes;
                                    return;
                                  } catch {
                                    /* Try another free part of the contour. */
                                  }
                                }
                              throw new Error(
                                'Нет свободного места для отверстия. Сначала измените контур.',
                              );
                            })
                          }
                        >
                          <Plus />
                          Добавить отверстие
                        </button>
                      </fieldset>
                    </details>
                  )}
                  <div className="ed-object-actions">
                    <button
                      onClick={() =>
                        attempt(() => commit(duplicateNode(project, node.id)))
                      }
                    >
                      <Copy />
                      Дублировать
                    </button>
                    <button
                      className="ed-danger"
                      disabled={node.locked}
                      onClick={() =>
                        attempt(() => commit(removeNode(project, node.id)))
                      }
                    >
                      <Trash2 />
                      Удалить
                    </button>
                  </div>
                </>
              ) : (
                <div className="ed-empty">
                  <MousePointer2 />
                  <h2>Выберите объект</h2>
                  <p>
                    Нажмите на модель или найдите предмет в списке. Для точной
                    детали включите «Детали».
                  </p>
                  <button onClick={() => setPanel('objects')}>
                    Открыть список объектов
                  </button>
                </div>
              ))}
            {panel === 'variants' && (
              <>
                <h2>Варианты интерьера</h2>
                <a
                  className="ed-gallery-link"
                  href="?view=gallery"
                  target="_blank"
                  rel="noreferrer"
                >
                  <Palette size={22} aria-hidden="true" />
                  <span>
                    <strong>Галерея интерьеров ↗</strong>
                    <small>12 визуализаций · квартира и санузлы</small>
                  </span>
                </a>
                <p className="ed-hint">
                  Палитра меняет материалы с исходными цветами. Индивидуально
                  заданные цвета сохраняются.
                </p>
                <div className="ed-styles">
                  {Object.entries(palettes).map(([id, p]) => (
                    <button
                      key={id}
                      className={view.palette === id ? 'active' : ''}
                      onClick={() =>
                        updateView({ palette: id as EditorView['palette'] })
                      }
                    >
                      <span style={{ background: p.swatch }} />
                      <strong>{p.name}</strong>
                      <small>{p.description}</small>
                    </button>
                  ))}
                </div>
                <h3>Освещение и вид</h3>
                <Toggle
                  label="Вечернее освещение"
                  checked={view.night}
                  onChange={(night) => updateView({ night })}
                />
                <Toggle
                  label="Срез стен"
                  checked={view.cutaway}
                  onChange={(cutaway) => updateView({ cutaway })}
                />
                <Toggle
                  label="Показывать мебель"
                  checked={view.furniture}
                  onChange={(furniture) => updateView({ furniture })}
                />
                <Toggle
                  label="Подписи комнат"
                  checked={view.labels}
                  onChange={(labels) => updateView({ labels })}
                />
                <Toggle
                  label="Сетка"
                  checked={view.grid}
                  onChange={(grid) => updateView({ grid })}
                />
                <div className="ed-viewpoints">
                  {(
                    [
                      ['overview', 'Вся квартира'],
                      ['top', 'Сверху'],
                      ['living', 'Из гостиной'],
                      ['bedroom', 'Из комнаты'],
                      ['bathroom', 'Из санузла'],
                    ] as const
                  ).map(([id, name]) => (
                    <button
                      key={id}
                      disabled={unavailable}
                      onClick={() => {
                        updateView({ mode: '3d' });
                        controller.current?.viewpoint(id);
                      }}
                    >
                      {name}
                    </button>
                  ))}
                </div>
                <h3>Сохранённые расстановки</h3>
                <p className="ed-hint">
                  Вариант хранит все стены, предметы, цвета и ракурс. Текущие
                  изменения сохраняются автоматически, а вариант обновляется
                  отдельной кнопкой.
                </p>
                <input
                  className="ed-search"
                  aria-label="Название нового варианта"
                  value={variantName}
                  maxLength={100}
                  onChange={(e) => setVariantName(e.target.value)}
                />
                <button
                  className="ed-primary ed-full"
                  onClick={() =>
                    attempt(() => {
                      commit(saveArrangement(project, variantName));
                      setNotice('Новый вариант сохранён.');
                    })
                  }
                >
                  <Save />
                  Сохранить как новый вариант
                </button>
                {active && (
                  <button
                    className="ed-full"
                    onClick={() =>
                      attempt(() => {
                        commit(saveArrangement(project, active.name, true));
                        setNotice('Текущий вариант обновлён.');
                      })
                    }
                  >
                    Обновить «{active.name}»
                  </button>
                )}
                <div className="ed-variants">
                  {project.arrangements.map((item) => (
                    <article
                      key={item.id}
                      className={
                        project.activeArrangement === item.id ? 'active' : ''
                      }
                    >
                      <TextField
                        label="Название варианта"
                        value={item.name}
                        onCommit={(name) => {
                          const next = clone(project);
                          next.arrangements.find(
                            (x) => x.id === item.id,
                          )!.name = name;
                          commit(next);
                        }}
                      />
                      <div>
                        <button
                          onClick={() =>
                            attempt(() =>
                              commit(loadArrangement(project, item.id)),
                            )
                          }
                        >
                          Открыть
                        </button>
                        <button
                          aria-label={`Удалить вариант ${item.name}`}
                          onClick={() => {
                            const next = clone(project);
                            next.arrangements = next.arrangements.filter(
                              (x) => x.id !== item.id,
                            );
                            if (next.activeArrangement === item.id)
                              next.activeArrangement = null;
                            commit(next);
                          }}
                        >
                          <Trash2 />
                        </button>
                      </div>
                    </article>
                  ))}
                </div>
              </>
            )}
            {panel === 'files' && (
              <>
                <h2>Проект и перенос</h2>
                <TextField
                  label="Название проекта"
                  value={project.name}
                  onCommit={(name) => commit({ ...project, name })}
                />
                <p className="ed-hint">
                  Изменения хранятся в этом браузере. Чтобы открыть их на другом
                  устройстве или сделать резервную копию, скачайте файл проекта.
                </p>
                <button
                  className="ed-primary ed-full"
                  onClick={() =>
                    attempt(() => {
                      download(
                        new Blob([exportProject(project)], {
                          type: 'application/json',
                        }),
                        'flatplan-project.json',
                      );
                      setNotice('Файл проекта подготовлен для скачивания.');
                    })
                  }
                >
                  <Download />
                  Скачать проект JSON
                </button>
                <button
                  className="ed-full"
                  onClick={() => fileInput.current?.click()}
                >
                  <Upload />
                  Импортировать проект
                </button>
                <input
                  type="file"
                  accept=".json,application/json"
                  ref={fileInput}
                  hidden
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) void readFile(file);
                  }}
                />
                <button
                  className="ed-full"
                  disabled={!ready || view.mode !== '3d'}
                  onClick={() => void saveImage()}
                >
                  <Camera />
                  Сохранить текущий 3D-вид PNG
                </button>
                {importName && (
                  <section
                    className="ed-import"
                    aria-label="Подтверждение импорта"
                  >
                    <strong>Открыть «{importName}»?</strong>
                    <p>
                      Файл проверен. Текущий проект заменится целиком, включая
                      варианты; действие можно отменить.
                    </p>
                    <button
                      className="ed-primary"
                      onClick={() => {
                        if (importRef.current) {
                          commit(importRef.current);
                          setStoragePaused(false);
                          setImportName(null);
                          importRef.current = null;
                          setNotice('Проект импортирован.');
                        }
                      }}
                    >
                      Открыть проект
                    </button>
                    <button
                      onClick={() => {
                        setImportName(null);
                        importRef.current = null;
                      }}
                    >
                      Отмена
                    </button>
                  </section>
                )}
                {storagePaused && (
                  <div className="ed-import">
                    <strong>Автосохранение приостановлено</strong>
                    <p>Можно скачать текущий проект перед продолжением.</p>
                    <button
                      onClick={() =>
                        attempt(() => {
                          const saved = readStoredProject(window.localStorage);
                          replaceProject(saved ?? createInitialProject());
                          setNotice('Открыт проект из хранилища браузера.');
                        })
                      }
                    >
                      Загрузить сохранённое в браузере
                    </button>
                    <button
                      onClick={() => {
                        setStoragePaused(false);
                        setError(null);
                      }}
                    >
                      Продолжить с текущим проектом
                    </button>
                  </div>
                )}
                <button className="ed-full" onClick={saveNow}>
                  <Save />
                  Сохранить сейчас в браузере
                </button>
                <details>
                  <summary>Новый проект по файлу .plan</summary>
                  <p className="ed-hint">
                    Откроет план квартиры с ванной и отдельные схемы санузла.
                    Сначала скачайте свой проект; сброс можно отменить.
                  </p>
                  <button
                    className="ed-danger"
                    onClick={() => {
                      commit(createInitialProject());
                      setStoragePaused(false);
                      setNotice(
                        'Создан исходный проект. Предыдущее состояние доступно через «Отменить».',
                      );
                    }}
                  >
                    Создать заново
                  </button>
                </details>
                <button
                  className="ed-danger ed-full"
                  aria-expanded={resetPending}
                  aria-controls="reset-user-data"
                  onClick={() => setResetPending((pending) => !pending)}
                >
                  <Trash2 />
                  Сбросить пользовательские данные
                </button>
                {resetPending && (
                  <section
                    id="reset-user-data"
                    className="ed-import"
                    aria-label="Подтверждение сброса"
                  >
                    <strong>Удалить все пользовательские данные?</strong>
                    <p>
                      Будут удалены изменения планировки, мебели и материалов,
                      сохранённые варианты, название проекта и настройки вида в
                      этом браузере. Откроется исходный план.
                    </p>
                    <p>
                      История отмены будет очищена. Сброс нельзя отменить. Для
                      резервной копии сначала скачайте проект JSON.
                    </p>
                    <button onClick={() => setResetPending(false)}>
                      Отмена
                    </button>
                    <button className="ed-danger" onClick={resetUserData}>
                      Сбросить безвозвратно
                    </button>
                  </section>
                )}
                <div className="ed-reference">
                  <h3>Основа — файл .plan</h3>
                  <p>
                    Высота стен в исходном файле — 2,70 м. В плане квартиры
                    четыре оконных и французских проёма.
                  </p>
                  <p>
                    Геометрия соответствует файлу; форма деталей мебели и
                    отделка условные. Стены и полы независимы: после переноса
                    стены скорректируйте точки пола при необходимости.
                  </p>
                </div>
              </>
            )}
          </div>
        </aside>
        <section className="ed-viewer" aria-label="Модель квартиры">
          <div className="ed-toolbar">
            <div className="ed-segment">
              <button
                aria-pressed={view.mode === '3d'}
                className={view.mode === '3d' ? 'active' : ''}
                disabled={unavailable}
                onClick={() => updateView({ mode: '3d' })}
              >
                <Box />
                3D
              </button>
              <button
                aria-pressed={view.mode === '2d'}
                className={view.mode === '2d' ? 'active' : ''}
                onClick={() => updateView({ mode: '2d' })}
              >
                <Grid2X2 />
                План
              </button>
            </div>
            <div className="ed-segment">
              <IconButton
                label="Вращать вид"
                active={tool === 'orbit'}
                onClick={() => setTool('orbit')}
              >
                <MousePointer2 />
              </IconButton>
              <IconButton
                label="Перемещать объект"
                active={tool === 'translate'}
                onClick={() => setTool('translate')}
              >
                <Move />
              </IconButton>
              <IconButton
                label="Повернуть объект"
                active={tool === 'rotate'}
                disabled={view.mode === '2d'}
                onClick={() => setTool('rotate')}
              >
                <RotateCw />
              </IconButton>
            </div>
            <label className="ed-detail">
              <input
                type="checkbox"
                checked={detail}
                onChange={(e) => setDetail(e.target.checked)}
              />
              Детали
            </label>
            <IconButton
              label={view.night ? 'Дневной свет' : 'Вечерний свет'}
              onClick={() => updateView({ night: !view.night })}
            >
              {view.night ? <Moon /> : <Sun />}
            </IconButton>
          </div>
          <div
            className="ed-canvas"
            ref={host}
            style={{ display: view.mode === '3d' ? 'block' : 'none' }}
          />
          {view.mode === '2d' && (
            <Plan
              key={tool}
              project={project}
              selected={selected}
              tool={tool}
              detail={detail}
              onSelect={select}
              onMove={change}
              onView={updateView}
            />
          )}
          {!ready && !unavailable && view.mode === '3d' && (
            <output className="ed-loading">Загружаем 3D-модель…</output>
          )}
          <div className="ed-viewer-bottom">
            <div>
              <strong>{node?.name ?? project.name}</strong>
              <span>
                {tool === 'orbit'
                  ? view.mode === '2d'
                    ? 'Тяните план · два пальца — масштаб'
                    : 'Один палец — вращение · два — масштаб'
                  : tool === 'translate'
                    ? view.mode === '2d'
                      ? 'Перетаскивайте выбранный объект'
                      : 'Тяните за цветные оси выбранного объекта'
                    : 'Тяните за зелёное кольцо · шаг 5°'}
              </span>
            </div>
            {view.mode === '3d' && (
              <div className="ed-camera-buttons">
                <IconButton
                  label="Приблизить"
                  disabled={!ready}
                  onClick={() => controller.current?.zoom(0.8)}
                >
                  <Plus />
                </IconButton>
                <IconButton
                  label="Отдалить"
                  disabled={!ready}
                  onClick={() => controller.current?.zoom(1.25)}
                >
                  <Minus />
                </IconButton>
                <IconButton
                  label="Вся квартира"
                  disabled={!ready}
                  onClick={() => controller.current?.focus()}
                >
                  <Focus />
                </IconButton>
              </div>
            )}
          </div>
        </section>
      </main>
      <footer className="ed-footer">
        <span>Геометрия из файла .plan · размеры редактируются</span>
        <span>{flattenNodes(project.scene.objects).length} элементов</span>
      </footer>
    </div>
  );
}
