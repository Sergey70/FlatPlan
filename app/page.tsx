import { flushSync } from 'react-dom';
import { registerViewTools } from '@/lib/webmcp';
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import {
  Box,
  BedDouble,
  Bath,
  DoorOpen,
  Sofa,
  Layers3,
  Sun,
  Moon,
  Plus,
  Minus,
  RotateCcw,
  Grid2X2,
  MousePointer2,
} from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import {
  apartment,
  rooms,
  palettes,
  defaultOptions,
  formatArea,
  roomArea,
  type RoomId,
  type SceneOptions,
  type PaletteId,
  type ViewMode,
} from '@/lib/apartment';
import type { ApartmentScene } from '@/lib/apartment-scene';

const roomIcons = {
  living: Sofa,
  bedroom: BedDouble,
  bathroom: Bath,
  hall: DoorOpen,
};

function FloorPlan({
  selected,
  options,
  onSelect,
}: {
  selected: RoomId | null;
  options: SceneOptions;
  onSelect: (id: RoomId) => void;
}) {
  const palette = palettes[options.palette];
  return (
    <div className="plan-view">
      <svg
        viewBox="-.7 -.7 10.4 8.5"
        aria-label="План демонстрационной квартиры, 9 на 7 метров"
      >
        <defs>
          <pattern
            id="boards"
            width=".22"
            height="1.4"
            patternUnits="userSpaceOnUse"
          >
            <rect
              width=".22"
              height="1.4"
              fill={palette.wood}
              fillOpacity=".3"
            />
            <path
              d="M.22 0V1.4H0"
              stroke="#967f65"
              strokeWidth=".008"
              opacity=".3"
            />
          </pattern>
        </defs>
        {rooms.map((room) => (
          <g key={room.id}>
            <rect
              x={room.x}
              y={room.z}
              width={room.width}
              height={room.depth}
              fill={
                room.id === 'living' || room.id === 'bedroom'
                  ? 'url(#boards)'
                  : palette.stone
              }
              stroke={selected === room.id ? '#b35735' : '#f5f2ed'}
              strokeWidth=".06"
            />
            {selected === room.id && (
              <rect
                x={room.x + 0.04}
                y={room.z + 0.04}
                width={room.width - 0.08}
                height={room.depth - 0.08}
                fill="#ba643c"
                fillOpacity=".08"
              />
            )}
            <foreignObject
              x={room.x}
              y={room.z}
              width={room.width}
              height={room.depth}
            >
              <button
                className="plan-hit"
                aria-label={`${room.name}, ${formatArea(roomArea(room))} квадратных метров`}
                aria-pressed={selected === room.id}
                onClick={() => onSelect(room.id)}
              />
            </foreignObject>
          </g>
        ))}
        {options.furniture && (
          <g
            pointerEvents="none"
            fill="#f9f7f2"
            stroke="#9a9a8d"
            strokeWidth=".02"
          >
            <rect x=".3" y=".2" width="4.6" height=".64" rx=".02" />
            <rect x=".3" y=".92" width=".65" height=".67" rx=".03" />
            <rect
              x="1.7"
              y=".33"
              width=".67"
              height=".41"
              rx=".02"
              fill="#555e5d"
            />
            <rect
              x="3.13"
              y=".32"
              width=".54"
              height=".4"
              rx=".05"
              fill="#bdc4bf"
            />
            {[0, 1, 2, 3].map((i) => (
              <rect
                key={i}
                x={2.94 + Math.sin((i * Math.PI) / 2)}
                y={2.1 + Math.cos((i * Math.PI) / 2)}
                width=".42"
                height=".4"
                rx=".08"
              />
            ))}
            <circle cx="3.15" cy="2.3" r=".7" fill={palette.wood} />
            <rect
              x=".5"
              y="3.9"
              width=".95"
              height="2.5"
              rx=".12"
              fill={palette.fabric}
            />
            <rect
              x="1.25"
              y="5.65"
              width=".9"
              height=".75"
              rx=".1"
              fill={palette.fabric}
            />
            <circle cx="2.9" cy="5.08" r=".58" fill={palette.wood} />
            <rect
              x="4.82"
              y="4.24"
              width=".38"
              height="2.17"
              rx=".02"
              fill={palette.wood}
            />
            <rect
              x="6.23"
              y=".75"
              width="1.84"
              height="2.18"
              rx=".05"
              fill="#f9f6ef"
            />
            <rect
              x="6.28"
              y="2.3"
              width="1.74"
              height=".4"
              fill={palette.accent}
            />
            <rect x="6.38" y=".88" width=".69" height=".45" rx=".07" />
            <rect x="7.18" y=".88" width=".69" height=".45" rx=".07" />
            <rect
              x="5.55"
              y="4.66"
              width="1.63"
              height=".37"
              fill={palette.wood}
            />
            <rect
              x="7.77"
              y="4.61"
              width=".83"
              height=".37"
              fill={palette.fabric}
            />
            <rect x="5.5" y="5.3" width="1.02" height="1.62" rx=".03" />
            <rect
              x="7.73"
              y="6.45"
              width="1.07"
              height=".44"
              fill={palette.wood}
            />
            <circle cx="8.26" cy="6.68" r=".18" />
            <ellipse cx="7.17" cy="6.46" rx=".19" ry=".29" />
          </g>
        )}
        <g
          stroke="#586168"
          strokeWidth=".12"
          fill="none"
          strokeLinejoin="miter"
          pointerEvents="none"
        >
          <path d="M9 4.75V7H0V0H1.4M3.6 0H5.7M8.5 0H9V3.8M5.4 0V3.75M5.4 4.7V7M5.4 3.6H7.45M8.35 3.6H9M5.4 5.1H7.45M8.35 5.1H9" />
        </g>
        <g stroke="#a6bac2" strokeWidth=".03" fill="none" pointerEvents="none">
          <path d="M1.4 -.04H3.6M1.4 .04H3.6M5.7 -.04H8.5M5.7 .04H8.5" />
          <path d="M7.45 3.6v-.9a.9 .9 0 0 1 .9 .9M8.35 5.1V6a.9 .9 0 0 1-.9-.9M9 3.8h-.95a.95 .95 0 0 0 .95 .95" />
        </g>
        {options.labels &&
          rooms.map((room) => (
            <g key={room.id} pointerEvents="none">
              <g pointerEvents="none">
                <text
                  x={room.x + room.width / 2}
                  y={room.z + room.depth / 2 + 0.04}
                  textAnchor="middle"
                  fill="#35444c"
                  fontSize=".18"
                  fontWeight="600"
                >
                  {room.name}
                </text>
                <text
                  x={room.x + room.width / 2}
                  y={room.z + room.depth / 2 + 0.31}
                  textAnchor="middle"
                  fill="#6e7a82"
                  fontSize=".15"
                >
                  {formatArea(roomArea(room))} м²
                </text>
              </g>
            </g>
          ))}
        <g stroke="#9dabb5" strokeWidth=".012" fill="none">
          <path d="M0 -.3H9M0 -.4v.2M9 -.4v.2M-.3 0V7M-.4 0h.2M-.4 7h.2" />
        </g>
        <text x="4.5" y="-.4" textAnchor="middle" fill="#7b8992" fontSize=".16">
          9,00 м
        </text>
        <text
          x="-3.5"
          y="-.42"
          transform="rotate(-90)"
          textAnchor="middle"
          fill="#7b8992"
          fontSize=".16"
        >
          7,00 м
        </text>
      </svg>
    </div>
  );
}

