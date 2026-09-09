import { useState } from 'react';
import {
  clone,
  newId,
  validateProject,
  type EditorProject,
  type EditorView,
} from '@/lib/editor-model';
import { defaultSun, defaultWalk, type SunSettings } from '@/lib/design-types';
import { seasonDates, sunDirection } from '@/lib/sunlight';
import { DesignCheck, DesignNumber } from './design-controls';

export function EnvironmentPanel({
  project,
  unavailable,
  onView,
  onCommit,
  onWalk,
  onPick,
  onError,
}: {
  project: EditorProject;
  unavailable: boolean;
  onView: (patch: Partial<EditorView>) => void;
  onCommit: (project: EditorProject) => void;
  onWalk: (enabled: boolean) => void;
  onPick: () => void;
  onError: (message: string) => void;
}) {
  const view = project.scene.view,
    sun = view.sunlight ?? defaultSun,
    walk = view.walk ?? defaultWalk;
  const [name, setName] = useState('Новый ракурс');
  const light = sunDirection(sun),
    time = `${Math.floor(sun.minutes / 60)
      .toString()
      .padStart(2, '0')}:${(sun.minutes % 60).toString().padStart(2, '0')}`;
  const setSun = (patch: Partial<SunSettings>) =>
    onView({ sunlight: { ...sun, ...patch } });
  function saveViewpoint() {
    try {
      if (!view.camera)
        throw new Error('Дождитесь загрузки 3D и выберите ракурс.');
      const next = clone(project);
      next.scene.viewpoints = [
        ...(next.scene.viewpoints ?? []),
        { id: newId('view'), name: name.trim(), camera: clone(view.camera) },
      ];
      onCommit(validateProject(next));
    } catch (error) {
      onError((error as Error).message);
    }
  }
  return (
    <>
      <details className="ed-design-details">
        <summary>Прогулка и ракурсы</summary>
        <section className="ed-design-panel" aria-label="Прогулка и ракурсы">
          <p className="ed-hint">
            Вид с уровня глаз. WASD — шаги, стрелки ← → — поворот. Тяните
            изображение мышью или пальцем для осмотра. Escape — завершить.
          </p>
          <button
            className="ed-primary ed-full"
            disabled={unavailable}
            onClick={() => onWalk(!walk.enabled)}
          >
            {walk.enabled ? 'Завершить прогулку' : 'Начать прогулку'}
          </button>
          <button className="ed-full" disabled={unavailable} onClick={onPick}>
            Начать прогулку здесь
          </button>
          <DesignNumber
            label="Высота глаз, см"
            value={walk.eyeHeight * 100}
            min={60}
            max={220}
            onChange={(v) => {
              const height = v / 100,
                camera =
                  view.camera && walk.enabled ? clone(view.camera) : null;
              if (camera) {
                camera.target[1] += height - camera.position[1];
                camera.position[1] = height;
              }
              onView({
                walk: { ...walk, eyeHeight: height },
                ...(camera ? { camera } : {}),
              });
            }}
          />
          <DesignNumber
            label="Скорость прогулки, м/с"
            value={walk.speed}
            min={0.2}
            max={4}
            onChange={(speed) => onView({ walk: { ...walk, speed } })}
          />
          <p className="ed-hint">
            Для точного начала выберите место на плане кнопкой «Начать прогулку
            здесь». Препятствия ограничивают движение; двери показаны в
            положении из модели.
          </p>
          <label className="ed-design-field">
            Название ракурса
            <input
              value={name}
              maxLength={100}
              onChange={(e) => setName(e.target.value)}
              placeholder="Например: за рабочим столом"
            />
          </label>
          <button
            className="ed-full"
            onClick={saveViewpoint}
            disabled={
              unavailable ||
              !view.camera ||
              !name.trim() ||
              (project.scene.viewpoints?.length ?? 0) >= 30
            }
          >
            Сохранить текущий ракурс
          </button>
          {(project.scene.viewpoints ?? []).map((point) => (
            <div className="ed-saved-view" key={point.id}>
              <button
                onClick={() =>
                  onView({
                    mode: '3d',
                    cutaway: false,
                    labels: false,
                    camera: clone(point.camera),
                    walk: { ...walk, enabled: false },
                  })
                }
                disabled={unavailable}
              >
                {point.name}
              </button>
              <button
                aria-label={`Удалить ракурс: ${point.name}`}
                onClick={() => {
                  const next = clone(project);
                  next.scene.viewpoints = next.scene.viewpoints!.filter(
                    (p) => p.id !== point.id,
                  );
                  onCommit(next);
                }}
              >
                ×
              </button>
            </div>
          ))}
        </section>
      </details>
      <details className="ed-design-details">
        <summary>Дневной свет</summary>
        <section className="ed-design-panel" aria-label="Дневной свет">
          <DesignCheck
            label="Солнце по дате и времени"
            checked={sun.enabled}
            onChange={(enabled) =>
              onView({
                sunlight: { ...sun, enabled },
                ...(enabled
                  ? { mode: '3d', cutaway: false, labels: false, night: false }
                  : {}),
              })
            }
          />
          <label className="ed-design-field">
            Режим солнца
            <select
              value={sun.mode}
              onChange={(e) =>
                setSun({ mode: e.target.value as SunSettings['mode'] })
              }
            >
              <option value="location">По координатам и дате</option>
              <option value="manual">Условный — углы вручную</option>
            </select>
          </label>
          {sun.mode === 'location' ? (
            <>
              <label className="ed-design-field">
                Город
                <input
                  key={sun.city}
                  defaultValue={sun.city}
                  maxLength={100}
                  onBlur={(e) =>
                    setSun({
                      city: e.target.value.trim() || 'Заданные координаты',
                    })
                  }
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') e.currentTarget.blur();
                  }}
                />
              </label>
              <p className="ed-hint">
                Название — подпись. Для другого города укажите координаты и
                часовой пояс.
              </p>
              <DesignNumber
                label="Широта, °"
                value={sun.latitude}
                min={-89.9}
                max={89.9}
                onChange={(latitude) => setSun({ latitude })}
              />
              <DesignNumber
                label="Долгота, °"
                value={sun.longitude}
                min={-180}
                max={180}
                onChange={(longitude) => setSun({ longitude })}
              />
              <DesignNumber
                label="Часовой пояс, UTC"
                value={sun.utcOffset}
                min={-14}
                max={14}
                onChange={(utcOffset) => setSun({ utcOffset })}
              />
              <label className="ed-design-field">
                Дата солнца
                <input
                  type="date"
                  value={sun.date}
                  min="2000-01-01"
                  max="2099-12-31"
                  onChange={(e) => {
                    if (/^20\d\d-\d\d-\d\d$/.test(e.target.value))
                      setSun({ date: e.target.value });
                  }}
                />
              </label>
              <div className="ed-design-actions">
                {seasonDates.map(([id, label]) => (
                  <button
                    key={id}
                    onClick={() =>
                      setSun({
                        date: `${sun.date.slice(0, 4)}-${id}`,
                      })
                    }
                  >
                    {label}
                  </button>
                ))}
              </div>
              <label className="ed-design-field">
                Местное время
                <input
                  type="time"
                  value={time}
                  onChange={(e) => {
                    const [h, m] = e.target.value.split(':').map(Number);
                    if (Number.isFinite(h) && Number.isFinite(m))
                      setSun({ minutes: h * 60 + m });
                  }}
                />
              </label>
              <input
                className="ed-sun-slider"
                type="range"
                aria-label="Время суток"
                min={0}
                max={1439}
                step={10}
                value={sun.minutes}
                onChange={(e) => setSun({ minutes: Number(e.target.value) })}
              />
            </>
          ) : (
            <>
              <DesignNumber
                label="Азимут солнца, °"
                value={sun.azimuth}
                min={0}
                max={360}
                onChange={(azimuth) => setSun({ azimuth })}
              />
              <DesignNumber
                label="Высота солнца, °"
                value={sun.elevation}
                min={-90}
                max={90}
                onChange={(elevation) => setSun({ elevation })}
              />
              <p className="ed-hint">
                Условная иллюстрация: дата, город и время не используются.
              </p>
            </>
          )}
          <DesignNumber
            label="Север на плане, °"
            value={sun.north}
            min={-360}
            max={360}
            onChange={(north) => setSun({ north })}
          />
          <p className="ed-hint">
            0° — вверх, 90° — вправо. По вашим данным: Минск, лоджия на юг,
            север вправо.
          </p>
          <button
            className="ed-full"
            onClick={() =>
              setSun({
                city: defaultSun.city,
                latitude: defaultSun.latitude,
                longitude: defaultSun.longitude,
                utcOffset: 3,
                north: 90,
              })
            }
          >
            Минск · лоджия на юг
          </button>
          <output className="ed-sun-result" aria-label="Положение солнца">
            {sun.mode === 'manual'
              ? 'Условное солнце'
              : `${sun.city || 'Заданная точка'} · ${time}`}
            <br />
            Азимут {light.azimuth.toFixed(1)}° · высота{' '}
            {light.elevation.toFixed(1)}°
            {light.elevation <= 0 ? ' · ниже горизонта' : ''}
          </output>
          <p className="ed-hint">
            Для теней через окна отключите срез стен. Это приближённая модель
            прямого солнца без окружающих зданий и погодных условий.
          </p>
        </section>
      </details>
    </>
  );
}

