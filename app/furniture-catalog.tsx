import { useMemo, useState } from 'react';
import {
  furnitureCatalog,
  furniturePresets,
  furnitureSize,
  type FurnitureId,
} from '@/lib/furniture-catalog';
import type { SceneNode, Vec3 } from '@/lib/editor-model';

export function FurnitureCatalog({
  rooms,
  canReplace,
  onInsert,
  onClose,
}: {
  rooms: SceneNode[];
  canReplace: boolean;
  onInsert: (
    id: FurnitureId,
    size: Vec3,
    roomId: string,
    replace: boolean,
  ) => void;
  onClose: () => void;
}) {
  const [id, setId] = useState<FurnitureId>('desk');
  const [search, setSearch] = useState('');
  const [room, setRoom] = useState(
    rooms.find((r) => r.name.includes('Комната 1'))?.id ?? rooms[0]?.id ?? '',
  );
  const initial = useMemo(
    () => furnitureSize(id).map((n) => String(Math.round(n * 100))),
    [id],
  );
  const [draft, setDraft] = useState(initial),
    [previous, setPrevious] = useState(id);
  if (previous !== id) {
    setPrevious(id);
    setDraft(initial);
  }
  const size = draft.map((s) => Number(s.replace(',', '.')) / 100) as Vec3;
  const valid =
    draft.every((s) => s.trim()) &&
    size.every((v) => Number.isFinite(v) && v >= 0.01 && v <= 20);
  return (
    <section className="ed-furniture-catalog" aria-label="Каталог мебели">
      <div className="ed-panel-title">
        <h3>Каталог мебели</h3>
        <button onClick={onClose} aria-label="Закрыть каталог">
          ×
        </button>
      </div>
      <input
        aria-label="Поиск в каталоге"
        className="ed-search"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Стол, кровать, монитор…"
      />
      <div className="ed-catalog-options">
        {furnitureCatalog
          .filter((item) =>
            item.name.toLowerCase().includes(search.toLowerCase()),
          )
          .map((item) => (
            <button
              key={item.id}
              aria-pressed={id === item.id}
              onClick={() => setId(item.id)}
            >
              {item.name}
            </button>
          ))}
      </div>
      <strong>{furnitureCatalog.find((item) => item.id === id)!.name}</strong>
      {!!furniturePresets[id]?.length && (
        <div className="ed-size-presets" aria-label="Типовые размеры">
          {furniturePresets[id]!.map((p) => (
            <button
              key={p.name}
              onClick={() =>
                setDraft(p.size.map((v) => String(Math.round(v * 100))))
              }
            >
              {p.name}
            </button>
          ))}
        </div>
      )}
      <div className="ed-fields">
        {['Ширина, см', 'Высота, см', 'Глубина, см'].map((label, i) => (
          <label className="ed-field" key={label}>
            <span>{label}</span>
            <input
              aria-label={`Каталог: ${label}`}
              inputMode="decimal"
              value={draft[i]}
              aria-invalid={
                !Number.isFinite(size[i]) ||
                size[i] < 0.01 ||
                size[i] > 20 ||
                !draft[i].trim()
              }
              onChange={(e) =>
                setDraft(draft.map((v, j) => (i === j ? e.target.value : v)))
              }
            />
          </label>
        ))}
      </div>
      <label className="ed-field ed-wide">
        <span>Добавить в помещение</span>
        <select
          aria-label="Помещение для мебели"
          value={room}
          onChange={(e) => setRoom(e.target.value)}
        >
          {rooms.length ? (
            rooms.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name.replace('Пол — ', '')}
              </option>
            ))
          ) : (
            <option value="">Центр плана</option>
          )}
        </select>
      </label>
      <p className="ed-hint">
        Габариты в сантиметрах. Предмет появится в центре помещения; затем
        переместите его на плане. Монитор добавляется на уровне пола — высоту
        установки задайте в свойствах.
      </p>
      <button
        className="ed-primary ed-full"
        disabled={!valid}
        onClick={() => onInsert(id, size, room, false)}
      >
        Добавить предмет
      </button>
      <button
        className="ed-full"
        disabled={!valid || !canReplace || id === 'wall'}
        onClick={() => onInsert(id, size, room, true)}
      >
        Заменить выбранный предмет
      </button>
    </section>
  );
}
