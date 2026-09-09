import { serializeProject, type SerializedProject } from './editor-storage.ts';
import type { EditorProject } from './editor-model.ts';

/** Validate/serialize document edits off the UI thread; no worker traffic for view-only changes. */
export function createProjectSerializer() {
  let worker: Worker | null = null,
    fallback = false,
    sequence = 0;
  const pending = new Map<
    number,
    {
      project: EditorProject;
      resolve: (data: SerializedProject) => void;
      reject: (error: Error) => void;
    }
  >();
  function unavailable() {
    worker?.terminate();
    worker = null;
    fallback = true;
    for (const request of pending.values()) {
      try {
        request.resolve(serializeProject(request.project));
      } catch (error) {
        request.reject(error as Error);
      }
    }
    pending.clear();
  }
  return {
    serialize(project: EditorProject): Promise<SerializedProject> {
      return new Promise((resolve, reject) => {
        if (fallback || typeof Worker === 'undefined') {
          try {
            resolve(serializeProject(project));
          } catch (error) {
            reject(error);
          }
          return;
        }
        const id = ++sequence;
        pending.set(id, { project, resolve, reject });
        try {
          if (!worker) {
            worker = new Worker(
              new URL('./project-save.worker.ts', import.meta.url),
              { type: 'module' },
            );
            worker.onerror = (event) => {
              event.preventDefault();
              unavailable();
            };
            worker.onmessageerror = unavailable;
            worker.onmessage = (
              event: MessageEvent<{
                id: number;
                data?: SerializedProject;
                error?: string;
              }>,
            ) => {
              const request = pending.get(event.data.id);
              if (!request) return;
              pending.delete(event.data.id);
              if (event.data.data) request.resolve(event.data.data);
              else
                request.reject(
                  new Error(
                    event.data.error ?? 'Не удалось подготовить сохранение.',
                  ),
                );
            };
          }
          worker.postMessage({ id, project });
        } catch {
          unavailable();
        }
      });
    },
    dispose() {
      worker?.terminate();
      worker = null;
      for (const request of pending.values())
        request.reject(new Error('Сохранение отменено.'));
      pending.clear();
    },
  };
}
