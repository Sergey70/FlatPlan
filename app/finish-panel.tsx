import { useState } from 'react';
import {
  defaultFinish,
  type Finish,
  type FinishKind,
  type WallFace,
} from '@/lib/design-types';
import type { SceneNode } from '@/lib/editor-model';
import { DesignNumber } from './design-controls';
export function FinishPanel({
  node,
  onChange,
}: {
  node: SceneNode;
  onChange: (finish: Finish | null, face: WallFace | 'all') => void;
}) {
  const [face, setFace] = useState<WallFace | 'all'>('all');
  const current =
    face === 'all' ? node.finish : (node.surfaces?.[face] ?? node.finish);
  const f =
    current ??
    defaultFinish(
      node.material === 'wood'
        ? 'oak'
        : node.material === 'fabric'
          ? 'fabric'
          : 'paint',
    );
  const change = (patch: Partial<Finish>) => onChange({ ...f, ...patch }, face);
  return (
    <section className="ed-design-section" aria-label="Отделка поверхности">
      <h3>Отделка поверхности</h3>
      {node.geometry.kind === 'wall' && (
        <label className="ed-field">
          <span>Сторона стены</span>
          <select
            aria-label="Сторона стены"
            value={face}
            onChange={(e) => setFace(e.target.value as WallFace | 'all')}
          >
            <option value="all">Вся стена</option>
            <option value="front">Сторона A (+Z стены)</option>
            <option value="back">Сторона B (−Z стены)</option>
            <option value="top">Верх и низ</option>
            <option value="edge">Торцы</option>
          </select>
        </label>
      )}
      <label className="ed-field">
        <span>Вид отделки</span>
        <select
          aria-label="Вид отделки"
          value={f.kind}
          onChange={(e) =>
            onChange(defaultFinish(e.target.value as FinishKind), face)
          }
        >
          <option value="paint">Матовая краска</option>
          <option value="oak">Дуб / доска</option>
          <option value="tile">Плитка</option>
          <option value="fabric">Ткань</option>
          <option value="stone">Камень</option>
        </select>
      </label>
      <label className="ed-field">
        <span>Цвет отделки</span>
        <input
          type="color"
          aria-label="Цвет отделки"
          value={f.color}
          onChange={(e) => change({ color: e.target.value })}
        />
      </label>
      <DesignNumber
        label="Направление укладки, °"
        value={f.angle}
        onChange={(angle) => change({ angle })}
        min={-360}
        max={360}
        step={15}
      />
      <div className="ed-design-actions">
        <button onClick={() => change({ angle: 0 })}>Вдоль</button>
        <button onClick={() => change({ angle: 90 })}>Поперёк</button>
        <button onClick={() => change({ angle: 45 })}>Диагональ</button>
      </div>
      <DesignNumber
        label="Ширина элемента отделки, см"
        value={f.width * 100}
        onChange={(v) => change({ width: v / 100 })}
        min={2}
        max={1000}
      />
      <DesignNumber
        label="Высота / длина элемента, см"
        value={f.height * 100}
        onChange={(v) => change({ height: v / 100 })}
        min={2}
        max={1000}
      />
      {(f.kind === 'tile' || f.kind === 'oak') && (
        <>
          <DesignNumber
            label="Ширина шва, мм"
            value={f.joint * 1000}
            onChange={(v) => change({ joint: v / 1000 })}
            min={0}
            max={30}
          />
          <label className="ed-field">
            <span>Цвет шва</span>
            <input
              type="color"
              aria-label="Цвет шва"
              value={f.jointColor}
              onChange={(e) => change({ jointColor: e.target.value })}
            />
          </label>
        </>
      )}
      <DesignNumber
        label="Шероховатость"
        value={f.roughness}
        onChange={(roughness) => change({ roughness })}
        min={0}
        max={1}
        step={0.05}
      />
      <div className="ed-design-actions">
        <button onClick={() => onChange(f, face)}>Применить отделку</button>
        <button disabled={!current} onClick={() => onChange(null, face)}>
          Убрать отделку
        </button>
      </div>
      <p className="ed-hint">
        Текстуры и рельеф видны в 3D. Размер элемента задаётся в реальных
        сантиметрах. Отделка группы применяется к её деталям; у стены стороны A
        и B настраиваются независимо.
      </p>
    </section>
  );
}
