import { assertOperable } from '@/lib/mechanisms';
import { useState } from 'react';
import {
  clone,
  editNode,
  flattenNodes,
  removeNode,
  validateProject,
  type EditorProject,
  type EditorView,
  type SceneNode,
} from '@/lib/editor-model';
import {
  addElectricalPoint,
  addLightingPresets,
  applyLightingScene,
  captureLightingScene,
  controlExistingLight,
  electricalNodes,
  electricalPosition,
  setElectricalPosition,
  setLightGroup,
  toggleElectricalSwitch,
} from '@/lib/electrical';
import { electricalKinds, type ElectricalKind } from '@/lib/renovation-types';
import { roomLabelPosition } from '@/lib/editor-geometry';
import { DesignCheck, DesignNumber } from './design-controls';

export function ElectricalPanel({
  project,
  onCommit,
  onView,
  onPick,
  picking,
}: {
  project: EditorProject;
  onCommit: (p: EditorProject) => void;
  onView: (p: Partial<EditorView>) => void;
  onPick: (kind: ElectricalKind, height: number, group: string) => void;
  picking: boolean;
}) {
  const [kind, setKind] = useState<ElectricalKind>('socket'),
    [height, setHeight] = useState(0.3),
    [group, setGroup] = useState('Общая');
  const [choice, setChoice] = useState(''),
    [name, setName] = useState('Новый световой сценарий'),
    [error, setError] = useState<string | null>(null);
  const nodes = electricalNodes(project.scene.objects),
    selected =
      nodes.find((n) => n.id === project.scene.view.selected) ??
      nodes.find((n) => n.id === choice) ??
      nodes[0];
  const groups = [
    ...new Set(
      nodes
        .filter((n) => n.electrical!.fixture)
        .map((n) => n.electrical!.group),
    ),
  ];
  const rooms = project.scene.objects.filter(
    (n) => n.geometry.kind === 'floor',
  );
  const [roomId, setRoom] = useState(rooms[0]?.id ?? '');
  const existing = project.scene.objects.filter(
    (n) =>
      !n.electrical &&
      flattenNodes([n]).some((x) => x.node.material === 'light'),
  );
  const [existingId, setExisting] = useState(existing[0]?.id ?? '');
  function run(action: () => EditorProject) {
    try {
      onCommit(action());
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }
  const patch = (
    n: SceneNode,
    edit: (p: NonNullable<SceneNode['electrical']>) => void,
  ) =>
    run(() => {
      assertOperable(project.scene.objects, n.id);
      return editNode(project, n.id, (p) => edit(p.electrical!));
    });
  const e = selected?.electrical,
    pos = selected
      ? electricalPosition(project.scene.objects, selected.id)
      : null;
  return (
    <details className="ed-design-details" open>
      <summary>Электрика и освещение</summary>
      <section className="ed-design-panel" aria-label="Электрика и освещение">
        {error && (
          <p className="ed-operation-error" role="alert">
            {error}
          </p>
        )}
        <DesignCheck
          label="Показывать обозначения электрики"
          checked={project.scene.view.electrical !== false}
          onChange={(electrical) => onView({ electrical })}
        />
        <label className="ed-design-field">
          Добавляемая точка
          <select
            aria-label="Добавляемая точка"
            value={kind}
            onChange={(ev) => {
              const k = ev.target.value as ElectricalKind;
              setKind(k);
              setHeight(electricalKinds.find((n) => n.id === k)!.height);
            }}
          >
            {electricalKinds.map((k) => (
              <option key={k.id} value={k.id}>
                {k.name}
              </option>
            ))}
          </select>
        </label>
        <DesignNumber
          label="Высота новой точки от пола, см"
          value={height * 100}
          min={0}
          max={500}
          onChange={(v) => setHeight(v / 100)}
        />
        <label className="ed-design-field">
          Группа новой точки
          <input
            aria-label="Группа новой точки"
            maxLength={100}
            value={group}
            onChange={(ev) => setGroup(ev.target.value)}
          />
        </label>
        <button
          className="ed-full"
          disabled={!group.trim()}
          onClick={() => onPick(kind, height, group.trim())}
        >
          {picking ? 'Выберите место на плане…' : 'Указать точку на плане'}
        </button>
        <label className="ed-design-field">
          Помещение для новой точки
          <select
            aria-label="Помещение для новой точки"
            value={roomId}
            onChange={(ev) => setRoom(ev.target.value)}
          >
            {rooms.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name.replace('Пол — ', '')}
              </option>
            ))}
          </select>
        </label>
        <button
          className="ed-full"
          disabled={!group.trim() || !rooms.length}
          onClick={() =>
            run(() => {
              const room = rooms.find((r) => r.id === roomId) ?? rooms[0],
                centre = roomLabelPosition(room);
              return addElectricalPoint(
                project,
                kind,
                [centre[0], height, centre[1]],
                group.trim(),
              );
            })
          }
        >
          Добавить в выбранное помещение
        </button>
        <p className="ed-hint">
          Высоты — начальные значения для расстановки. Уточните их под мебель и
          выбранную технику. Точки перемещаются обычными инструментами
          редактора.
        </p>
        {existing.length > 0 && (
          <details className="ed-design-details">
            <summary>Светильник из исходного плана</summary>
            <label className="ed-design-field">
              Существующий светильник
              <select
                aria-label="Существующий светильник"
                value={
                  existing.some((n) => n.id === existingId)
                    ? existingId
                    : existing[0].id
                }
                onChange={(ev) => setExisting(ev.target.value)}
              >
                {existing.map((n, i) => (
                  <option key={n.id} value={n.id}>
                    {n.name} · {i + 1}
                  </option>
                ))}
              </select>
            </label>
            <button
              className="ed-full"
              disabled={!group.trim()}
              onClick={() =>
                run(() =>
                  controlExistingLight(
                    project,
                    existing.some((n) => n.id === existingId)
                      ? existingId
                      : existing[0].id,
                    group.trim(),
                  ),
                )
              }
            >
              Управлять этим светильником
            </button>
          </details>
        )}
        {selected && e && pos && (
          <details className="ed-design-details" open>
            <summary>Параметры электрической точки</summary>
            <label className="ed-design-field">
              Электрическая точка
              <select
                aria-label="Электрическая точка"
                value={selected.id}
                onChange={(ev) => {
                  setChoice(ev.target.value);
                  onView({ selected: ev.target.value });
                }}
              >
                {nodes.map((n, i) => (
                  <option value={n.id} key={n.id}>
                    {n.name} · {n.electrical!.group} · {i + 1}
                  </option>
                ))}
              </select>
            </label>
            <label className="ed-design-field">
              Название точки
              <input
                aria-label="Название точки"
                key={selected.id + selected.name}
                defaultValue={selected.name}
                maxLength={100}
                onBlur={(ev) =>
                  run(() => {
                    assertOperable(project.scene.objects, selected.id);
                    return editNode(project, selected.id, (n) => {
                      n.name = ev.target.value;
                    });
                  })
                }
              />
            </label>
            <label className="ed-design-field">
              Группа точки
              <input
                aria-label="Группа точки"
                key={selected.id + e.group}
                defaultValue={e.group}
                maxLength={100}
                onBlur={(ev) =>
                  patch(selected, (p) => {
                    p.group = ev.target.value;
                  })
                }
              />
            </label>
            {pos.map((v, i) => (
              <DesignNumber
                key={selected.id + i}
                label={
                  i === 1
                    ? 'Высота точки от пола, см'
                    : `Координата точки ${'XYZ'[i]}, см`
                }
                value={Number((v * 100).toFixed(2))}
                min={i === 1 ? 0 : -20000}
                max={i === 1 ? 500 : 20000}
                onChange={(value) => {
                  const next = [...pos] as typeof pos;
                  next[i] = value / 100;
                  run(() => setElectricalPosition(project, selected.id, next));
                }}
              />
            ))}
            <DesignNumber
              label="Поворот точки, °"
              value={selected.rotation[1]}
              min={-360}
              max={360}
              onChange={(v) =>
                run(() => {
                  assertOperable(project.scene.objects, selected.id);
                  return editNode(project, selected.id, (n) => {
                    n.rotation[1] = v;
                  });
                })
              }
            />
            {e.kind === 'switch' && (
              <>
                <p className="ed-hint">
                  Выключатель управляет отмеченными группами.
                </p>
                {groups.map((g) => (
                  <DesignCheck
                    key={g}
                    label={`Управляет: ${g}`}
                    checked={e.controls.includes(g)}
                    onChange={(enabled) =>
                      patch(selected, (p) => {
                        p.controls = enabled
                          ? [...p.controls, g]
                          : p.controls.filter((n) => n !== g);
                      })
                    }
                  />
                ))}
                <div className="ed-design-actions">
                  <button
                    onClick={() =>
                      run(() =>
                        toggleElectricalSwitch(project, selected.id, true),
                      )
                    }
                  >
                    Включить выключателем
                  </button>
                  <button
                    onClick={() =>
                      run(() =>
                        toggleElectricalSwitch(project, selected.id, false),
                      )
                    }
                  >
                    Выключить выключателем
                  </button>
                </div>
              </>
            )}
            {e.fixture && (
              <>
                <label className="ed-design-field">
                  Тип света
                  <select
                    aria-label="Тип света"
                    value={e.fixture.type}
                    onChange={(ev) =>
                      patch(selected, (p) => {
                        p.fixture!.type = ev.target.value as 'point' | 'spot';
                      })
                    }
                  >
                    <option value="spot">Направленный</option>
                    <option value="point">Во все стороны</option>
                  </select>
                </label>
                <DesignNumber
                  label="Световой поток, лм"
                  value={e.fixture.lumens}
                  min={0}
                  max={20000}
                  onChange={(v) =>
                    patch(selected, (p) => {
                      p.fixture!.lumens = v;
                    })
                  }
                />
                <DesignNumber
                  label="Температура света, K"
                  value={e.fixture.kelvin}
                  min={2200}
                  max={6500}
                  onChange={(v) =>
                    patch(selected, (p) => {
                      p.fixture!.kelvin = v;
                    })
                  }
                />
                <DesignNumber
                  label="Яркость светильника, %"
                  value={e.fixture.level * 100}
                  min={0}
                  max={100}
                  onChange={(v) =>
                    patch(selected, (p) => {
                      p.fixture!.level = v / 100;
                    })
                  }
                />
                {e.fixture.type === 'spot' && (
                  <>
                    <DesignNumber
                      label="Ширина светового конуса, °"
                      value={e.fixture.beam}
                      min={10}
                      max={170}
                      onChange={(v) =>
                        patch(selected, (p) => {
                          p.fixture!.beam = v;
                        })
                      }
                    />
                    {e.fixture.target.map((v, i) => (
                      <DesignNumber
                        key={i}
                        label={`Направление света ${'XYZ'[i]}`}
                        value={v}
                        min={-10}
                        max={10}
                        onChange={(v) =>
                          patch(selected, (p) => {
                            p.fixture!.target[i] = v;
                          })
                        }
                      />
                    ))}
                  </>
                )}
              </>
            )}
            <button
              className="ed-full"
              disabled={selected.locked}
              onClick={() =>
                run(() => {
                  assertOperable(project.scene.objects, selected.id);
                  return removeNode(project, selected.id);
                })
              }
            >
              Удалить точку и её модель
            </button>
          </details>
        )}
        <details className="ed-design-details" open>
          <summary>Группы и световые сценарии</summary>
          <DesignCheck
            label="Управляемое искусственное освещение"
            checked={!!project.scene.view.artificialLight}
            onChange={(artificialLight) => onView({ artificialLight })}
          />
          <button
            className="ed-full"
            onClick={() =>
              onView({
                mode: '3d',
                night: true,
                artificialLight: true,
                cutaway: false,
                labels: false,
                ...(project.scene.view.sunlight
                  ? {
                      sunlight: {
                        ...project.scene.view.sunlight,
                        enabled: false,
                      },
                    }
                  : {}),
              })
            }
          >
            Посмотреть свет вечером
          </button>
          {groups.map((g) => (
            <div className="ed-saved-view" key={g}>
              <span>{g}</span>
              <button
                aria-label={`Включить группу ${g}`}
                onClick={() => run(() => setLightGroup(project, g, 1))}
              >
                Вкл.
              </button>
              <button
                aria-label={`Выключить группу ${g}`}
                onClick={() => run(() => setLightGroup(project, g, 0))}
              >
                Выкл.
              </button>
            </div>
          ))}
          <button
            className="ed-full"
            onClick={() => run(() => addLightingPresets(project))}
          >
            Добавить сценарии: работа, готовка, вечер, ночь
          </button>
          <label className="ed-design-field">
            Название светового сценария
            <input
              aria-label="Название светового сценария"
              maxLength={100}
              value={name}
              onChange={(ev) => setName(ev.target.value)}
            />
          </label>
          <button
            className="ed-full"
            disabled={!name.trim()}
            onClick={() => run(() => captureLightingScene(project, name))}
          >
            Сохранить яркости как сценарий
          </button>
          {(project.scene.lightingScenes ?? []).map((s) => (
            <div className="ed-saved-view" key={s.id}>
              <button
                onClick={() => run(() => applyLightingScene(project, s.id))}
              >
                {s.name}
              </button>
              <button
                aria-label={`Удалить световой сценарий: ${s.name}`}
                onClick={() =>
                  run(() => {
                    const next = clone(project);
                    next.scene.lightingScenes =
                      next.scene.lightingScenes!.filter((n) => n.id !== s.id);
                    return validateProject(next);
                  })
                }
              >
                ×
              </button>
            </div>
          ))}
          <p className="ed-hint">
            Начальные сценарии используют названия групп: «Рабочее место»,
            «Кухня», «Коридор». Их яркости можно изменить и сохранить отдельно.
            Цветовая температура отображается приближённо.
          </p>
        </details>
      </section>
    </details>
  );
}
