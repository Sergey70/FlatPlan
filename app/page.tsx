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
  roomPath,
  polygonPath,
  walls,
  wallLength,
  wallPoint,
  solidOutlines,
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
  balcony: DoorOpen,
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
        viewBox="-.95 -.95 9.3 10.85"
        aria-label="Предварительный план квартиры по техпаспорту: кухня-гостиная, жилая комната, санузел и лоджия"
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
          <pattern
            id="service-hatch"
            width=".18"
            height=".18"
            patternUnits="userSpaceOnUse"
            patternTransform="rotate(45)"
          >
            <rect width=".18" height=".18" fill="#d8dad5" />
            <path d="M0 0V.18" stroke="#8a9290" strokeWidth=".025" />
          </pattern>
          {rooms.map((room) => (
            <clipPath
              key={room.id}
              id={`clip-${room.id}`}
              clipPathUnits="userSpaceOnUse"
            >
              <path d={roomPath(room)} clipRule="evenodd" />
            </clipPath>
          ))}
        </defs>
        {rooms.map((room) => (
          <g key={room.id}>
            <path
              d={roomPath(room)}
              fillRule="evenodd"
              fill={
                room.id === 'living' || room.id === 'bedroom'
                  ? 'url(#boards)'
                  : palette.stone
              }
              stroke="#f5f2ed"
              strokeWidth=".025"
            />
            {selected === room.id && (
              <path
                d={roomPath(room)}
                fillRule="evenodd"
                fill="#ba643c"
                fillOpacity=".13"
                stroke="#b35735"
                strokeWidth=".045"
              />
            )}
            <foreignObject
              x={room.x}
              y={room.z}
              width={room.width}
              height={room.depth}
              clipPath={`url(#clip-${room.id})`}
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
            strokeWidth=".025"
          >
            <rect x=".27" y="2.89" width="4.7" height=".69" rx=".02" />
            <rect x=".30" y="3.74" width=".63" height=".64" rx=".03" />
            <rect
              x="1.81"
              y="3.01"
              width=".68"
              height=".47"
              rx=".02"
              fill="#555e5d"
            />
            <rect
              x="3.20"
              y="3.04"
              width=".54"
              height=".40"
              rx=".05"
              fill="#bdc4bf"
            />
            {[0, 1, 2, 3].map((i) => (
              <rect
                key={i}
                x={2.5 + Math.sin((i * Math.PI) / 2) - 0.235}
                y={4.9 + Math.cos((i * Math.PI) / 2) - 0.225}
                width=".47"
                height=".45"
                rx=".06"
              />
            ))}
            <circle cx="2.5" cy="4.9" r=".72" fill={palette.wood} />
            <rect
              x=".6"
              y="6.07"
              width="3.4"
              height="2.9"
              rx=".07"
              fill="#e3e0d7"
            />
            <g transform="translate(.8 7.5) rotate(90)" fill={palette.fabric}>
              <rect x="-1.3" y="-.465" width="2.6" height=".93" rx=".1" />
              <rect x=".37" y="-1.265" width=".82" height="1.15" rx=".1" />
              <path d="M-1.2 .28H1.2M-.43 -.4V.28M.43 -.4V.28" />
            </g>
            <circle cx="2.65" cy="7.45" r=".5" fill={palette.wood} />
            <rect
              x="3.65"
              y="6.765"
              width=".4"
              height="2.17"
              rx=".02"
              fill={palette.wood}
            />
            <g transform="translate(3.75 1.3) rotate(-90)">
              <rect x="-.83" y="-1.06" width="1.66" height="2.12" rx=".05" />
              <rect
                x="-.825"
                y=".52"
                width="1.65"
                height=".42"
                fill={palette.accent}
              />
              <rect x="-.71" y="-.88" width=".65" height=".45" rx=".06" />
              <rect x=".07" y="-.88" width=".65" height=".45" rx=".06" />
              {[-0.99, 0.99].map((x) => (
                <rect
                  key={x}
                  x={x - 0.17}
                  y="-1.005"
                  width=".34"
                  height=".35"
                  fill={palette.wood}
                />
              ))}
            </g>
            <rect x="6.65" y=".28" width=".46" height="1.6" />
            <rect x="6.3" y="7.265" width=".8" height="1.07" rx=".03" />
            <path
              d="M6.3 7.265L7.1 8.335M7.1 7.265L6.3 8.335"
              stroke="#becacb"
            />
            <rect
              x="5.165"
              y="8.47"
              width=".91"
              height=".46"
              fill={palette.wood}
            />
            <circle cx="5.62" cy="8.7" r=".18" />
            <rect x="4.78" y="8.55" width=".4" height=".2" rx=".04" />
            <ellipse cx="4.98" cy="8.36" rx=".205" ry=".288" />
          </g>
        )}
        <g pointerEvents="none">
          {walls.map((wall) => {
            const intervals: [number, number][] = [];
            let cursor = 0;
            for (const opening of wall.openings) {
              intervals.push([cursor, opening.from]);
              cursor = opening.to;
            }
            intervals.push([cursor, wallLength(wall)]);
            return (
              <g key={wall.id}>
                {intervals.map(([from, to], i) => {
                  const a = wallPoint(wall, from),
                    b = wallPoint(wall, to);
                  return (
                    <line
                      key={i}
                      x1={a[0]}
                      y1={a[1]}
                      x2={b[0]}
                      y2={b[1]}
                      stroke="#64716f"
                      strokeWidth={wall.thickness}
                    />
                  );
                })}
                {wall.openings.map((opening, i) => {
                  const a = wallPoint(wall, opening.from),
                    b = wallPoint(wall, opening.to);
                  return (
                    <line
                      key={i}
                      x1={a[0]}
                      y1={a[1]}
                      x2={b[0]}
                      y2={b[1]}
                      stroke={opening.kind === 'window' ? '#8baab8' : '#c7ccc6'}
                      strokeWidth={opening.kind === 'window' ? 0.04 : 0.02}
                    />
                  );
                })}
              </g>
            );
          })}
          {solidOutlines.map((solid) => (
            <path
              key={solid.id}
              d={polygonPath(solid.polygon)}
              fill={solid.id === 'service' ? 'url(#service-hatch)' : '#a8b0aa'}
              stroke="#64716f"
              strokeWidth=".045"
            >
              <title>{solid.name}</title>
            </path>
          ))}
          <path
            d="M7.98 6.57H7.48m.16-.13-.16.13.16.13"
            fill="none"
            stroke="#ad633d"
            strokeWidth=".025"
          />
          <text
            x="7.88"
            y="6.30"
            textAnchor="middle"
            fill="#8e684f"
            fontSize=".15"
          >
            Вход
          </text>
        </g>
        {options.labels &&
          rooms.map((room) => (
            <g
              key={room.id}
              pointerEvents="none"
              transform={`translate(${room.label[0]} ${room.label[1]})`}
            >
              <rect
                x={room.id === 'balcony' ? -0.51 : -1.05}
                y="-.25"
                width={room.id === 'balcony' ? 1.02 : 2.1}
                height={room.id === 'balcony' ? 0.85 : 0.64}
                rx=".08"
                fill="#fffdf8"
                fillOpacity=".91"
              />
              <text
                textAnchor="middle"
                fill="#35444c"
                fontSize={room.id === 'balcony' ? '.16' : '.2'}
                fontWeight="600"
              >
                {room.name}
              </text>
              <text y=".27" textAnchor="middle" fill="#6e7a82" fontSize=".18">
                {formatArea(roomArea(room))} м²
              </text>
              {room.accountedArea && (
                <text
                  y=".49"
                  textAnchor="middle"
                  fill="#6e7a82"
                  fontSize=".125"
                >
                  в расчёте {formatArea(room.accountedArea)}
                </text>
              )}
            </g>
          ))}
        <g stroke="#9dabb5" strokeWidth=".012" fill="none" pointerEvents="none">
          <path d="M0 9.6H7.13M0 9.49v.22M7.13 9.49v.22M-.6 2.65V9M-.71 2.65h.22M-.71 9h.22M1.29 -.65H7.13M1.29 -.76v.22M7.13 -.76v.22" />
        </g>
        <g
          fill="#7b8992"
          fontSize=".17"
          textAnchor="middle"
          pointerEvents="none"
        >
          <text x="3.565" y="9.48">
            7,13 м
          </text>
          <text x="4.21" y="-.75">
            5,84 м
          </text>
          <text x="-5.825" y="-.70" transform="rotate(-90)">
            6,35 м
          </text>
          <text x="7.69" y="1.30" fontSize=".15">
            2,55 м
          </text>
        </g>
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
          <span className="demo-badge">ЭСКИЗ</span>
        </div>
        <div className="header-note">
          <span />
          По исходному плану
        </div>
      </header>
      <main className="workspace">
        <aside className="sidebar" aria-label="Комнаты и настройки интерьера">
          <h2 className="section-heading">Пространство</h2>
          <div className="summary">
            <strong>{formatArea(apartment.accountedArea)}</strong>
            <span>м²</span>
          </div>
          <p className="summary-note">
            С учётом лоджии (2,4 м²).
            <br />
            Внутри — 58,1 м²; лоджия — 3,4 м².
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
              <label htmlFor="furniture">Пример мебели</label>
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
            <strong>Предварительная модель</strong>Площади — из техпаспорта.
            Высота {formatArea(apartment.ceiling)} м, детали проёмов и отделка
            пока условные. Уточним их по обмерам.
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
              <strong>
                {title}
                {currentRoom?.accountedArea
                  ? ` · ${formatArea(currentRoom.accountedArea)} м² в расчёте`
                  : ''}
              </strong>
              <span>
                {view === '3d'
                  ? 'Перетаскивайте для вращения · колесо для масштаба'
                  : 'Нажмите на комнату, чтобы выбрать её'}
                <br />
                {view === '3d'
                  ? 'Два пальца — масштаб и перемещение'
                  : 'Площади — из документа; проёмы приблизительные'}
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
        <span>По техпаспорту · геометрия предварительная</span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <MousePointer2 size={12} />
          Исследуйте пространство
        </span>
      </footer>
    </div>
  );
}
