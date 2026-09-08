/* The sheet is a local SVG, displayed without any image service. */
/* oxlint-disable next/no-img-element */
import { useEffect, useMemo, useRef, useState } from 'react';
import { clone, type EditorProject } from '@/lib/editor-model';
import { buildDrawingSet, type DrawingSheet } from '@/lib/drawing-sheets';
import { drawingSetPdf } from '@/lib/drawing-pdf';
import { measuredRooms } from '@/lib/room-surfaces';
import { DesignCheck } from './design-controls';
function DrawingsDialog({
  project,
  onClose,
}: {
  project: EditorProject;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null),
    job = useRef<AbortController | null>(null);
  const rooms = useMemo(() => measuredRooms(project.scene.objects), [project]);
  const [selectedRooms, setSelectedRooms] = useState(() =>
    rooms.filter((r) => /кух|сануз|ванн/i.test(r.name)).map((r) => r.id),
  );
  const [zoom, setZoom] = useState(1);
  const [selected, setSelected] = useState('plan'),
    [busy, setBusy] = useState(false),
    [progress, setProgress] = useState(''),
    [error, setError] = useState<string | null>(null);
  const result = useMemo<{
    sheets: DrawingSheet[];
    error: string | null;
  }>(() => {
    try {
      return {
        sheets: buildDrawingSet(project.scene, project.name, selectedRooms),
        error: null,
      };
    } catch (error) {
      return { sheets: [], error: (error as Error).message };
    }
  }, [project, selectedRooms]);
  const sheet =
    result.sheets.find((s) => s.id === selected) ?? result.sheets[0];
  useEffect(() => {
    const element = dialog.current!;
    element.showModal();
    element.querySelector<HTMLButtonElement>('button')?.focus();
    return () => {
      job.current?.abort();
      element.close();
    };
  }, []);
  async function download() {
    const controller = new AbortController();
    job.current = controller;
    setBusy(true);
    setError(null);
    setProgress('Подготовка PDF…');
    try {
      const blob = await drawingSetPdf(
        result.sheets,
        controller.signal,
        (done, total) =>
          setProgress(`Подготовка PDF: ${done} из ${total} листов`),
      );
      controller.signal.throwIfAborted();
      const url = URL.createObjectURL(blob),
        link = document.createElement('a');
      link.href = url;
      link.download = 'flatplan-drawings.pdf';
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 60000);
      setProgress(
        `PDF готов: ${result.sheets.length} листов. Файл передан браузеру для скачивания.`,
      );
    } catch (e) {
      if (controller.signal.aborted) setProgress('Экспорт отменён.');
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
  const activeIndex = result.sheets.indexOf(sheet);
  return (
    <dialog
      className="ed-draw-dialog"
      ref={dialog}
      onCancel={onClose}
      onKeyDown={(e) => e.stopPropagation()}
      onKeyUp={(e) => e.stopPropagation()}
      aria-label="Комплект чертежей"
    >
      <div className="ed-draw-heading">
        <div>
          <h2>Чертежи квартиры</h2>
          <p>
            Снимок текущей сцены. Для обновления после правок откройте комплект
            заново.
          </p>
        </div>
        <button onClick={onClose}>Закрыть чертежи</button>
      </div>
      <div className="ed-draw-layout">
        <aside className="ed-draw-controls">
          <h3>Развёртки помещений</h3>
          <p>Планы и ведомость электрики включены всегда.</p>
          <fieldset disabled={busy}>
            <legend>Помещения в комплекте</legend>
            {rooms.map((r) => (
              <DesignCheck
                key={r.id}
                label={r.name}
                checked={selectedRooms.includes(r.id)}
                onChange={(checked) => {
                  setSelectedRooms((ids) =>
                    checked ? [...ids, r.id] : ids.filter((id) => id !== r.id),
                  );
                  setSelected('plan');
                  setProgress('');
                }}
              />
            ))}
          </fieldset>
          <label>
            Лист
            <select
              aria-label="Лист чертежей"
              value={sheet?.id ?? ''}
              onChange={(e) => setSelected(e.target.value)}
            >
              {result.sheets.map((s, i) => (
                <option key={s.id} value={s.id}>
                  {i + 1}. {s.title}
                </option>
              ))}
            </select>
          </label>
          <div className="ed-draw-pagination">
            <button
              disabled={activeIndex <= 0}
              onClick={() => setSelected(result.sheets[activeIndex - 1].id)}
            >
              Предыдущий лист
            </button>
            <button
              disabled={
                activeIndex < 0 || activeIndex >= result.sheets.length - 1
              }
              onClick={() => setSelected(result.sheets[activeIndex + 1].id)}
            >
              Следующий лист
            </button>
          </div>
          <button
            className="ed-primary"
            disabled={busy || !result.sheets.length}
            onClick={download}
          >
            Скачать комплект PDF ({result.sheets.length})
          </button>
          {busy && (
            <button onClick={() => job.current?.abort()}>
              Отменить экспорт PDF
            </button>
          )}
          {sheet && (
            <a
              className="ed-draw-link"
              href={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(sheet.svg)}`}
              download={`flatplan-sheet-${activeIndex + 1}.svg`}
            >
              Скачать выбранный лист SVG
            </a>
          )}
          <output aria-live="polite">{progress}</output>
          {(error || result.error) && (
            <p role="alert" className="ed-operation-error">
              {error || result.error}
            </p>
          )}
          <p>
            PDF: A4, 220 dpi. Масштаб указан на каждом листе. Для печати
            выберите 100% без подгонки. Текст PDF сохранён как изображение; SVG
            остаётся векторным.
          </p>
        </aside>
        <div className="ed-draw-preview">
          {sheet ? (
            <>
              <h3>
                {activeIndex + 1} / {result.sheets.length} · {sheet.title}
              </h3>
              <div className="ed-draw-zoom">
                <button
                  onClick={() => setZoom((v) => Math.max(1, v - 0.5))}
                  disabled={zoom === 1}
                >
                  Уменьшить лист
                </button>
                <span>{Math.round(zoom * 100)}%</span>
                <button
                  onClick={() => setZoom((v) => Math.min(3, v + 0.5))}
                  disabled={zoom === 3}
                >
                  Увеличить лист
                </button>
              </div>
              <div className="ed-draw-paper">
                <img
                  className="ed-draw-sheet"
                  style={{ width: `${zoom * 100}%` }}
                  src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(sheet.svg)}`}
                  alt={`Чертёж: ${sheet.title}`}
                />
              </div>
              <p>
                Размеры в сантиметрах. На развёртках показана проекция мебели в
                пределах 110 см от стены. Размещение кабелей и привязка
                раскладки плитки ещё не заданы.
              </p>
            </>
          ) : (
            <p>Для чертежей добавьте видимые стены и помещения.</p>
          )}
        </div>
      </div>
    </dialog>
  );
}
export function DrawingsPanel({ project }: { project: EditorProject }) {
  const [snapshot, setSnapshot] = useState<EditorProject | null>(null);
  return (
    <section className="ed-design-section" aria-label="Чертежи и PDF">
      <h3>Планы и развёртки</h3>
      <p>
        Планы помещений, мебели и электрических точек, развёртки стен с
        размерами, проёмами и отделкой. Выберите помещения и скачайте комплект
        PDF.
      </p>
      <button
        className="ed-primary"
        onClick={() => setSnapshot(clone(project))}
      >
        Открыть чертежи
      </button>
      {snapshot && (
        <DrawingsDialog project={snapshot} onClose={() => setSnapshot(null)} />
      )}
    </section>
  );
}
