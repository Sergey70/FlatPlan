import { useMemo, useState } from 'react';
import { clone, validateProject, type EditorProject } from '@/lib/editor-model';
import { defaultEstimate, type EstimateRate } from '@/lib/renovation-types';
import { estimateCsv, estimateScene } from '@/lib/estimate';
import { DesignNumber } from './design-controls';
const num = (n: number) =>
  n.toLocaleString('ru-RU', { maximumFractionDigits: 2 });
export function EstimatePanel({
  project,
  onCommit,
}: {
  project: EditorProject;
  onCommit: (p: EditorProject) => void;
}) {
  const settings = project.scene.estimate ?? defaultEstimate();
  const [room, setRoom] = useState(''),
    [compare, setCompare] = useState(''),
    [error, setError] = useState<string | null>(null);
  const estimate = useMemo(
    () => estimateScene(project.scene, room || null),
    [project.scene, room],
  );
  const other = project.arrangements.find((a) => a.id === compare);
  const comparison = useMemo(
    () => (other ? estimateScene(other.scene) : null),
    [other],
  );
  function change(edit: (s: typeof settings) => void) {
    try {
      const next = clone(project);
      next.scene.estimate ??= defaultEstimate();
      edit(next.scene.estimate);
      onCommit(validateProject(next));
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }
  function rate(r: EstimateRate, patch: Partial<EstimateRate>) {
    change((s) => {
      s.rates = [...s.rates.filter((n) => n.key !== r.key), { ...r, ...patch }];
    });
  }
  const saveCsv = () => {
    const url = URL.createObjectURL(
      new Blob([estimateCsv(project.scene, room || null)], {
        type: 'text/csv;charset=utf-8',
      }),
    );
    const a = document.createElement('a');
    a.href = url;
    a.download = 'flatplan-materials.csv';
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  return (
    <details className="ed-design-details" open>
      <summary>Материалы и смета</summary>
      <section className="ed-design-panel" aria-label="Материалы и смета">
        {error && (
          <p className="ed-operation-error" role="alert">
            {error}
          </p>
        )}
        <label className="ed-design-field">
          Помещение для сметы
          <select
            aria-label="Помещение для сметы"
            value={room}
            onChange={(e) => setRoom(e.target.value)}
          >
            <option value="">Вся квартира</option>
            {estimate.measured.rooms.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
        </label>
        <label className="ed-design-field">
          Валюта сметы
          <input
            aria-label="Валюта сметы"
            key={settings.currency}
            defaultValue={settings.currency}
            maxLength={12}
            onBlur={(e) => {
              if (e.target.value !== settings.currency)
                change((s) => {
                  s.currency = e.target.value;
                });
            }}
          />
        </label>
        <DesignNumber
          label="Запас материалов, %"
          value={settings.waste}
          min={0}
          max={100}
          onChange={(v) =>
            change((s) => {
              s.waste = v;
            })
          }
        />
        <div className="ed-estimate-total">
          <span>Стоимость материалов</span>
          <strong>
            {num(estimate.total)} {estimate.currency}
          </strong>
          <small>
            {estimate.unpriced
              ? `Не заданы цены: ${estimate.unpriced} поз.`
              : 'Все показанные позиции оценены'}
          </small>
        </div>
        <p className="ed-hint">
          Цены вводятся вручную. Расчёт использует текущие контуры пола и
          реальные проёмы в стенах; перемещение стены само по себе не меняет
          контур пола.
        </p>
        <div className="ed-estimate-table">
          <table>
            <caption>Объёмы по помещениям</caption>
            <thead>
              <tr>
                <th>Помещение</th>
                <th>Пол, м²</th>
                <th>Стены, м²</th>
                <th>Плинтус, м</th>
              </tr>
            </thead>
            <tbody>
              {estimate.measured.rooms
                .filter((r) => !room || r.id === room)
                .map((r) => (
                  <tr key={r.id}>
                    <th>{r.name}</th>
                    <td>{num(r.floorArea)}</td>
                    <td>{num(r.wallArea)}</td>
                    <td>{num(r.skirting)}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
        {estimate.rows.map((row, index) => (
          <details className="ed-design-details" key={row.key}>
            <summary>
              {row.label} · {num(row.net)} {row.baseUnit}
            </summary>
            <div className="ed-design-panel">
              <p className="ed-hint">
                С запасом: {num(row.required)} {row.baseUnit}. К покупке:{' '}
                {num(row.purchased)} {row.rate.unit}. Стоимость: {num(row.cost)}{' '}
                {estimate.currency}.
              </p>
              <label className="ed-design-field">
                Единица покупки
                <input
                  aria-label={`Единица покупки ${index + 1}`}
                  key={row.key + row.rate.unit}
                  defaultValue={row.rate.unit}
                  maxLength={20}
                  onBlur={(e) => {
                    if (e.target.value !== row.rate.unit)
                      rate(row.rate, { unit: e.target.value });
                  }}
                />
              </label>
              <DesignNumber
                label={`Цена за единицу ${index + 1}`}
                value={row.rate.price}
                min={0}
                max={1000000000}
                onChange={(price) => rate(row.rate, { price })}
              />
              <DesignNumber
                label={`${row.baseUnit} на единицу покупки ${index + 1}`}
                value={row.rate.coverage}
                min={0.0001}
                max={100000}
                onChange={(coverage) => rate(row.rate, { coverage })}
              />
              <DesignNumber
                label={`Кратность покупки ${index + 1}`}
                value={row.rate.pack}
                min={0}
                max={100000}
                onChange={(pack) => rate(row.rate, { pack })}
              />
              <p className="ed-hint">
                Например, для пачки покрытия укажите «упак.», площадь пачки и
                кратность 1. Для краски — «л» и расход в м² на литр. Кратность 0
                разрешает дробное количество.
              </p>
            </div>
          </details>
        ))}
        <button className="ed-full" onClick={saveCsv}>
          Скачать ведомость CSV
        </button>
        <p className="ed-hint">
          Учтены внутренние плоскости стен, без откосов и торцов. Наружные и не
          привязанные к помещениям поверхности (
          {num(estimate.measured.unassignedWallArea)} м²) не включены. Плинтусы
          считаются у пола, без дверных проёмов.
        </p>
        <details className="ed-design-details">
          <summary>Сравнить стоимость с вариантом</summary>
          <label className="ed-design-field">
            Вариант для сравнения сметы
            <select
              aria-label="Вариант для сравнения сметы"
              value={compare}
              onChange={(e) => setCompare(e.target.value)}
            >
              <option value="">Выберите вариант</option>
              {project.arrangements.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </label>
          {other && comparison && (
            <div className="ed-estimate-comparison">
              <p>
                Текущая квартира целиком:{' '}
                {num(estimateScene(project.scene).total)} {settings.currency}
              </p>
              <p>
                {other.name}: {num(comparison.total)} {comparison.currency}
              </p>
              {comparison.currency === settings.currency ? (
                <p>
                  Разница:{' '}
                  {num(estimateScene(project.scene).total - comparison.total)}{' '}
                  {settings.currency}
                </p>
              ) : (
                <p>Валюта различается; пересчёт курса не выполняется.</p>
              )}
              <p className="ed-hint">
                Используются цены, сохранённые в каждом варианте. Без цены в
                сравнении: текущий — {estimateScene(project.scene).unpriced},
                выбранный — {comparison.unpriced}.
              </p>
            </div>
          )}
        </details>
      </section>
    </details>
  );
}