export default function Home() {
  const host = useRef<HTMLDivElement>(null);
  const controller = useRef<ApartmentScene | null>(null);
  const [options, setOptions] = useState<SceneOptions>({ ...defaultOptions });
  const [selected, setSelected] = useState<RoomId | null>(null);
  const [view, setView] = useState<ViewMode>('3d');
  const [ready, setReady] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  const optionsRef = useRef(options);
  const selectedRef = useRef(selected);
  useLayoutEffect(() => {
    optionsRef.current = options;
    selectedRef.current = selected;
  }, [options, selected]);
  const chooseRoom = useCallback((room: RoomId | null) => {
    setSelected(room);
    controller.current?.selectRoom(room);
  }, []);
  useEffect(() => {
    let active = true;
    let created: ApartmentScene | undefined;
    import('@/lib/apartment-scene')
      .then(({ createApartmentScene }) => {
        if (!active || !host.current) return;
        try {
          created = createApartmentScene(host.current, {
            onSelect: (room) => chooseRoom(room),
            onError: (text) => {
              if (active) setMessage(text);
            },
          });
          controller.current = created;
          created.setOptions(optionsRef.current);
          created.selectRoom(selectedRef.current);
          setReady(true);
        } catch (error) {
          console.error('Unable to start the apartment renderer', error);
          setMessage(
            '3D недоступен в этом браузере. Открыт план сверху; попробуйте браузер с поддержкой WebGL 2.',
          );
          setUnavailable(true);
          setView('2d');
        }
      })
      .catch(() => {
        if (active) {
          setMessage(
            'Не удалось загрузить 3D-модель. План сверху доступен. Проверьте соединение и обновите страницу.',
          );
          setUnavailable(true);
          setView('2d');
        }
      });
    return () => {
      active = false;
      created?.dispose();
      controller.current = null;
    };
  }, [chooseRoom]);
  useEffect(() => {
    controller.current?.setOptions(options);
  }, [options]);
  const viewState = useRef({ ...options, room: selected, view, unavailable });
  useLayoutEffect(() => {
    viewState.current = { ...options, room: selected, view, unavailable };
  }, [options, selected, view, unavailable]);
  useEffect(
    () =>
      registerViewTools(
        (patch) => {
          if (patch.view === '3d' && viewState.current.unavailable)
            throw new Error('WebGL 2 is unavailable.');
          const { room, view: nextView, ...nextOptions } = patch;
          flushSync(() => {
            setOptions((previous) => ({ ...previous, ...nextOptions }));
            if (Object.hasOwn(patch, 'room')) chooseRoom(room ?? null);
            if (nextView) setView(nextView);
          });
          return viewState.current;
        },
        () => viewState.current,
      ),
    [chooseRoom],
  );
  function setting<K extends keyof SceneOptions>(
    key: K,
    value: SceneOptions[K],
  ) {
    setOptions((previous) => ({ ...previous, [key]: value }));
  }
  const palette = palettes[options.palette];
  const currentRoom = rooms.find((room) => room.id === selected);
  const title = currentRoom?.name ?? 'Вся квартира';
  return (
    <div className="app">
      <header className="header">
        <div className="brand">
          <Box aria-hidden="true" />
          <span>
            flat<span>plan</span>
          </span>
        </div>
        <div className="project-title">
          <h1>{apartment.name}</h1>
          <span className="demo-badge">ДЕМО</span>
        </div>
        <div className="header-note">
          <span />
          Можно исследовать
        </div>
      </header>
      <main className="workspace">
        <aside className="sidebar" aria-label="Комнаты и настройки интерьера">
          <h2 className="section-heading">Пространство</h2>
          <div className="summary">
            <strong>{formatArea(apartment.width * apartment.depth)}</strong>
            <span>м²</span>
          </div>
          <p className="summary-note">
            1 спальня · потолки {formatArea(apartment.ceiling)} м
          </p>
          <nav className="room-list" aria-label="Выбор комнаты">
            <button
              className={`room-button ${selected === null ? 'active' : ''}`}
              onClick={() => chooseRoom(null)}
              aria-pressed={selected === null}
            >
              <Layers3 />
              <span>Вся квартира</span>
              <small>4 зоны</small>
            </button>
            {rooms.map((room) => {
              const Icon = roomIcons[room.id];
              return (
                <button
                  key={room.id}
                  className={`room-button ${selected === room.id ? 'active' : ''}`}
                  onClick={() => chooseRoom(room.id)}
                  aria-pressed={selected === room.id}
                >
                  <Icon />
                  <span>{room.name}</span>
                  <small>{formatArea(roomArea(room))} м²</small>
                </button>
              );
            })}
          </nav>
          <hr className="rule" />
          <h2 className="section-heading">Отображение</h2>
          <div className="settings-grid">
            <div className="setting">
              <label htmlFor="cutaway">Срез стен</label>
              <Switch
                id="cutaway"
                checked={options.cutaway}
                disabled={view === '2d'}
                onCheckedChange={(checked) => setting('cutaway', checked)}
              />
            </div>
            <div className="setting">
              <label htmlFor="furniture">Мебель</label>
              <Switch
                id="furniture"
                checked={options.furniture}
                onCheckedChange={(checked) => setting('furniture', checked)}
              />
            </div>
            <div className="setting">
              <label htmlFor="labels">Названия комнат</label>
              <Switch
                id="labels"
                checked={options.labels}
                onCheckedChange={(checked) => setting('labels', checked)}
              />
            </div>
          </div>
          <hr className="rule" />
          <h2 className="section-heading">Материалы</h2>
          <RadioGroup
            className="palette-options"
            value={options.palette}
            onValueChange={(value) => setting('palette', value as PaletteId)}
            aria-label="Палитра интерьера"
          >
            {(Object.keys(palettes) as PaletteId[]).map((id) => (
              <RadioGroupItem
                key={id}
                className="palette-option"
                value={id}
                title={palettes[id].name}
                aria-label={palettes[id].name}
                style={{ background: palettes[id].swatch }}
              />
            ))}
          </RadioGroup>
          <p className="palette-description" aria-live="polite">
            {palette.name}
          </p>
          <div className="material-key" aria-label={palette.description}>
            <div>
              <div
                className="material-chip"
                style={{
                  backgroundColor: palette.wood,
                  backgroundImage: `url(${import.meta.env.BASE_URL}textures/oak.jpg)`,
                  backgroundSize: '90px',
                  backgroundBlendMode: 'multiply',
                }}
              />
              <span>Дерево</span>
            </div>
            <div>
              <div
                className="material-chip"
                style={{ background: palette.fabric }}
              />
              <span>Текстиль</span>
            </div>
            <div>
              <div
                className="material-chip"
                style={{ background: palette.stone }}
              />
              <span>Камень</span>
            </div>
          </div>
          <p className="demo-note">
            <strong>Место для вашей квартиры</strong>Это демонстрационная
            планировка. Позже заменим её точным планом, размерами и вашим
            интерьером.
          </p>
        </aside>
        <section
          className="viewer"
          data-night={options.night && view === '3d'}
          aria-label="Просмотр квартиры"
        >
          <div className="viewer-top">
            <ToggleGroup
              className="view-toggle"
              value={[view]}
              onValueChange={(values) => {
                if (values[0]) setView(values[0] as ViewMode);
              }}
              aria-label="Режим просмотра"
            >
              <ToggleGroupItem
                value="3d"
                disabled={unavailable}
                aria-label="Объёмный вид"
              >
                <Box />
                3D-вид
              </ToggleGroupItem>
              <ToggleGroupItem value="2d" aria-label="План сверху">
                <Grid2X2 />
                План
              </ToggleGroupItem>
            </ToggleGroup>
            <button
              className="light-button"
              onClick={() => setting('night', !options.night)}
              disabled={view === '2d'}
              aria-label={
                options.night
                  ? 'Включить дневное освещение'
                  : 'Включить вечернее освещение'
              }
              aria-pressed={options.night}
            >
              {options.night ? <Moon /> : <Sun />}
              {options.night ? 'Вечер' : 'День'}
            </button>
          </div>
          <div
            className="canvas-host"
            ref={host}
            style={{ display: view === '3d' ? 'block' : 'none' }}
          />
          {view === '2d' && (
            <FloorPlan
              selected={selected}
              options={options}
              onSelect={chooseRoom}
            />
          )}
          {((!ready && !unavailable && view === '3d') || message) && (
            <output className="scene-status">
              {message ?? 'Собираем пространство…'}
            </output>
          )}
          <div className="viewer-bottom">
            <div className="view-caption">
              <strong>{title}</strong>
              <span>
                {view === '3d'
                  ? 'Перетаскивайте для вращения · колесо для масштаба'
                  : 'Нажмите на комнату, чтобы выбрать её'}
                <br />
                {view === '3d'
                  ? 'Два пальца — масштаб и перемещение'
                  : 'Размеры и площади приведены для примера'}
              </span>
            </div>
            {view === '3d' && (
              <div className="camera-tools" aria-label="Управление камерой">
                <button
                  onClick={() => controller.current?.zoom(0.8)}
                  disabled={!ready}
                  title="Приблизить"
                  aria-label="Приблизить"
                >
                  <Plus />
                </button>
                <button
                  onClick={() => controller.current?.zoom(1.25)}
                  disabled={!ready}
                  title="Отдалить"
                  aria-label="Отдалить"
                >
                  <Minus />
                </button>
                <hr />
                <button
                  onClick={() => {
                    setSelected(null);
                    controller.current?.selectRoom(null);
                  }}
                  disabled={!ready}
                  title="Показать всю квартиру"
                  aria-label="Сбросить вид"
                >
                  <RotateCcw />
                </button>
              </div>
            )}
          </div>
        </section>
      </main>
      <footer className="footer">
        <span>Демонстрационная модель · размеры условные</span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <MousePointer2 size={12} />
          Исследуйте пространство
        </span>
      </footer>
    </div>
  );
}
