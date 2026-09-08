import type { DrawingSheet } from './drawing-sheets.ts';
export interface PdfImagePage {
  jpeg: Uint8Array;
  width: number;
  height: number;
  widthMm: number;
  heightMm: number;
}
/** Small deterministic PDF 1.4 writer. Raster pages keep browser-rendered Cyrillic and exact paper scale. */
export function imagePagesPdf(pages: PdfImagePage[]): Uint8Array {
  if (!pages.length) throw new Error('Нет страниц для PDF.');
  const encoder = new TextEncoder(),
    chunks: Uint8Array[] = [],
    offsets: number[] = [0];
  let length = 0;
  const append = (data: string | Uint8Array) => {
    const bytes = typeof data === 'string' ? encoder.encode(data) : data;
    chunks.push(bytes);
    length += bytes.length;
  };
  const object = (id: number, value: string, stream?: Uint8Array) => {
    offsets[id] = length;
    append(`${id} 0 obj\n${value}`);
    if (stream) {
      append('\nstream\n');
      append(stream);
      append('\nendstream');
    }
    append('\nendobj\n');
  };
  append('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n');
  object(1, '<< /Type /Catalog /Pages 2 0 R >>');
  object(
    2,
    `<< /Type /Pages /Count ${pages.length} /Kids [${pages.map((_, i) => `${3 + i * 3} 0 R`).join(' ')}] >>`,
  );
  pages.forEach((p, i) => {
    if (
      !p.jpeg.length ||
      ![p.width, p.height, p.widthMm, p.heightMm].every(
        (v) => Number.isFinite(v) && v > 0,
      )
    )
      throw new Error('Неверные параметры страницы PDF.');
    const id = 3 + i * 3,
      w = (p.widthMm * 72) / 25.4,
      h = (p.heightMm * 72) / 25.4;
    object(
      id,
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${w.toFixed(6)} ${h.toFixed(6)}] /Resources << /XObject << /Im ${id + 1} 0 R >> >> /Contents ${id + 2} 0 R >>`,
    );
    object(
      id + 1,
      `<< /Type /XObject /Subtype /Image /Width ${p.width} /Height ${p.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${p.jpeg.length} >>`,
      p.jpeg,
    );
    const content = encoder.encode(
      `q ${w.toFixed(6)} 0 0 ${h.toFixed(6)} 0 0 cm /Im Do Q`,
    );
    object(id + 2, `<< /Length ${content.length} >>`, content);
  });
  const xref = length;
  append(`xref\n0 ${offsets.length}\n0000000000 65535 f \n`);
  for (const offset of offsets.slice(1))
    append(`${offset.toString().padStart(10, '0')} 00000 n \n`);
  append(
    `trailer\n<< /Size ${offsets.length} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`,
  );
  const result = new Uint8Array(length);
  let cursor = 0;
  for (const chunk of chunks) {
    result.set(chunk, cursor);
    cursor += chunk.length;
  }
  return result;
}
export async function drawingSetPdf(
  sheets: DrawingSheet[],
  signal: AbortSignal,
  progress: (done: number, total: number) => void,
  dpi = 220,
): Promise<Blob> {
  const pages: PdfImagePage[] = [];
  if (!Number.isFinite(dpi) || dpi < 72 || dpi > 300)
    throw new Error('Разрешение PDF должно быть от 72 до 300 dpi.');
  signal.throwIfAborted();
  await document.fonts.ready;
  for (let i = 0; i < sheets.length; i++) {
    signal.throwIfAborted();
    progress(i, sheets.length);
    const sheet = sheets[i],
      url = URL.createObjectURL(
        new Blob([sheet.svg], { type: 'image/svg+xml;charset=utf-8' }),
      ),
      img = new Image(),
      canvas = document.createElement('canvas');
    try {
      await new Promise<void>((resolve, reject) => {
        const finish = (error?: Error) => {
          signal.removeEventListener('abort', abort);
          img.onload = null;
          img.onerror = null;
          if (error) reject(error);
          else resolve();
        };
        const abort = () => {
          img.src = '';
          finish(new DOMException('Экспорт отменён.', 'AbortError'));
        };
        img.onload = () => finish();
        img.onerror = () =>
          finish(new Error('Не удалось подготовить лист PDF.'));
        signal.addEventListener('abort', abort, { once: true });
        img.src = url;
      });
      signal.throwIfAborted();
      canvas.width = Math.round((sheet.widthMm / 25.4) * dpi);
      canvas.height = Math.round((sheet.heightMm / 25.4) * dpi);
      const context = canvas.getContext('2d');
      if (!context) throw new Error('Браузер не предоставил холст для PDF.');
      context.fillStyle = '#ffffff';
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(img, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise<Blob>((resolve, reject) =>
        canvas.toBlob(
          (b) =>
            b
              ? resolve(b)
              : reject(new Error('Не удалось сохранить страницу PDF.')),
          'image/jpeg',
          0.96,
        ),
      );
      signal.throwIfAborted();
      pages.push({
        jpeg: new Uint8Array(await blob.arrayBuffer()),
        width: canvas.width,
        height: canvas.height,
        widthMm: sheet.widthMm,
        heightMm: sheet.heightMm,
      });
    } finally {
      URL.revokeObjectURL(url);
      canvas.width = 1;
      canvas.height = 1;
    }
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
  }
  signal.throwIfAborted();
  progress(sheets.length, sheets.length);
  const bytes = imagePagesPdf(pages);
  return new Blob([bytes as Uint8Array<ArrayBuffer>], {
    type: 'application/pdf',
  });
}
