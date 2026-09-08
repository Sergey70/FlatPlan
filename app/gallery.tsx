/* oxlint-disable next/no-img-element, next/no-html-link-for-pages -- This is a static Vite app; assets and document navigation do not use Next.js. */
import { useEffect, useState } from 'react';
import {
  ArrowLeft,
  ArrowUpRight,
  Check,
  Columns2,
  Grid2X2,
  Images,
  Plus,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  galleryConcepts,
  galleryLayouts,
  galleryStyles,
  type GalleryConcept,
} from '@/lib/gallery-data';
import './gallery.css';

function ConceptImage({
  concept,
  eager = false,
}: {
  concept: GalleryConcept;
  eager?: boolean;
}) {
  const [failed, setFailed] = useState(false);
  return failed ? (
    <div className="gallery-image-error">
      <Images aria-hidden="true" />
      <output>Изображение не загрузилось</output>
      <Button variant="outline" onClick={() => setFailed(false)}>
        Повторить
      </Button>
    </div>
  ) : (
    <img
      className="gallery-render"
      src={concept.image}
      alt={`${concept.layout.name} · ${concept.style.name}. Иллюстрация интерьера квартиры с видом сверху.`}
      loading={eager ? 'eager' : 'lazy'}
      decoding="async"
      onError={() => setFailed(true)}
    />
  );
}

function Materials({ concept }: { concept: GalleryConcept }) {
  return (
    <ul className="gallery-materials">
      {concept.style.materials.map((material) => (
        <li key={material.name}>
          <span style={{ background: material.color }} aria-hidden="true" />
          {material.name}
        </li>
      ))}
    </ul>
  );
}

function Plan({ concept }: { concept: GalleryConcept }) {
  return (
    <figure className="gallery-plan">
      <img
        src={concept.plan}
        width="350"
        height="420"
        loading="lazy"
        alt={`Схема из файла .plan: ${concept.layout.name}. Стены, проёмы и расстановка предметов.`}
      />
      <figcaption>
        <span className="gallery-dot gallery-dot-window" /> Окна{' '}
        <span className="gallery-dot gallery-dot-wall" /> Стены
      </figcaption>
    </figure>
  );
}

