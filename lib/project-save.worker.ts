import { serializeProject } from './editor-storage';
import type { EditorProject } from './editor-model';
self.onmessage = (
  event: MessageEvent<{ id: number; project: EditorProject }>,
) => {
  const { id, project } = event.data;
  try {
    self.postMessage({ id, data: serializeProject(project) });
  } catch (error) {
    self.postMessage({ id, error: (error as Error).message });
  }
};
