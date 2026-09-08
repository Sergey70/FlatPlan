import { useState } from 'react';
import type { EditorProject } from '@/lib/editor-model';
import { defaultSnap, type SnapSettings } from '@/lib/design-types';
import {
  alignMany,
  copyMany,
  groupMany,
  offsetFromWall,
  rotateMany,
  ungroup,
} from '@/lib/arrangement-tools';
import { DesignNumber, DesignCheck } from './design-controls';
export function ArrangementPanel({
  project,
  ids,
  marquee,
  onMarquee,
  onCommit,
  onSelection,
  onSnap,
  onError,
}: {
  project: EditorProject;
  ids: string[];
  marquee: boolean;
  onMarquee: (v: boolean) => void;
  onCommit: (p: EditorProject) => void;
  onSelection: (ids: string[]) => void;
  onSnap: (s: SnapSettings) => void;
  onError: (s: string) => void;
}) {
  const snap = project.scene.view.snapping ?? defaultSnap,
    [name, setName] = useState('Рабочее место'),
    [angle, setAngle] = useState(90),
    [wall, setWall] = useState('');
  const selected = project.scene.objects.filter((n) => ids.includes(n.id));
  const valid =
    selected.length === ids.length &&
    selected.length > 0 &&
    selected.every((n) => n.category === 'furniture' && !n.locked);
  function run(fn: () => void) {
    try {
      fn();
    } catch (e) {
      onError((e as Error).message);
    }
  }
  const walls = project.scene.objects.filter(
    (n) => n.visible && n.geometry.kind === 'wall',
  );
  return (
    <section className="ed-design-section" aria-label="Расстановка и группы">
      <h3>Расстановка и группы</h3>
      <DesignCheck
        label="Выделять рамкой"
        checked={marquee}
        onChange={onMarquee}
      />
      <p className="ed-hint">
        Рамка выделяет мебель целиком. Shift + нажатие добавляет предмет к
        выделению. На телефоне используйте флажки в списке. Первый выбранный
        предмет — ориентир выравнивания.
      </p>
      {ids.length > 1 && (
        <button className="ed-full" onClick={() => onMarquee(false)}>
          Перемещать выбранные на плане
        </button>
      )}
      <p className="ed-hint">
        Совместное перетаскивание доступно на плане. Сохранённую группу можно
        перемещать и в 3D.
      </p>
      <output>Выбрано предметов: {ids.length}</output>
      <div className="ed-design-actions">
        <button onClick={() => onSelection([])}>Снять выделение группы</button>
        <button
          disabled={!valid}
          onClick={() =>
            run(() => {
              const result = copyMany(project, ids);
              onCommit(result.project);
              onSelection(result.ids);
            })
          }
        >
          Копировать выбранные
        </button>
      </div>
      <DesignNumber
        label="Повернуть выделение, °"
        value={angle}
        onChange={setAngle}
        min={-360}
        max={360}
        step={5}
      />
      <button
        disabled={!valid}
        onClick={() => run(() => onCommit(rotateMany(project, ids, angle)))}
      >
        Повернуть вместе
      </button>
      <label className="ed-field">
        <span>Название группы</span>
        <input
          aria-label="Название группы"
          maxLength={100}
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </label>
      <div className="ed-design-actions">
        <button
          disabled={!valid || ids.length < 2 || !name.trim()}
          onClick={() =>
            run(() => {
              const p = groupMany(project, ids, name);
              onCommit(p);
              onSelection([p.scene.view.selected!]);
            })
          }
        >
          Объединить в группу
        </button>
        <button
          disabled={!valid || ids.length !== 1 || !selected[0]?.assembly}
          onClick={() =>
            run(() => {
              const p = ungroup(project, ids[0]);
              onCommit(p);
              onSelection([]);
            })
          }
        >
          Разгруппировать
        </button>
      </div>
      <h4>Выравнивание по первому предмету</h4>
      <div className="ed-design-actions">
        {(['x', 'z'] as const).flatMap((axis) =>
          (['min', 'center', 'max'] as const).map((anchor) => (
            <button
              key={axis + anchor}
              disabled={!valid || ids.length < 2}
              onClick={() =>
                run(() => onCommit(alignMany(project, ids, axis, anchor)))
              }
            >
              {axis === 'x'
                ? { min: 'Левый край', center: 'Центры X', max: 'Правый край' }[
                    anchor
                  ]
                : {
                    min: 'Верхний край',
                    center: 'Центры Z',
                    max: 'Нижний край',
                  }[anchor]}
            </button>
          )),
        )}
      </div>
      <h4>Привязки на плане</h4>
      <DesignCheck
        label="Включить привязки"
        checked={snap.enabled}
        onChange={(enabled) => onSnap({ ...snap, enabled })}
      />
      <DesignCheck
        label="Привязка к сетке"
        checked={snap.grid}
        onChange={(grid) => onSnap({ ...snap, grid })}
      />
      <DesignCheck
        label="Привязка к стенам и мебели"
        checked={snap.objects}
        onChange={(objects) => onSnap({ ...snap, objects })}
      />
      <DesignNumber
        label="Шаг привязки, см"
        value={snap.step * 100}
        onChange={(v) => onSnap({ ...snap, step: v / 100 })}
        min={0.1}
        max={100}
      />
      <DesignNumber
        label="Отступ при привязке, см"
        value={snap.gap * 100}
        onChange={(v) => onSnap({ ...snap, gap: v / 100 })}
        min={0}
        max={200}
      />
      <p className="ed-hint">
        При перемещении видны направляющие. Удерживайте Alt, чтобы временно
        отключить привязку.
      </p>
      <label className="ed-field">
        <span>Стена для точного отступа</span>
        <select
          aria-label="Стена для точного отступа"
          value={wall || walls[0]?.id || ''}
          onChange={(e) => setWall(e.target.value)}
        >
          {walls.map((n) => (
            <option key={n.id} value={n.id}>
              {n.name}
            </option>
          ))}
        </select>
      </label>
      <button
        disabled={!valid || !walls.length}
        onClick={() =>
          run(() =>
            onCommit(
              offsetFromWall(project, ids, wall || walls[0].id, snap.gap),
            ),
          )
        }
      >
        Установить отступ от стены
      </button>
    </section>
  );
}