function Detail({ concept }: { concept: GalleryConcept }) {
  return (
    <Dialog>
      <DialogTrigger
        render={<Button variant="ghost" className="gallery-detail-trigger" />}
      >
        Подробнее <ArrowUpRight aria-hidden="true" />
        <span className="sr-only">
          : {concept.layout.name} · {concept.style.name}
        </span>
      </DialogTrigger>
      <DialogContent className="gallery-dialog" showCloseButton={false}>
        <div className="gallery-dialog-heading">
          <div>
            <span className="gallery-eyebrow">Концепция {concept.number}</span>
            <DialogTitle>{concept.style.name}</DialogTitle>
            <DialogDescription>
              {concept.layout.name} · Рендер модели из .plan
            </DialogDescription>
          </div>
          <DialogClose
            render={
              <Button
                variant="outline"
                className="gallery-icon-button"
                aria-label="Закрыть концепцию"
              />
            }
          >
            <X />
          </DialogClose>
        </div>
        <div className="gallery-detail-grid">
          <div>
            <ConceptImage concept={concept} eager />
            <p className="gallery-image-note">
              Изображение получено из модели редактора. Контуры, проёмы и
              габариты перенесены из .plan; детали мебели и отделка условные.
            </p>
            {concept.imageNote && (
              <p className="gallery-image-note">{concept.imageNote}</p>
            )}
            <h3>{concept.style.mood}</h3>
            <p>{concept.style.description}</p>
            <Materials concept={concept} />
            <a
              className="gallery-text-link"
              href={concept.image}
              target="_blank"
              rel="noreferrer"
            >
              Открыть изображение целиком <ArrowUpRight size={16} />
            </a>
          </div>
          <aside>
            <h3>Как устроена планировка</h3>
            <Plan concept={concept} />
            <p>{concept.layout.detail}</p>
            <div className="gallery-tradeoff">
              <strong>{concept.layout.benefit}</strong>
              <p>{concept.layout.tradeoff}</p>
            </div>
          </aside>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function Gallery() {
  const [layout, setLayout] = useState('all');
  const [style, setStyle] = useState('all');
  const [selected, setSelected] = useState<string[]>([]);
  const shown = galleryConcepts.filter(
    (c) =>
      (layout === 'all' || c.layout.id === layout) &&
      (style === 'all' || c.style.id === style),
  );
  const compared = selected.map((id) =>
    galleryConcepts.find((c) => c.id === id)!,
  );
  const featured = galleryConcepts.find((c) => c.id === 'plan-2-warm')!;
  useEffect(() => {
    document.title = 'Галерея интерьеров — FlatPlan';
  }, []);
  function toggleCompare(id: string) {
    setSelected((current) =>
      current.includes(id)
        ? current.filter((value) => value !== id)
        : current.length < 2
          ? [...current, id]
          : current,
    );
  }
  return (
    <div className="gallery-shell">
      <header className="gallery-header">
        <a
          href="./"
          className="gallery-brand"
          aria-label="FlatPlan — в редактор"
        >
          <span>
            <Grid2X2 size={20} />
          </span>
          FlatPlan<span className="gallery-brand-divider">/</span>
          <small>Галерея интерьеров</small>
        </a>
        <a className="gallery-back" href="./">
          <ArrowLeft size={17} /> <span>В редактор</span>
        </a>
      </header>
      <main className="gallery-main">
        <section className="gallery-hero" aria-labelledby="gallery-title">
          <div className="gallery-hero-copy">
            <p className="gallery-eyebrow">Планировка и отделка</p>
            <h1 id="gallery-title">Варианты интерьера</h1>
            <p className="gallery-intro">
              Визуализации планировок из файла .plan в трёх палитрах отделки.
              Выберите вариант для просмотра и сравнения.
            </p>
            <div className="gallery-numbers">
              <span>
                <strong>{galleryLayouts.length}</strong> схем
              </span>
              <span>
                <strong>{galleryStyles.length}</strong> палитры
              </span>
              <span>
                <strong>{galleryConcepts.length}</strong> визуализаций
              </span>
            </div>
            <a className="gallery-hero-link" href="#concepts">
              Просмотреть варианты <ArrowUpRight size={20} />
            </a>
          </div>
          <figure className="gallery-hero-image">
            <ConceptImage concept={featured} eager />
            <figcaption>
              <span>
                {featured.number} / {featured.style.name}
              </span>
              <span>План квартиры из файла .plan</span>
            </figcaption>
          </figure>
        </section>
        <section className="gallery-context" aria-label="Основа концепций">
          <div>
            <span className="gallery-eyebrow">Что объединяет варианты</span>
            <h2>
              Планировки из файла.
              <br />
              Варианты отделки.
            </h2>
          </div>
          <div>
            <p>
              План квартиры и три отдельных варианта санузла. В каждой схеме
              сохранены координаты стен, проёмов и предметов из файла.
            </p>
            <p className="gallery-muted">
              Рендеры и схемы построены по одной модели. В файле нет готовых
              3D-моделей предметов: их внешний вид восстановлен условно, с
              сохранением габаритов. Палитры отделки — варианты оформления.
            </p>
          </div>
        </section>
        <section
          id="concepts"
          className="gallery-collection"
          aria-labelledby="collection-title"
        >
          <div className="gallery-section-heading">
            <div>
              <p className="gallery-eyebrow">Выберите своё сочетание</p>
              <h2 id="collection-title">Коллекция интерьеров</h2>
            </div>
            <output className="gallery-count" aria-live="polite">
              Показано {shown.length} из {galleryConcepts.length}
            </output>
          </div>
          <div className="gallery-filters">
            <fieldset>
              <legend className="sr-only">Фильтр планировки</legend>
              <span className="gallery-filter-label">Планировка</span>
              <div className="gallery-filter-options">
                <Button
                  variant="ghost"
                  className="gallery-filter"
                  aria-pressed={layout === 'all'}
                  onClick={() => setLayout('all')}
                >
                  Все планировки
                </Button>
                {galleryLayouts.map((item) => (
                  <Button
                    key={item.id}
                    variant="ghost"
                    className="gallery-filter"
                    aria-pressed={layout === item.id}
                    onClick={() => setLayout(item.id)}
                  >
                    {item.short}
                  </Button>
                ))}
              </div>
            </fieldset>
            <fieldset>
              <legend className="sr-only">Фильтр стиля</legend>
              <span className="gallery-filter-label">Отделка</span>
              <div className="gallery-filter-options">
                <Button
                  variant="ghost"
                  className="gallery-filter"
                  aria-pressed={style === 'all'}
                  onClick={() => setStyle('all')}
                >
                  Все стили
                </Button>
                {galleryStyles.map((item) => (
                  <Button
                    key={item.id}
                    variant="ghost"
                    className="gallery-filter"
                    aria-pressed={style === item.id}
                    onClick={() => setStyle(item.id)}
                  >
                    {item.name}
                  </Button>
                ))}
              </div>
            </fieldset>
          </div>
          <p className="gallery-compare-hint">
            Отметьте два варианта, чтобы сравнить их рядом. Можно выбрать разные
            планировки и стили.
          </p>
          <div className="gallery-grid">
            {shown.map((concept) => (
              <article
                key={concept.id}
                className="gallery-card"
                data-concept={concept.id}
              >
                <div className="gallery-card-image">
                  <ConceptImage concept={concept} />
                  <span className="gallery-card-number">{concept.number}</span>
                </div>
                <div className="gallery-card-body">
                  <span className="gallery-eyebrow">{concept.layout.name}</span>
                  <h3>{concept.style.name}</h3>
                  <p>{concept.style.mood}</p>
                  <div
                    className="gallery-swatches"
                    aria-label="Палитра материалов"
                  >
                    {concept.style.materials.map((m) => (
                      <span
                        key={m.name}
                        style={{ background: m.color }}
                        title={m.name}
                      />
                    ))}
                    <span className="gallery-wall-count">
                      {concept.layout.walls}
                    </span>
                  </div>
                  <div className="gallery-card-actions">
                    <Detail concept={concept} />
                    <Button
                      variant="outline"
                      className="gallery-compare-toggle"
                      aria-pressed={selected.includes(concept.id)}
                      disabled={
                        selected.length === 2 && !selected.includes(concept.id)
                      }
                      onClick={() => toggleCompare(concept.id)}
                    >
                      {selected.includes(concept.id) ? (
                        <Check aria-hidden="true" />
                      ) : (
                        <Plus aria-hidden="true" />
                      )}{' '}
                      {selected.includes(concept.id) ? 'Выбрано' : 'Сравнить'}
                      <span className="sr-only">
                        : {concept.layout.name} · {concept.style.name}
                      </span>
                    </Button>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </section>
        <section className="gallery-layouts" aria-labelledby="layouts-title">
          <div className="gallery-section-heading">
            <div>
              <p className="gallery-eyebrow">Окна и стены</p>
              <h2 id="layouts-title">Схемы из файла .plan</h2>
            </div>
            <span className="gallery-muted">Из базовой 3D-модели</span>
          </div>
          <div className="gallery-layout-grid">
            {galleryLayouts.map((item) => (
              <article key={item.id}>
                <div className="gallery-layout-title">
                  <span>{item.number}</span>
                  <h3>{item.name}</h3>
                </div>
                <Plan
                  concept={galleryConcepts.find(
                    (c) => c.layout.id === item.id,
                  )!}
                />
                <p>{item.description}</p>
                <strong>{item.benefit}</strong>
                <p className="gallery-muted">{item.tradeoff}</p>
              </article>
            ))}
          </div>
        </section>
        <footer className="gallery-footer">
          <p>
            Следующий шаг — уточнить обмеры и развить понравившийся интерьер.
          </p>
          <a href="./" className="gallery-text-link">
            Вернуться к 3D-плану <ArrowUpRight size={18} />
          </a>
          <small>
            Концепции не применяются к вашему сохранённому проекту
            автоматически.
          </small>
        </footer>
      </main>
      {selected.length > 0 && (
        <div className="gallery-compare-bar" aria-label="Выбранные концепции">
          <div>
            <strong aria-live="polite">
              Для сравнения: {selected.length} из 2
            </strong>
            <div className="gallery-selected-items">
              {compared.map((c) => (
                <Button
                  key={c.id}
                  variant="ghost"
                  className="gallery-selected-item"
                  onClick={() => toggleCompare(c.id)}
                  aria-label={`Убрать ${c.number} из сравнения`}
                >
                  {c.number} · {c.style.name}
                  <X size={14} />
                </Button>
              ))}
            </div>
          </div>
          <Dialog>
            <DialogTrigger
              disabled={selected.length !== 2}
              render={<Button className="gallery-compare-open" />}
            >
              <Columns2 aria-hidden="true" /> Сравнить два варианта
            </DialogTrigger>
            <DialogContent
              className="gallery-dialog gallery-comparison-dialog"
              showCloseButton={false}
            >
              <div className="gallery-dialog-heading">
                <div>
                  <DialogTitle>Сравнение концепций</DialogTitle>
                  <DialogDescription>
                    Материалы, атмосфера и схема перегородок. Иллюстрации могут
                    отличаться от точных размеров.
                  </DialogDescription>
                </div>
                <DialogClose
                  render={
                    <Button
                      variant="outline"
                      className="gallery-icon-button"
                      aria-label="Закрыть сравнение"
                    />
                  }
                >
                  <X />
                </DialogClose>
              </div>
              <div className="gallery-comparison-grid">
                {compared.map((c) => (
                  <article key={c.id}>
                    <span className="gallery-eyebrow">
                      Концепция {c.number} / {c.layout.name}
                    </span>
                    <h3>{c.style.name}</h3>
                    <ConceptImage concept={c} eager />
                    {c.imageNote && (
                      <p className="gallery-image-note">{c.imageNote}</p>
                    )}
                    <p>{c.style.description}</p>
                    <Materials concept={c} />
                    <Plan concept={c} />
                    <h4>{c.layout.benefit}</h4>
                    <p>{c.layout.detail}</p>
                    <p className="gallery-muted">{c.layout.tradeoff}</p>
                  </article>
                ))}
              </div>
            </DialogContent>
          </Dialog>
          <Button
            className="gallery-clear"
            variant="ghost"
            onClick={() => setSelected([])}
            aria-label="Очистить сравнение"
          >
            <X />
          </Button>
        </div>
      )}
    </div>
  );
}
