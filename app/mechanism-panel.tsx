import { useMemo, useState } from 'react';
import {
  clone,
  findNode,
  flattenNodes,
  type EditorProject,
  type SceneNode,
} from '@/lib/editor-model';
import {
  configureMechanism,
  configurePart,
  mechanismCollisions,
  operateMechanisms,
  removeMechanisms,
} from '@/lib/mechanisms';
import { mechanismPresets, type MechanismPreset } from '@/lib/renovation-types';
import { DesignNumber } from './design-controls';

function suggested(node: SceneNode): MechanismPreset {
  if (node.geometry.doorSwing || node.geometry.kind === 'wall') return 'door';
  if (/диван/i.test(node.name)) return 'sofa';
  if (/посудомо/i.test(node.name)) return 'dishwasher';
  if (/холодильник/i.test(node.name)) return 'fridge';
  if (/духовк/i.test(node.name)) return 'oven';
  if (/тумба/i.test(node.name)) return 'drawer';
  return 'cabinet';
}
export function MechanismControls({
  project,
  node,
  onCommit,
}: {
  project: EditorProject;
  node: SceneNode;
  onCommit: (p: EditorProject) => void;
}) {
  const [preset, setPreset] = useState<MechanismPreset>(() => suggested(node));
  const [error, setError] = useState<string | null>(null);
  const moving = flattenNodes([node])
    .map((x) => x.node)
    .filter((n) => n.mechanism);
  const collisions = useMemo(
    () =>
      moving.length ? mechanismCollisions(project.scene.objects, node.id) : [],
    [project.scene.objects, node.id, moving.length],
  );
  function run(action: () => EditorProject) {
    try {
      onCommit(action());
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }
  function changePart(
    part: SceneNode,
    patch: Partial<NonNullable<SceneNode['mechanism']>>,
  ) {
    // Close with the old mechanism before changing its hinge or stroke.
    run(() => {
      const closed = operateMechanisms(project, part.id, 0),
        own = findNode(closed.scene.objects, part.id)!;
      return configurePart(closed, part.id, {
        ...own.mechanism!,
        ...patch,
        progress: 0,
      });
    });
  }
  return (
    <section
      className="ed-design-panel"
      aria-label="Механизмы выбранного предмета"
    >
      <p className="ed-hint">
        {node.name}. Положение деталей учитывается на плане, в 3D и во время
        прогулки.
      </p>
      {error && (
        <p role="alert" className="ed-operation-error">
          {error}
        </p>
      )}
      {moving.length > 0 ? (
        <>
          <div className="ed-design-actions">
            <button
              onClick={() => run(() => operateMechanisms(project, node.id, 0))}
            >
              Закрыть всё
            </button>
            <button
              onClick={() => run(() => operateMechanisms(project, node.id, 1))}
            >
              Открыть всё
            </button>
          </div>
          {moving.map((part, index) => {
            const m = part.mechanism!,
              label = `${part.name} ${index + 1}`;
            return (
              <details
                className="ed-design-details"
                key={part.id}
                open={moving.length === 1 || undefined}
              >
                <summary>
                  {label} · {Math.round(m.progress * 100)}%
                </summary>
                <div className="ed-design-panel">
                  <DesignNumber
                    label={`Открывание: ${label}, %`}
                    value={Number((m.progress * 100).toFixed(2))}
                    min={0}
                    max={100}
                    onChange={(v) =>
                      run(() => operateMechanisms(project, part.id, v / 100))
                    }
                  />
                  <div className="ed-design-actions">
                    {[0, 0.5, 1].map((value) => (
                      <button
                        key={value}
                        aria-label={`${label}: ${value * 100}%`}
                        onClick={() =>
                          run(() => operateMechanisms(project, part.id, value))
                        }
                      >
                        {value * 100}%
                      </button>
                    ))}
                  </div>
                  <DesignNumber
                    label={
                      m.kind === 'hinge'
                        ? `Полный угол: ${label}, °`
                        : `Полный ход: ${label}, см`
                    }
                    value={m.extent * (m.kind === 'slide' ? 100 : 1)}
                    min={m.kind === 'hinge' ? -180 : -500}
                    max={m.kind === 'hinge' ? 180 : 500}
                    onChange={(v) =>
                      changePart(part, {
                        extent: v / (m.kind === 'slide' ? 100 : 1),
                      })
                    }
                  />
                  <details className="ed-design-details">
                    <summary>Ось и точка крепления</summary>
                    <label className="ed-design-field">
                      Ось движения
                      <select
                        value={m.axis}
                        onChange={(e) =>
                          changePart(part, {
                            axis: e.target.value as typeof m.axis,
                          })
                        }
                      >
                        <option value="x">X</option>
                        <option value="y">Y</option>
                        <option value="z">Z</option>
                      </select>
                    </label>
                    {m.kind === 'hinge' &&
                      m.pivot.map((value, i) => (
                        <DesignNumber
                          key={i}
                          label={`Крепление ${'XYZ'[i]}, см`}
                          value={Number((value * 100).toFixed(3))}
                          min={-2000}
                          max={2000}
                          onChange={(v) => {
                            const pivot = clone(m.pivot);
                            pivot[i] = v / 100;
                            changePart(part, { pivot });
                          }}
                        />
                      ))}
                    <p className="ed-hint">
                      Оси и крепление заданы относительно подвижной детали; ход
                      масштабируется вместе с ней. Изменение настройки сначала
                      закрывает механизм.
                    </p>
                  </details>
                </div>
              </details>
            );
          })}
          <output aria-label="Пересечения механизмов" className="ed-sun-result">
            {collisions.length
              ? `Пересечений с другими предметами и стенами: ${collisions.length}`
              : 'В текущем положении пересечений с другими предметами и стенами нет.'}
          </output>
          {collisions.length > 0 && (
            <ul className="ed-operation-list">
              {collisions.slice(0, 12).map((c, i) => (
                <li key={i}>
                  {findNode(project.scene.objects, c.movingId)?.name} →{' '}
                  {findNode(project.scene.objects, c.obstacleId)?.name}
                </li>
              ))}
            </ul>
          )}
          <p className="ed-hint">
            Проверяется показанное положение. Дуги дверей в «Проверке»
            по-прежнему показывают полный сектор открывания.
          </p>
          <button
            className="ed-full"
            onClick={() => run(() => removeMechanisms(project, node.id))}
          >
            Зафиксировать положение без механизма
          </button>
        </>
      ) : (
        <>
          <label className="ed-design-field">
            Схема открывания
            <select
              aria-label="Схема открывания"
              value={preset}
              onChange={(e) => setPreset(e.target.value as MechanismPreset)}
            >
              {mechanismPresets.map((p) => (
                <option value={p.id} key={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
          <button
            className="ed-full"
            disabled={node.locked}
            onClick={() =>
              run(() => configureMechanism(project, node.id, preset))
            }
          >
            Настроить механизм
          </button>
          <p className="ed-hint">
            У шкафов появятся стенки корпуса и подвижные фасады. Для техники и
            дивана используется схема, которую можно уточнить после выбора
            изделия. Настройка отменяется кнопкой «Отменить».
          </p>
          {!['wall', 'floor', 'opening'].includes(node.geometry.kind) && (
            <details className="ed-design-details">
              <summary>Задать движение вручную</summary>
              <p className="ed-hint">
                Выберите в дереве отдельную дверцу или группу деталей. Текущее
                положение станет закрытым.
              </p>
              <div className="ed-design-actions">
                <button
                  onClick={() =>
                    run(() =>
                      configurePart(project, node.id, {
                        kind: 'hinge',
                        axis: 'y',
                        pivot: [-node.geometry.size[0] / 2, 0, 0],
                        extent: -90,
                        progress: 0,
                      }),
                    )
                  }
                >
                  Поворот на петле
                </button>
                <button
                  onClick={() =>
                    run(() =>
                      configurePart(project, node.id, {
                        kind: 'slide',
                        axis: 'z',
                        pivot: [0, 0, 0],
                        extent: Math.min(
                          5,
                          Math.max(0.1, node.geometry.size[2] * 0.8),
                        ),
                        progress: 0,
                      }),
                    )
                  }
                >
                  Выдвижение
                </button>
              </div>
            </details>
          )}
        </>
      )}
    </section>
  );
}
export function MechanismPanel({
  project,
  onCommit,
}: {
  project: EditorProject;
  onCommit: (p: EditorProject) => void;
}) {
  const candidates = flattenNodes(project.scene.objects)
    .map((x) => x.node)
    .filter(
      (n) =>
        n.geometry.doorSwing ||
        n.mechanism ||
        n.mechanismPreset ||
        (n.category === 'furniture' && n.geometry.kind === 'group'),
    );
  const [choice, setChoice] = useState(project.scene.view.selected ?? '');
  const selected = candidates.find((n) => n.id === choice) ?? candidates[0];
  return (
    <details className="ed-design-details" open>
      <summary>Открывание дверей и мебели</summary>
      <section
        className="ed-design-panel"
        aria-label="Открывание дверей и мебели"
      >
        <label className="ed-design-field">
          Предмет с механизмом
          <select
            aria-label="Предмет с механизмом"
            value={selected?.id ?? ''}
            onChange={(e) => setChoice(e.target.value)}
          >
            {candidates.map((n, index) => (
              <option key={n.id} value={n.id}>
                {n.name} · {index + 1}
              </option>
            ))}
          </select>
        </label>
        {selected ? (
          <MechanismControls
            key={selected.id}
            project={project}
            node={selected}
            onCommit={onCommit}
          />
        ) : (
          <p className="ed-hint">
            Добавьте мебель или выберите деталь в её свойствах.
          </p>
        )}
      </section>
    </details>
  );
}
