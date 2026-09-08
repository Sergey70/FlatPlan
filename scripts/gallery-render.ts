// Local generation entry, served by Vite only; not a production page.
import { createEditorScene, type EditorScene } from '../lib/editor-scene';
import { createPlanProject, planArrangementId } from '../lib/plan-project.ts';
import { planLayouts } from '../lib/plan-data.ts';
import { galleryConcepts } from '../lib/gallery-data.ts';

let renderer: EditorScene | undefined;
async function renderGalleryShot(conceptId: string, shotId: string) {
  const concept = galleryConcepts.find((c) => c.id === conceptId)!;
  const shot = concept.images.find((s) => s.id === shotId)!;
  const layout = planLayouts.find((l) => l.id === concept.layout.id)!;
  const arrangement = createPlanProject().arrangements.find(
    (a) => a.id === planArrangementId(layout.id),
  )!;
  renderer?.dispose();
  renderer = createEditorScene(
    document.getElementById('render')!,
    {
      select() {},
      change() {},
      camera() {},
      ready() {},
      error(message) {
        if (message) throw new Error(message);
      },
    },
    {
      fov: shot.fov,
      ceilingHeight: shot.cutaway ? undefined : layout.height / 100,
    },
  );
  renderer.update(arrangement.scene.objects, {
    ...arrangement.scene.view,
    palette: concept.style.id,
    camera: shot.camera,
    cutaway: shot.cutaway,
    furniture: true,
    labels: false,
    grid: false,
    night: false,
    selected: null,
  });
  await new Promise<void>((resolve) =>
    requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
  );
  return { objects: arrangement.scene.objects };
}
async function exportGalleryShot() {
  const blob = await renderer!.snapshot();
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}
declare global {
  interface Window {
    renderGalleryShot: typeof renderGalleryShot;
    exportGalleryShot: typeof exportGalleryShot;
  }
}
window.renderGalleryShot = renderGalleryShot;
window.exportGalleryShot = exportGalleryShot;
