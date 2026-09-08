import { useEffect, useMemo, useRef, useState } from 'react';
import {
  clone,
  validateProject,
  type EditorProject,
  type EditorView,
} from '@/lib/editor-model';
import { planDrawing } from '@/lib/editor-geometry';
import { seasonDates } from '@/lib/sunlight';
import type { WorkplaceStudy, StudyFace } from '@/lib/renovation-types';
import {
  studyCandidates,
  suggestedStudy,
  studyWindows,
  studySun,
  studyKey,
  runWorkplaceStudy,
  studyScenarios,
  studyTotals,
  studyTime,
  rotatedStudyScene,
  type StudyReport,
  type StudyScenario,
} from '@/lib/workplace-sun';
import { DesignNumber, DesignCheck } from './design-controls';

const percent = (n: number) => `${Math.round(n * 100)} %`;
export function SunStudyPanel({
  project,
  onCommit,
  onView,
}: {
  project: EditorProject;
  onCommit: (p: EditorProject) => void;
  onView: (view: Partial<EditorView>) => void;
}) {
  const settings = useMemo(
    () => project.scene.workplaceStudy ?? suggestedStudy(project.scene.objects),
    [project.scene.objects, project.scene.workplaceStudy],
  );
  const sun = studySun(project.scene),
    candidates = useMemo(
      () => studyCandidates(project.scene.objects),
      [project.scene.objects],
    );
  const windows = useMemo(
    () => studyWindows(project.scene.objects),
    [project.scene.objects],
  );
  const key = useMemo(
    () => studyKey(project.scene, settings),
    [project.scene, settings],
  );
  const [addition, setAddition] = useState(''),
    [result, setResult] = useState<{ key: string; report: StudyReport } | null>(
      null,
    );
  const [error, setError] = useState<string | null>(null),
    [progress, setProgress] = useState<number | null>(null);
  const [scenario, setScenario] = useState<StudyScenario>('current'),
    [frameIndex, setFrameIndex] = useState(0),
    [targetIndex, setTargetIndex] = useState(0);
  const controller = useRef<AbortController | null>(null);
  useEffect(() => {
    controller.current?.abort();
  }, [key]);
  useEffect(
    () => () => {
      controller.current?.abort();
    },
    [],
  );
  const report = result?.key === key ? result.report : null;
  function change(edit: (s: WorkplaceStudy) => void) {
    try {
      const next = clone(project);
      next.scene.workplaceStudy = clone(settings);
      edit(next.scene.workplaceStudy);
      if (
        JSON.stringify(next.scene.workplaceStudy) !== JSON.stringify(settings)
      )
        onCommit(validateProject(next));
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }
  function changeSun(patch: Partial<typeof sun>) {
    try {
      const next = clone(project);
      next.scene.view.sunlight = { ...sun, ...patch };
      onCommit(validateProject(next));
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }
  async function run() {
    const runController = new AbortController();
    controller.current?.abort();
    controller.current = runController;
    setError(null);
    setProgress(0);
    try {
      const next = clone(project);
      next.scene.workplaceStudy = clone(settings);
      const validated = validateProject(next);
      if (!project.scene.workplaceStudy) onCommit(validated);
      const completed = await runWorkplaceStudy(
        validated.scene,
        settings,
        runController.signal,
        setProgress,
      );
      if (controller.current !== runController) return;
      setResult({ key, report: completed });
      setScenario('current');
      setTargetIndex(0);
      const scores = completed.frames.map(
        (f) => f.lit.current.flat().filter(Boolean).length,
      );
      setFrameIndex(Math.max(0, scores.indexOf(Math.max(...scores))));
    } catch (e) {
      if (controller.current === runController)
        setError(
          (e as Error).name === 'AbortError'
            ? 'Расчёт отменён.'
            : (e as Error).message,
        );
    } finally {
      if (controller.current === runController) {
        setProgress(null);
        controller.current = null;
      }
    }
  }
  const available = candidates.filter(
    (e) => !settings.targets.some((t) => t.id === e.node.id),
  );
  const added = available.find((e) => e.node.id === addition) ?? available[0];
  const diagram = useMemo(() => {
    if (!report) return null;
    const scene =
      scenario === 'turned'
        ? rotatedStudyScene(project.scene, settings)
        : project.scene;
    const points = report.surfaces[scenario].flatMap((t) =>
      t.points.map((p) => p.position),
    );
    const xs = points.map((p) => p[0]),
      zs = points.map((p) => p[2]);
    const left = Math.min(...xs) - 1,
      top = Math.min(...zs) - 1,
      width = Math.max(...xs) - left + 1,
      height = Math.max(...zs) - top + 1;
    return {
      parts: planDrawing(scene.objects, {
        palette: scene.view.palette,
        furniture: true,
      }),
      viewBox: `${left} ${top} ${width} ${height}`,
    };
  }, [report, scenario, project.scene, settings]);
  const frame = report?.frames[frameIndex],
    target = report?.surfaces[scenario][targetIndex];
  return (
    <section
      className="ed-design-panel ed-study"
      aria-label="Солнце на рабочем месте"
    >
      <h3>Солнце на рабочем месте</h3>
      <p className="ed-hint">
        Проверка прямых лучей на столешнице и лицевой стороне экранов. Выберите
        детали мебели, рабочие часы и затенение.
      </p>
      {error && (
        <p role="alert" className="ed-operation-error">
          {error}
        </p>
      )}
      <label className="ed-design-field">
        Добавить поверхность
        <select
          aria-label="Добавить поверхность для солнца"
          value={added?.node.id ?? ''}
          onChange={(e) => setAddition(e.target.value)}
        >
          {!available.length && <option value="">Нет доступных деталей</option>}
          {available.map((e) => (
            <option key={e.node.id} value={e.node.id}>
              {e.name}
            </option>
          ))}
        </select>
      </label>
      <button
        disabled={!added || settings.targets.length >= 8}
        onClick={() => {
          if (!added) return;
          change((s) => {
            s.targets.push({
              id: added.node.id,
              face: added.node.name.toLowerCase().startsWith('экран')
                ? 'front'
                : 'top',
            });
            if (!s.rotateIds.includes(added.rootId))
              s.rotateIds.push(added.rootId);
          });
        }}
      >
        Добавить в анализ
      </button>
      <div className="ed-study-targets">
        {settings.targets.map((t, i) => {
          const entry = candidates.find((e) => e.node.id === t.id);
          return (
            <div className="ed-study-target" key={t.id}>
              <strong>
                {i + 1}. {entry?.name ?? 'Деталь удалена или скрыта'}
              </strong>
              <label className="ed-design-field">
                Исследуемая сторона
                <select
                  aria-label={`Сторона поверхности ${i + 1}`}
                  value={t.face}
                  onChange={(e) =>
                    change((s) => {
                      s.targets[i].face = e.target.value as StudyFace;
                    })
                  }
                >
                  <option value="top">Верхняя сторона</option>
                  <option value="front">Лицевая сторона (+Z детали)</option>
                  <option value="back">Обратная сторона (−Z детали)</option>
                </select>
              </label>
              <div className="ed-inline-actions">
                <button
                  disabled={!entry}
                  onClick={() => onView({ selected: t.id })}
                >
                  Выделить деталь {i + 1}
                </button>
                <button
                  onClick={() =>
                    change((s) => {
                      s.targets = s.targets.filter((n) => n.id !== t.id);
                    })
                  }
                >
                  Убрать поверхность {i + 1}
                </button>
              </div>
            </div>
          );
        })}
      </div>
      {!settings.targets.length && (
        <p className="ed-hint">
          Выберите фактическую столешницу или плоскую деталь экрана. Для экрана
          проверяйте именно сторону, обращённую к креслу.
        </p>
      )}
      <div className="ed-study-hours">
        <label className="ed-design-field">
          Начало работы
          <input
            aria-label="Начало работы"
            type="time"
            value={studyTime(settings.start)}
            onChange={(e) => {
              if (e.target.value) {
                const [h, m] = e.target.value.split(':').map(Number);
                change((s) => {
                  s.start = h * 60 + m;
                });
              }
            }}
          />
        </label>
        <label className="ed-design-field">
          Конец работы
          <input
            aria-label="Конец работы"
            type="time"
            value={studyTime(settings.end % 1440)}
            onChange={(e) => {
              if (e.target.value) {
                const [h, m] = e.target.value.split(':').map(Number);
                change((s) => {
                  s.end = h * 60 + m || 1440;
                });
              }
            }}
          />
        </label>
      </div>
      {settings.end === 1440 && (
        <p className="ed-hint">
          00:00 в конце интервала означает конец выбранного дня, 24:00.
        </p>
      )}
      <label className="ed-design-field">
        Шаг расчёта
        <select
          aria-label="Шаг расчёта солнца"
          value={settings.step}
          onChange={(e) =>
            change((s) => {
              s.step = Number(e.target.value) as WorkplaceStudy['step'];
            })
          }
        >
          <option value={15}>15 минут</option>
          <option value={30}>30 минут</option>
          <option value={60}>60 минут</option>
        </select>
      </label>
      <label className="ed-design-field">
        Дата анализа
        <input
          aria-label="Дата анализа солнца"
          type="date"
          min="2000-01-01"
          max="2099-12-31"
          value={sun.date}
          onChange={(e) => {
            if (e.target.value) changeSun({ date: e.target.value });
          }}
        />
      </label>
      <div className="ed-study-seasons">
        {seasonDates.map(([date, name]) => (
          <button
            key={date}
            onClick={() =>
              changeSun({ date: `${sun.date.slice(0, 4)}-${date}` })
            }
          >
            {name}
          </button>
        ))}
      </div>
      <p className="ed-hint">
        {sun.city} · север {sun.north}° · UTC{sun.utcOffset >= 0 ? '+' : ''}
        {sun.utcOffset}. Для отчёта используется положение солнца по координатам
        и дате, в том числе когда в 3D выбран условный режим.
      </p>
      <details className="ed-design-details">
        <summary>Координаты и высота потолка</summary>
        <div className="ed-design-panel">
          <DesignNumber
            label="Широта анализа"
            value={sun.latitude}
            min={-89}
            max={89}
            onChange={(latitude) => changeSun({ latitude })}
          />
          <DesignNumber
            label="Долгота анализа"
            value={sun.longitude}
            min={-180}
            max={180}
            onChange={(longitude) => changeSun({ longitude })}
          />
          <DesignNumber
            label="Север на плане, °"
            value={sun.north}
            min={0}
            max={360}
            onChange={(north) => changeSun({ north })}
          />
          <DesignNumber
            label="Часовой пояс анализа, UTC"
            value={sun.utcOffset}
            min={-12}
            max={14}
            onChange={(utcOffset) => changeSun({ utcOffset })}
          />
          <DesignNumber
            label="Высота потолка для анализа, м"
            value={settings.ceilingHeight}
            min={2}
            max={6}
            onChange={(v) =>
              change((s) => {
                s.ceilingHeight = v;
              })
            }
          />
          <p className="ed-hint">
            По умолчанию: Минск, южное остекление лоджии слева на плане, потолок
            2,70 м. В расчёте над каждым контуром пола закрытый горизонтальный
            потолок.
          </p>
        </div>
      </details>
      <details className="ed-design-details">
        <summary>Поворот рабочего места</summary>
        <div className="ed-design-panel">
          <DesignNumber
            label="Поворот для сравнения, °"
            value={settings.rotation}
            min={-180}
            max={180}
            onChange={(v) =>
              change((s) => {
                s.rotation = v;
              })
            }
          />
          <p className="ed-hint">
            Выбранные предметы поворачиваются вместе вокруг центра их общих
            габаритов только в расчёте. Добавьте кресло, компьютер и мониторы,
            которые нужно повернуть вместе со столом. Пересечения после поворота
            оценивайте отдельно в «Проверке».
          </p>
          {project.scene.objects
            .filter((n) => n.visible && n.category === 'furniture')
            .map((n) => (
              <DesignCheck
                key={n.id}
                label={`Повернуть: ${n.name}`}
                checked={settings.rotateIds.includes(n.id)}
                onChange={(checked) =>
                  change((s) => {
                    s.rotateIds = checked
                      ? [...s.rotateIds, n.id]
                      : s.rotateIds.filter((id) => id !== n.id);
                  })
                }
              />
            ))}
        </div>
      </details>
      <details className="ed-design-details">
        <summary>Шторы и жалюзи</summary>
        <div className="ed-design-panel">
          <DesignNumber
            label="Рулонная штора закрыта, %"
            value={settings.shades.roller * 100}
            min={0}
            max={100}
            onChange={(v) =>
              change((s) => {
                s.shades.roller = v / 100;
              })
            }
          />
          <DesignNumber
            label="Ширина ламели, мм"
            value={settings.shades.slatWidth * 1000}
            min={10}
            max={200}
            onChange={(v) =>
              change((s) => {
                s.shades.slatWidth = v / 1000;
              })
            }
          />
          <DesignNumber
            label="Шаг ламелей, мм"
            value={settings.shades.slatPitch * 1000}
            min={10}
            max={200}
            onChange={(v) =>
              change((s) => {
                s.shades.slatPitch = v / 1000;
              })
            }
          />
          <DesignNumber
            label="Наклон ламелей, °"
            value={settings.shades.slatAngle}
            min={-90}
            max={90}
            onChange={(v) =>
              change((s) => {
                s.shades.slatAngle = v;
              })
            }
          />
          <p className="ed-hint">
            Непрозрачная штора опускается сверху. Ламели горизонтальные при 0°,
            вертикальные при ±90°; наклон задан относительно осей каждого
            оконного проёма. Материал и зазоры реального изделия могут
            отличаться.
          </p>
          {windows.map((e) => (
            <DesignCheck
              key={e.node.id}
              label={`Затенять: ${e.name}`}
              checked={settings.shades.windowIds.includes(e.node.id)}
              onChange={(checked) =>
                change((s) => {
                  s.shades.windowIds = checked
                    ? [...s.shades.windowIds, e.node.id]
                    : s.shades.windowIds.filter((id) => id !== e.node.id);
                })
              }
            />
          ))}
          {!settings.shades.windowIds.length && (
            <p className="ed-hint">
              Окна для затенения не выбраны: оба сценария будут совпадать с
              текущим.
            </p>
          )}
        </div>
      </details>
      <div className="ed-study-run" aria-live="polite">
        <button
          className="ed-primary ed-full"
          disabled={progress !== null || !settings.targets.length}
          onClick={run}
        >
          {progress === null ? 'Рассчитать солнце' : `Расчёт: ${progress} %`}
        </button>
        {progress !== null && (
          <button
            className="ed-full"
            onClick={() => controller.current?.abort()}
          >
            Отменить расчёт
          </button>
        )}
      </div>
      {result && !report && (
        <output className="ed-hint">
          Сцена или параметры изменились. Пересчитайте отчёт.
        </output>
      )}
      {report && frame && target && diagram && (
        <div className="ed-study-result">
          <h3>Результат · {report.sun.date}</h3>
          {report.turningWarnings.map((message) => (
            <p key={message} className="ed-operation-error">
              {message}
            </p>
          ))}
          <label className="ed-design-field">
            Поверхность отчёта
            <select
              aria-label="Поверхность отчёта"
              value={targetIndex}
              onChange={(e) => setTargetIndex(Number(e.target.value))}
            >
              {report.surfaces.current.map((t, i) => (
                <option key={t.id} value={i}>
                  {i + 1}. {t.name}
                </option>
              ))}
            </select>
          </label>
          <div className="ed-estimate-table">
            <table>
              <caption>Прямое солнце за рабочие часы</caption>
              <thead>
                <tr>
                  <th>Сценарий</th>
                  <th>Время, ≈ мин</th>
                  <th>Средняя доля точек</th>
                </tr>
              </thead>
              <tbody>
                {studyScenarios.map((s) => {
                  const total = studyTotals(report, s.id, targetIndex);
                  return (
                    <tr key={s.id} data-study-scenario={s.id}>
                      <th>
                        <button
                          aria-pressed={scenario === s.id}
                          onClick={() => setScenario(s.id)}
                        >
                          {s.name}
                          {s.id === 'turned'
                            ? ` · ${report.settings.rotation}°`
                            : ''}
                        </button>
                      </th>
                      <td>{total.minutes}</td>
                      <td>{percent(total.fraction)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="ed-hint">
            Время — сумма интервалов, в середине которых освещена хотя бы одна
            проверенная точка. Средняя доля учитывает длительность интервалов;
            это выборка из 25 точек, а не точная освещённая площадь.
          </p>
          <p className="ed-study-frame-title">
            {studyScenarios.find((s) => s.id === scenario)!.name} ·{' '}
            {studyTime(frame.minutes)} · солнце {Math.round(frame.elevation)}°
            над горизонтом
          </p>
          <svg
            className="ed-study-plan"
            viewBox={diagram.viewBox}
            aria-label="Расположение проверяемых точек на плане"
          >
            {diagram.parts.map((p, i) => (
              <polygon
                key={i}
                points={p.points.map((v) => v.join(',')).join(' ')}
                fill={
                  p.strokeOnly
                    ? 'none'
                    : p.kind === 'floor'
                      ? '#f8f5ef'
                      : '#ddd8cf'
                }
                stroke="#aaa297"
                strokeWidth={0.014}
              />
            ))}
            {report.surfaces[scenario].map((s, t) => (
              <g key={s.id}>
                {s.points.map((p, i) => (
                  <circle
                    key={i}
                    cx={p.position[0]}
                    cy={p.position[2]}
                    r={t === targetIndex ? 0.035 : 0.02}
                    fill={frame.lit[scenario][t][i] ? '#e89a24' : '#527482'}
                  />
                ))}
              </g>
            ))}
          </svg>
          <svg
            className="ed-study-heatmap"
            viewBox="0 0 110 110"
            aria-label="Прямое солнце на выбранной поверхности: 25 точек"
          >
            {target.points.map((p, i) => (
              <rect
                key={p.cell}
                x={(p.cell % 5) * 22 + 1}
                y={Math.floor(p.cell / 5) * 22 + 1}
                width={20}
                height={20}
                rx={3}
                fill={
                  frame.lit[scenario][targetIndex][i] ? '#e89a24' : '#d5e0e4'
                }
              />
            ))}
          </svg>
          <p className="ed-hint">
            Оранжевый — прямой луч. Серый — прямого луча нет. Верхняя схема
            показывает положение в комнате; сетка — выбранную сторону детали в
            её локальных осях.
          </p>
          <div className="ed-estimate-table">
            <table>
              <caption>
                По времени ·{' '}
                {studyScenarios.find((s) => s.id === scenario)!.name}
              </caption>
              <thead>
                <tr>
                  <th>Интервал</th>
                  <th>Прямо освещено точек</th>
                </tr>
              </thead>
              <tbody>
                {report.frames.map((f, i) => (
                  <tr key={f.from}>
                    <th>
                      <button
                        className="ed-study-time"
                        aria-pressed={frameIndex === i}
                        onClick={() => setFrameIndex(i)}
                      >
                        {studyTime(f.from)}–{studyTime(f.to)}
                      </button>
                    </th>
                    <td>
                      {f.lit[scenario][targetIndex].filter(Boolean).length} /{' '}
                      {target.points.length}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
      <p className="ed-hint">
        Расчёт учитывает видимые стены, полные оконные проёмы, рамы, мебель и
        потолки, независимо от режима среза. Не учитывает соседние здания,
        погоду, отражения, пропускание стекла и рассеянный свет. Он не
        рассчитывает люксы или блики на мониторе; отсутствие прямых лучей не
        гарантирует отсутствие бликов.
      </p>
    </section>
  );
}
