import { lazy, Suspense } from 'react';

const Editor = lazy(() => import('./editor'));
const Gallery = lazy(() => import('./gallery'));
const gallery =
  new URLSearchParams(window.location.search).get('view') === 'gallery';

export default function Home() {
  return (
    <Suspense
      fallback={
        <output style={{ padding: 32 }}>
          Загружаем {gallery ? 'галерею интерьеров' : 'план квартиры'}…
        </output>
      }
    >
      {gallery ? <Gallery /> : <Editor />}
    </Suspense>
  );
}
