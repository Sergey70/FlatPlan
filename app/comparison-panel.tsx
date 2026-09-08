import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  clone,
  type Arrangement,
  type CameraState,
  type EditorProject,
  type EditorView,
  type SceneNode,
} from '@/lib/editor-model';
import { planDrawing } from '@/lib/editor-geometry';
import { fitCamera } from '@/lib/camera-fit';
import {
  compareArrangements,
  comparisonObjects,
  comparisonBounds,
  comparisonColors,
  arrangementMetrics,
} from '@/lib/arrangement-comparison';
import type { EditorScene } from '@/lib/editor-scene';
import { DesignCheck, DesignNumber } from './design-controls';
type PlanView = { x: number; z: number; zoom: number };
const format = (v: number) =>
  v.toLocaleString('ru-RU', { maximumFractionDigits: 2 });
const kindNames = {
  added: 'Добавлено в B',
  removed: 'Отсутствует в B',
  changed: 'Изменено',
};
function comparisonView(
  s: Arrangement,
  cutaway: boolean,
  selected: string | null,
): EditorView {
  return {
    ...s.view,
    mode: '3d',
    labels: false,
    grid: false,
    furniture: true,
    cutaway,
    selected,
    ...(s.view.walk ? { walk: { ...s.view.walk, enabled: false } } : {}),
  };
}
function Comparison3D({
  nodes,
  view,
  camera,
  onCamera,
  onSelect,
  side,
}: {
  nodes: SceneNode[];
  view: EditorView;
  camera: CameraState;
  onCamera: (c: CameraState) => void;
  onSelect: (id: string | null) => void;
  side: string;
}) {
  const host = useRef<HTMLDivElement>(null),
    engine = useRef<EditorScene | null>(null);
  const latest = useRef({ nodes, view, camera });
  const [ready, setReady] = useState(false),
    [error, setError] = useState<string | null>(null);
  useEffect(() => {
    latest.current = { nodes, view, camera };
    engine.current?.update(nodes, view);
    engine.current?.camera(camera);
  }, [nodes, view, camera]);
  useEffect(() => {
    let active = true,
      renderer: EditorScene | null = null;
    import('@/lib/editor-scene')
      .then(({ createEditorScene }) => {
        if (!active || !host.current) return;
        renderer = createEditorScene(host.current, {
          select: onSelect,
          change: () => {},
          camera: onCamera,
          error: (message) => {
            if (active) setError(message);
          },
          ready: () => {},
        });
        engine.current = renderer;
        const state = latest.current;
        renderer.update(state.nodes, state.view);
        renderer.camera(state.camera);
        setReady(true);
      })
      .catch((e) => {
        if (active) setError((e as Error).message);
      });
    return () => {
      active = false;
      engine.current = null;
      renderer?.dispose();
    };
  }, [onCamera, onSelect]);
  return (
    <div
      className="ed-compare-render"
      data-comparison-camera={JSON.stringify(camera)}
      data-comparison-ready={ready}
      data-comparison-side={side}
    >
      <div className="ed-compare-canvas" ref={host} />
      {!ready && !error && <p className="ed-compare-state">Загрузка 3D…</p>}
      {error && (
        <p className="ed-compare-state ed-operation-error" role="alert">
          {error} Переключитесь на план или откройте сравнение заново.
        </p>
      )}
    </div>
  );
}
function ComparisonPlan({
  nodes,
  view,
  bounds,
  pan,
  onPan,
  selected,
  side,
}: {
  nodes: SceneNode[];
  view: EditorView;
  bounds: ReturnType<typeof comparisonBounds>;
  pan: PlanView;
  onPan: (p: PlanView) => void;
  selected: string | null;
  side: string;
}) {
  const parts = useMemo(
    () => planDrawing(nodes, { palette: view.palette, furniture: true }),
    [nodes, view.palette],
  );
  const w = (bounds.max[0] - bounds.min[0] + 1) / pan.zoom,
    h = (bounds.max[2] - bounds.min[2] + 1) / pan.zoom;
  const pointers = useRef(new Map<number, [number, number]>());
  const gesture = useRef<{
    view: PlanView;
    scale: number;
    x: number;
    y: number;
    distance: number;
  } | null>(null);
  function start(svg: SVGSVGElement) {
    const points = [...pointers.current.values()];
    if (!points.length) {
      gesture.current = null;
      return;
    }
    const a = points[0],
      b = points[1] ?? a;
    gesture.current = {
      view: pan,
      scale: svg.getScreenCTM()?.a ?? 1,
      x: (a[0] + b[0]) / 2,
      y: (a[1] + b[1]) / 2,
      distance: points.length === 2 ? Math.hypot(b[0] - a[0], b[1] - a[1]) : 0,
    };
  }
  return (
    <svg
      className="ed-compare-plan"
      aria-label={`План сравнения ${side}`}
      viewBox={`${pan.x - w / 2} ${pan.z - h / 2} ${w} ${h}`}
      onPointerDown={(e) => {
        if (e.button !== 0) return;
        e.currentTarget.setPointerCapture(e.pointerId);
        pointers.current.set(e.pointerId, [e.clientX, e.clientY]);
        start(e.currentTarget);
      }}
      onPointerMove={(e) => {
        if (!pointers.current.has(e.pointerId) || !gesture.current) return;
        pointers.current.set(e.pointerId, [e.clientX, e.clientY]);
        const points = [...pointers.current.values()],
          a = points[0],
          b = points[1] ?? a,
          g = gesture.current;
        const ratio =
          points.length === 2 && g.distance > 1
            ? Math.hypot(b[0] - a[0], b[1] - a[1]) / g.distance
            : 1;
        onPan({
          x: g.view.x - ((a[0] + b[0]) / 2 - g.x) / g.scale,
          z: g.view.z - ((a[1] + b[1]) / 2 - g.y) / g.scale,
          zoom: Math.max(0.25, Math.min(8, g.view.zoom * ratio)),
        });
      }}
      onPointerUp={(e) => {
        pointers.current.delete(e.pointerId);
        gesture.current = null;
      }}
      onPointerCancel={() => {
        pointers.current.clear();
        gesture.current = null;
      }}
      onLostPointerCapture={(e) => {
        pointers.current.delete(e.pointerId);
        gesture.current = null;
      }}
    >
      <title>
        Общий масштаб и положение двух планов. Тяните мышью или пальцем; стрелки
        перемещают вид, плюс и минус меняют масштаб.
      </title>
      {parts.map((p, i) => (
        <path
          key={i}
          data-comparison-object={p.id}
          d={[p.points, ...p.holes]
            .map(
              (points) =>
                `M${points.map((v) => v.join(' ')).join('L')}${p.strokeOnly ? '' : 'Z'}`,
            )
            .join(' ')}
          fillRule="evenodd"
          fill={p.strokeOnly ? 'none' : p.color}
          fillOpacity={p.kind === 'floor' ? 0.7 : 0.9}
          stroke={
            p.id === selected || p.rootId === selected ? '#223f50' : '#697571'
          }
          strokeWidth={
            p.id === selected || p.rootId === selected ? 0.05 : 0.015
          }
        />
      ))}
    </svg>
  );
}
function ComparisonDialog({
  project,
  onClose,
}: {
  project: EditorProject;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null),
    firstField = useRef<HTMLSelectElement>(null);
  const options = useMemo(
    () => [
      { id: 'current', name: 'Текущая сцена', scene: project.scene },
      ...project.arrangements.map((a) => ({
        id: `saved:${a.id}`,
        name: a.name,
        scene: a.scene,
      })),
    ],
    [project],
  );
  const [left, setLeft] = useState('current'),
    [right, setRight] = useState(
      options.find((o) => o.id === `saved:${project.activeArrangement}`)?.id ??
        options[1]?.id ??
        'current',
    );
  const a = options.find((o) => o.id === left)!,
    b = options.find((o) => o.id === right)!;
  const [mode, setMode] = useState<'2d' | '3d'>('2d'),
    [highlight, setHighlight] = useState(true),
    [cutaway, setCutaway] = useState(true);
  const [selected, setSelected] = useState<string | null>(null),
    [gap, setGap] = useState(0.8);
  const bounds = useMemo(
    () => comparisonBounds(a.scene, b.scene),
    [a.scene, b.scene],
  );
  const fitted = useMemo(() => {
    const fit = fitCamera(bounds, 1.25, 40);
    return { position: fit.position.toArray(), target: fit.target.toArray() };
  }, [bounds]);
  const initialPan = useMemo(
    () => ({
      x: (bounds.min[0] + bounds.max[0]) / 2,
      z: (bounds.min[2] + bounds.max[2]) / 2,
      zoom: 1,
    }),
    [bounds],
  );
  const [camera, setCamera] = useState<CameraState>(fitted),
    [pan, setPan] = useState<PlanView>(initialPan);
  const onCamera = useCallback((c: CameraState) => setCamera(c), []);

  useEffect(() => {
    const element = dialog.current!;
    element.showModal();
    firstField.current?.focus();
    return () => element.close();
  }, []);
  const changes = useMemo(
    () => compareArrangements(a.scene, b.scene),
    [a.scene, b.scene],
  );
  const nodesA = useMemo(
    () => comparisonObjects(a.scene, changes, 'a', highlight),
    [a.scene, changes, highlight],
  );
  const nodesB = useMemo(
    () => comparisonObjects(b.scene, changes, 'b', highlight),
    [b.scene, changes, highlight],
  );
  const viewA = useMemo(
    () => comparisonView(a.scene, cutaway, selected),
    [a.scene, cutaway, selected],
  );
  const viewB = useMemo(
    () => comparisonView(b.scene, cutaway, selected),
    [b.scene, cutaway, selected],
  );
  function choose(side: 'A' | 'B', id: string) {
    const nextA = side === 'A' ? options.find((o) => o.id === id)! : a;
    const nextB = side === 'B' ? options.find((o) => o.id === id)! : b;
    const nextBounds = comparisonBounds(nextA.scene, nextB.scene),
      fit = fitCamera(nextBounds, 1.25, 40);
    setCamera({
      position: fit.position.toArray(),
      target: fit.target.toArray(),
    });
    setPan({
      x: (nextBounds.min[0] + nextBounds.max[0]) / 2,
      z: (nextBounds.min[2] + nextBounds.max[2]) / 2,
      zoom: 1,
    });
    setSelected(null);
    (side === 'A' ? setLeft : setRight)(id);
  }
  const metricsA = useMemo(
    () => arrangementMetrics(a.scene, gap),
    [a.scene, gap],
  );
  const metricsB = useMemo(
    () => arrangementMetrics(b.scene, gap),
    [b.scene, gap],
  );
  const zoom = (factor: number) => {
    if (mode === '2d')
      setPan((p) => ({
        ...p,
        zoom: Math.max(0.25, Math.min(8, p.zoom * factor)),
      }));
    else
      setCamera((c) => ({
        ...c,
        position: c.position.map(
          (v, i) => c.target[i] + (v - c.target[i]) / factor,
        ) as CameraState['position'],
      }));
  };
  const labels = {
    collision: 'Пересечения',
    door: 'Занятые зоны дверей',
    clearance: 'Зоны использования',
    gap: 'Узкие зазоры',
  };
  const metrics: [string, string, string][] = [
    ['Пол, м²', format(metricsA.floor), format(metricsB.floor)],
    ['Стены, м²', format(metricsA.walls), format(metricsB.walls)],
    ['Плинтус, м', format(metricsA.skirting), format(metricsB.skirting)],
    [
      'Материалы',
      `${format(metricsA.total)} ${metricsA.currency}`,
      `${format(metricsB.total)} ${metricsB.currency}`,
    ],
    ['Позиций без цены', String(metricsA.unpriced), String(metricsB.unpriced)],
    ...Object.entries(labels).map(
      ([key, label]) =>
        [
          label,
          String(metricsA.issues.filter((i) => i.kind === key).length),
          String(metricsB.issues.filter((i) => i.kind === key).length),
        ] as [string, string, string],
    ),
  ];
  return (
    <dialog
      className="ed-comparison-dialog"
      ref={dialog}
      aria-labelledby="ed-comparison-title"
      onCancel={onClose}
      onKeyDown={(e) => e.stopPropagation()}
      onKeyUp={(e) => e.stopPropagation()}
    >
      <header className="ed-compare-heading">
        <div>
          <h2 id="ed-comparison-title">Сравнение планировок</h2>
          <p>
            Текущая сцена — состояние на момент открытия. Просмотр не изменяет
            проект.
          </p>
        </div>
        <button onClick={onClose} aria-label="Закрыть сравнение">
          Закрыть
        </button>
      </header>
      <div className="ed-compare-choices">
        {[
          { label: 'A', value: left },
          { label: 'B', value: right },
        ].map((item, i) => (
          <label key={item.label} className="ed-design-field">
            Вариант {item.label}
            <select
              ref={i === 0 ? firstField : undefined}
              aria-label={`Вариант сравнения ${item.label}`}
              value={item.value}
              onChange={(e) => choose(item.label as 'A' | 'B', e.target.value)}
            >
              {options.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
            </select>
          </label>
        ))}
      </div>
      <div className="ed-compare-toolbar">
        <button aria-pressed={mode === '2d'} onClick={() => setMode('2d')}>
          Сравнить планы
        </button>
        <button aria-pressed={mode === '3d'} onClick={() => setMode('3d')}>
          Сравнить в 3D
        </button>
        <button aria-label="Приблизить оба варианта" onClick={() => zoom(1.25)}>
          +
        </button>
        <button aria-label="Отдалить оба варианта" onClick={() => zoom(0.8)}>
          −
        </button>
        <button
          onClick={() => {
            setCamera(fitted);
            setPan(initialPan);
          }}
        >
          Показать оба целиком
        </button>
        <DesignCheck
          label="Подсветить изменения"
          checked={highlight}
          onChange={setHighlight}
        />
        {mode === '3d' && (
          <DesignCheck
            label="Срез стен в сравнении"
            checked={cutaway}
            onChange={setCutaway}
          />
        )}
      </div>

      {mode === '2d' && (
        <div className="ed-compare-pan-buttons">
          <span>Сдвинуть оба плана</span>
          {[
            ['влево', '←', -1, 0],
            ['вправо', '→', 1, 0],
            ['вверх', '↑', 0, -1],
            ['вниз', '↓', 0, 1],
          ].map(([label, arrow, dx, dz]) => (
            <button
              key={label}
              aria-label={`Сдвинуть оба плана ${label}`}
              onClick={() =>
                setPan((p) => ({
                  ...p,
                  x: p.x + Number(dx) / p.zoom,
                  z: p.z + Number(dz) / p.zoom,
                }))
              }
            >
              {arrow}
            </button>
          ))}
        </div>
      )}
      <p className="ed-compare-legend">
        {Object.entries(kindNames).map(([key, name]) => (
          <span key={key}>
            <i
              style={{
                background:
                  comparisonColors[key as keyof typeof comparisonColors],
              }}
            />
            {name}
          </span>
        ))}
      </p>
      <div className="ed-compare-views">
        {[
          { option: a, nodes: nodesA, view: viewA, side: 'A' },
          { option: b, nodes: nodesB, view: viewB, side: 'B' },
        ].map((item) => (
          <figure key={item.side}>
            <figcaption>
              {item.side} · {item.option.name}
            </figcaption>
            {mode === '2d' ? (
              <ComparisonPlan
                nodes={item.nodes}
                view={item.view}
                bounds={bounds}
                pan={pan}
                onPan={setPan}
                selected={selected}
                side={item.side}
              />
            ) : (
              <Comparison3D
                nodes={item.nodes}
                view={item.view}
                camera={camera}
                onCamera={onCamera}
                onSelect={setSelected}
                side={item.side}
              />
            )}
          </figure>
        ))}
      </div>
      <p className="ed-hint">
        {mode === '2d'
          ? 'Тяните любой план для перемещения; два пальца меняют общий масштаб. Кнопки над планами доступны с клавиатуры.'
          : 'Вращайте любой вид мышью или пальцем; второй повторяет тот же ракурс. Положение камеры общее, отделка и свет каждого варианта сохраняются.'}
      </p>
      <details className="ed-design-details" open>
        <summary>Изменения геометрии и отделки · {changes.length}</summary>
        {!changes.length ? (
          <p className="ed-hint">
            Различий в видимой геометрии и отделке не найдено.
          </p>
        ) : (
          <ul className="ed-compare-changes">
            {changes.map((c) => (
              <li key={c.id}>
                <button
                  data-comparison-change={c.id}
                  aria-pressed={selected === c.id}
                  onClick={() => setSelected(c.id)}
                >
                  <i style={{ background: comparisonColors[c.kind] }} />
                  {c.name} · {kindNames[c.kind]}
                </button>
              </li>
            ))}
          </ul>
        )}
        <p className="ed-hint">
          Скрытый в одном варианте объект считается отсутствующим в нём.
          Группировка, блокировки, подписи и настройки камеры сами по себе не
          изменяют геометрию.
        </p>
      </details>
      <details className="ed-design-details" open>
        <summary>Проходы, материалы и стоимость</summary>
        <DesignNumber
          label="Порог узкого зазора в сравнении, см"
          value={gap * 100}
          min={30}
          max={150}
          onChange={(v) => setGap(v / 100)}
        />
        <div className="ed-estimate-table">
          <table aria-label="Показатели двух планировок">
            <thead>
              <tr>
                <th>Показатель</th>
                <th>A</th>
                <th>B</th>
              </tr>
            </thead>
            <tbody>
              {metrics.map(([name, x, y]) => (
                <tr key={name}>
                  <th>{name}</th>
                  <td>{x}</td>
                  <td>{y}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="ed-hint">
          {metricsA.currency === metricsB.currency
            ? `Разница стоимости B − A: ${format(metricsB.total - metricsA.total)} ${metricsA.currency}.`
            : 'Валюты различаются; стоимость не пересчитывается.'}{' '}
          Используются цены каждого варианта; позиции без цены не входят в
          стоимость. Стены и полы остаются независимыми контурами.
        </p>
        <div className="ed-compare-details">
          {[
            { m: metricsA, label: 'A' },
            { m: metricsB, label: 'B' },
          ].map(({ m, label }) => (
            <details key={label}>
              <summary>
                Замечания по проходам · {label} · {m.issues.length}
              </summary>
              {!m.issues.length && (
                <p className="ed-hint">
                  В выбранных проверках замечаний не найдено.
                </p>
              )}
              <ul>
                {m.issues.map((i) => (
                  <li key={i.id}>
                    {labels[i.kind]}: {i.names.join(' / ')}
                    {i.distance === undefined
                      ? ''
                      : ` · ${format(i.distance * 100)} см`}
                  </li>
                ))}
              </ul>
            </details>
          ))}
        </div>
        <details>
          <summary>Объёмы по помещениям</summary>
          <div className="ed-estimate-table">
            <table>
              <thead>
                <tr>
                  <th>Вариант / помещение</th>
                  <th>Пол, м²</th>
                  <th>Стены, м²</th>
                  <th>Плинтус, м</th>
                </tr>
              </thead>
              <tbody>
                {[
                  { m: metricsA, label: 'A' },
                  { m: metricsB, label: 'B' },
                ].flatMap(({ m, label }) =>
                  m.rooms.map((r) => (
                    <tr key={`${label}:${r.id}`}>
                      <th>
                        {label} · {r.name}
                      </th>
                      <td>{format(r.floor)}</td>
                      <td>{format(r.walls)}</td>
                      <td>{format(r.skirting)}</td>
                    </tr>
                  )),
                )}
              </tbody>
            </table>
          </div>
        </details>
        <p className="ed-hint">
          Проверки используют реальные проёмы, высоты и проекции предметов.
          Узкие зазоры — найденные расстояния между препятствиями, а не проверка
          непрерывного маршрута или строительных норм. Площадь стен не включает
          откосы, торцы и наружные стороны.
        </p>
      </details>
    </dialog>
  );
}
export function ComparisonPanel({ project }: { project: EditorProject }) {
  const [snapshot, setSnapshot] = useState<EditorProject | null>(null);
  return (
    <section
      className="ed-design-panel"
      aria-label="Сравнение личных планировок"
    >
      <h3>Сравнение планировок</h3>
      <p className="ed-hint">
        Откройте рядом текущую сцену и любой сохранённый вариант либо два
        сохранённых варианта. Ракурс и масштаб будут общими.
      </p>
      <button
        className="ed-primary ed-full"
        onClick={() => setSnapshot(clone(project))}
      >
        Открыть сравнение
      </button>
      {snapshot && (
        <ComparisonDialog
          project={snapshot}
          onClose={() => setSnapshot(null)}
        />
      )}
    </section>
  );
}
