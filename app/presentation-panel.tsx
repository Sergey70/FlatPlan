/* All images are local object URLs, without an image service. */
/* oxlint-disable next/no-img-element */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  clone,
  type CameraState,
  type EditorProject,
  type EditorView,
} from '@/lib/editor-model';
import { measuredRooms } from '@/lib/room-surfaces';
import { presentationViews } from '@/lib/presentation-views';
import type { EditorScene } from '@/lib/editor-scene';
interface RenderResult {
  id: string;
  label: string;
  url: string;
  width: number;
  height: number;
}
function PresentationDialog({
  project,
  onClose,
}: {
  project: EditorProject;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null),
    host = useRef<HTMLDivElement>(null),
    engine = useRef<EditorScene | null>(null),
    job = useRef<AbortController | null>(null),
    urls = useRef(new Set<string>());
  const rooms = useMemo(() => measuredRooms(project.scene.objects), [project]);
  const [roomId, setRoomId] = useState(
    () => rooms.find((r) => /кух/i.test(r.name))?.id ?? rooms[0]?.id ?? '',
  );
  const views = useMemo(
    () => presentationViews(project.scene, roomId),
    [project, roomId],
  );
  const [camera, setCamera] = useState<CameraState | null>(
      () =>
        presentationViews(project.scene, roomId)[0]?.camera ??
        project.scene.view.camera,
    ),
    [selected, setSelected] = useState(''),
    [ready, setReady] = useState(false),
    [error, setError] = useState<string | null>(null),
    [busy, setBusy] = useState(false),
    [progress, setProgress] = useState(''),
    [results, setResults] = useState<RenderResult[]>([]),
    [width, setWidth] = useState(() => (innerWidth < 768 ? 1280 : 1920));
  const view = useMemo<EditorView>(
    () => ({
      ...project.scene.view,
      mode: '3d',
      cutaway: false,
      furniture: true,
      labels: false,
      grid: false,
      selected: null,
      ...(project.scene.view.walk
        ? { walk: { ...project.scene.view.walk, enabled: false } }
        : {}),
    }),
    [project],
  );
  const latest = useRef({ camera, view });
  const onCamera = useCallback((next: CameraState) => {
    setCamera(next);
    setSelected('');
  }, []);
  useEffect(() => {
    latest.current = { camera, view };
    engine.current?.update(project.scene.objects, view);
    engine.current?.camera(camera);
  }, [camera, view, project]);
  useEffect(() => {
    const element = dialog.current!;
    element.showModal();
    element.querySelector<HTMLSelectElement>('select')?.focus();
    let active = true,
      renderer: EditorScene | null = null;
    import('@/lib/editor-scene')
      .then(({ createEditorScene }) => {
        if (!active || !host.current) return;
        renderer = createEditorScene(
          host.current,
          {
            select: () => {},
            change: () => {},
            camera: onCamera,
            error: (message) => {
              if (active) setError(message);
            },
            ready: () => {},
          },
          { presentation: true, fov: 68, ceilingHeight: 2.7 },
        );
        engine.current = renderer;
        renderer.update(project.scene.objects, latest.current.view);
        renderer.camera(latest.current.camera);
        setReady(true);
      })
      .catch((error) => {
        if (active) setError((error as Error).message);
      });
    const ownedUrls = urls.current;
    return () => {
      active = false;
      job.current?.abort();
      engine.current = null;
      renderer?.dispose();
      ownedUrls.forEach((url) => URL.revokeObjectURL(url));
      ownedUrls.clear();
      element.close();
    };
  }, [project, onCamera]);
  function chooseRoom(id: string) {
    const next = presentationViews(project.scene, id);
    setRoomId(id);
    setSelected(next[0]?.id ?? '');
    setCamera(next[0]?.camera ?? null);
    setProgress('');
  }
  async function generate(all: boolean) {
    if (!engine.current || !camera) return;
    const list = all
      ? views
      : [
          {
            id: 'custom',
            label: `${rooms.find((r) => r.id === roomId)?.name ?? 'Помещение'} · текущий ракурс`,
            camera,
          },
        ];
    const controller = new AbortController();
    job.current = controller;
    setBusy(true);
    setError(null);
    try {
      for (let index = 0; index < list.length; index++) {
        controller.signal.throwIfAborted();
        const shot = list[index];
        engine.current!.camera(shot.camera);
        setCamera(shot.camera);
        const height = Math.round((width * 2) / 3);
        setProgress(`Изображение ${index + 1} из ${list.length}: подготовка…`);
        const blob = await engine.current!.renderImage({
          width,
          height,
          samples: 12,
          signal: controller.signal,
          progress: (done, total) =>
            setProgress(
              `Изображение ${index + 1} из ${list.length}: ${Math.round((done / total) * 100)}%`,
            ),
        });
        controller.signal.throwIfAborted();
        const url = URL.createObjectURL(blob);
        urls.current.add(url);
        setResults((previous) => {
          const dropped =
            previous.length >= 12
              ? previous.slice(0, previous.length - 11)
              : [];
          dropped.forEach((result) => {
            URL.revokeObjectURL(result.url);
            urls.current.delete(result.url);
          });
          return [
            ...previous.slice(-11),
            { id: crypto.randomUUID(), label: shot.label, url, width, height },
          ];
        });
      }
      setProgress(
        `Готово: ${list.length} ${list.length === 1 ? 'изображение' : 'изображения'}. Сохраните нужные PNG перед закрытием.`,
      );
    } catch (e) {
      if (controller.signal.aborted)
        setProgress(
          'Создание изображений отменено. Готовые снимки доступны ниже.',
        );
      else {
        setError((e as Error).message);
        setProgress('');
      }
    } finally {
      if (job.current === controller) {
        job.current = null;
        setBusy(false);
      }
    }
  }
  return (
    <dialog
      ref={dialog}
      className="ed-render-dialog"
      aria-label="Изображения текущей модели"
      onCancel={onClose}
      onKeyDown={(e) => e.stopPropagation()}
      onKeyUp={(e) => e.stopPropagation()}
    >
      <div className="ed-render-heading">
        <div>
          <h2>Изображения интерьера</h2>
          <p>Текущая модель: мебель, стены, проёмы и отделка.</p>
        </div>
        <button onClick={onClose}>Закрыть изображения</button>
      </div>
      <div className="ed-render-layout">
        <aside className="ed-render-controls">
          <label>
            Помещение
            <select
              aria-label="Помещение для изображений"
              value={roomId}
              disabled={busy}
              onChange={(e) => chooseRoom(e.target.value)}
            >
              {rooms.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Ракурс
            <select
              aria-label="Ракурс изображения"
              value={selected}
              disabled={busy}
              onChange={(e) => {
                const shot = views.find((v) => v.id === e.target.value);
                if (shot) {
                  setSelected(shot.id);
                  setCamera(shot.camera);
                }
              }}
            >
              <option value="">Текущий ракурс</option>
              {views.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            Размер PNG
            <select
              aria-label="Размер изображения"
              value={width}
              disabled={busy}
              onChange={(e) => setWidth(Number(e.target.value))}
            >
              {[1280, 1920, 2560].map((w) => (
                <option key={w} value={w}>
                  {w} × {Math.round((w * 2) / 3)}
                </option>
              ))}
            </select>
          </label>
          <button
            className="ed-primary"
            disabled={!ready || busy || !camera}
            onClick={() => generate(false)}
          >
            Создать изображение
          </button>
          <button
            disabled={!ready || busy || !views.length}
            onClick={() => generate(true)}
          >
            Создать ракурсы помещения ({views.length})
          </button>
          {busy && (
            <button onClick={() => job.current?.abort()}>
              Отменить создание
            </button>
          )}
          <output aria-live="polite">{progress}</output>
          {error && (
            <p role="alert" className="ed-operation-error">
              {error}
            </p>
          )}
          {!views.length && (
            <p>
              Нет свободных точек для автоматических ракурсов. Освободите место
              в помещении и откройте инструмент заново.
            </p>
          )}
          <p>
            Поверните камеру в предпросмотре или выберите готовый ракурс. После
            изменений проекта откройте инструмент заново.
          </p>
          <p>
            Снимки создаются в браузере. Они точны относительно геометрии
            модели; детализация мебели остаётся схематичной. Отражения и
            освещение приближённые.
          </p>
          <p>
            Хранятся 12 последних изображений до закрытия окна. Скачайте нужные
            файлы.
          </p>
        </aside>
        <div className="ed-render-main">
          <div
            className={`ed-render-preview${busy ? ' ed-render-busy' : ''}`}
            ref={host}
            data-render-ready={ready}
          />
          {!ready && !error && <p>Загрузка 3D…</p>}
          <p>
            Предпросмотр. На итоговом PNG уточняются тени, отражения и
            сглаживание.
          </p>
        </div>
      </div>
      {!!results.length && (
        <section aria-label="Готовые изображения" className="ed-render-results">
          <h3>Готовые изображения</h3>
          <div>
            {results.map((result) => (
              <figure key={result.id}>
                <a href={result.url} target="_blank" rel="noreferrer">
                  <img src={result.url} alt={result.label} />
                </a>
                <figcaption>
                  <strong>{result.label}</strong>
                  <span>
                    {result.width} × {result.height}
                  </span>
                  <a href={result.url} download={`flatplan-${result.id}.png`}>
                    Скачать PNG
                  </a>
                </figcaption>
              </figure>
            ))}
          </div>
        </section>
      )}
    </dialog>
  );
}
export function PresentationPanel({ project }: { project: EditorProject }) {
  const [snapshot, setSnapshot] = useState<EditorProject | null>(null);
  return (
    <section className="ed-design-section" aria-label="Изображения интерьера">
      <h3>Изображения текущей модели</h3>
      <p>
        Создайте PNG после изменения планировки, мебели или материалов. До
        четырёх ракурсов на помещение, мягкие тени и отражения.
      </p>
      <button
        className="ed-primary"
        onClick={() => setSnapshot(clone(project))}
      >
        Открыть изображения
      </button>
      {snapshot && (
        <PresentationDialog
          project={snapshot}
          onClose={() => setSnapshot(null)}
        />
      )}
    </section>
  );
}