export function WalkPad({
  onInput,
  onExit,
}: {
  onInput: (forward: number, side: number, turn?: number) => void;
  onExit: () => void;
}) {
  const buttons = [
    ['↶', 'Повернуться влево', 0, 0, -1],
    ['↑', 'Шаг вперёд', 1, 0, 0],
    ['↷', 'Повернуться вправо', 0, 0, 1],
    ['←', 'Шаг влево', 0, -1, 0],
    ['↓', 'Шаг назад', -1, 0, 0],
    ['→', 'Шаг вправо', 0, 1, 0],
  ] as const;
  return (
    <div className="ed-walk-controls" aria-label="Управление прогулкой">
      <div className="ed-walk-pad">
        {buttons.map(([icon, label, f, s, t]) => (
          <button
            key={label}
            aria-label={label}
            onPointerDown={(e) => {
              e.preventDefault();
              e.currentTarget.setPointerCapture(e.pointerId);
              onInput(f, s, t);
            }}
            onPointerUp={() => onInput(0, 0)}
            onPointerCancel={() => onInput(0, 0)}
            onLostPointerCapture={() => onInput(0, 0)}
            onKeyDown={(e) => {
              if (e.key === ' ' || e.key === 'Enter') {
                e.preventDefault();
                onInput(f, s, t);
              }
            }}
            onKeyUp={() => onInput(0, 0)}
            onBlur={() => onInput(0, 0)}
          >
            {icon}
          </button>
        ))}
      </div>
      <button onClick={onExit}>Завершить прогулку</button>
    </div>
  );
}
