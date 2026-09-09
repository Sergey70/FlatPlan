import {
  exportProject,
  importProject,
  validateEditorView,
  STORAGE_KEY,
  VIEW_STORAGE_KEY,
  ROOM_WORKSPACE_STORAGE_KEY,
  type EditorProject,
  type StoragePort,
} from './editor-model.ts';

/** Identity for a base save, not a security hash. Calculated only at load/full save. */
export function storageFingerprint(source: string): string {
  let a = 2166136261,
    b = 5381;
  for (let i = 0; i < source.length; i++) {
    const c = source.charCodeAt(i);
    a = Math.imul(a ^ c, 16777619);
    b = Math.imul(b, 33) ^ c;
  }
  return `${source.length}:${a >>> 0}:${b >>> 0}`;
}
export function readEditorProject(
  storage: StoragePort,
  source = storage.getItem(STORAGE_KEY),
): EditorProject | null {
  if (source === null) return null;
  const project = importProject(source);
  // A corrupt/stale optional view never prevents recovery of a valid model.
  try {
    const raw = storage.getItem(VIEW_STORAGE_KEY);
    if (raw && raw.length < 65536) {
      const saved = JSON.parse(raw);
      if (saved.version === 1 && saved.base === storageFingerprint(source))
        project.scene.view = validateEditorView(
          saved.view,
          project.scene.objects,
        );
    }
  } catch {
    /* Retain the view in the full project. */
  }
  return project;
}
function sameExcept(a: object, b: object, skip: string): boolean {
  const left = Object.keys(a).filter((k) => k !== skip);
  const right = Object.keys(b).filter((k) => k !== skip);
  return (
    left.length === right.length &&
    left.every(
      (k) =>
        Object.hasOwn(b, k) &&
        a[k as keyof typeof a] === b[k as keyof typeof b],
    )
  );
}
/** Immutable content references distinguish model edits from inexpensive view updates. */
export function sameProjectModel(
  a: EditorProject | null,
  b: EditorProject,
): boolean {
  return (
    !!a &&
    (a === b ||
      (sameExcept(a, b, 'scene') && sameExcept(a.scene, b.scene, 'view')))
  );
}
export type SerializedProject = { json: string; base: string };
export function serializeProject(project: EditorProject): SerializedProject {
  const json = exportProject(project);
  return { json, base: storageFingerprint(json) };
}
export type SaveStatus = 'saved' | 'saving' | 'error';
export class StorageConflictError extends Error {
  constructor() {
    super('Проект изменился в другой вкладке.');
  }
}
type Options = {
  project: EditorProject;
  saved: EditorProject | null;
  source: string | null;
  serialize: (project: EditorProject) => Promise<SerializedProject>;
  onStatus: (status: SaveStatus) => void;
  onError: (error: unknown) => void;
  delay?: number;
  schedule?: (run: () => void, delay: number) => () => void;
};

/** Owns save scheduling; camera frames never call the serializer or localStorage. */
export class EditorAutosave {
  private project: EditorProject;
  private saved: EditorProject | null;
  private source: string | null;
  private base: string;
  private view: string;
  private status: SaveStatus | undefined;
  private busy = new Set<string>();
  private cancel: (() => void) | null = null;
  private paused = false;
  private failed = false;
  private disposed = false;
  private generation = 0;
  private inFlight = false;
  private prepared: { project: EditorProject; data: SerializedProject } | null =
    null;
  private storage: StoragePort;
  private options: Options;
  constructor(storage: StoragePort, options: Options) {
    this.storage = storage;
    this.options = options;
    this.project = options.project;
    this.saved = options.saved;
    this.source = options.source;
    this.base =
      options.source === null ? '' : storageFingerprint(options.source);
    this.view = options.saved ? JSON.stringify(options.saved.scene.view) : '';
  }
  private dirty(): boolean {
    return (
      !sameProjectModel(this.saved, this.project) ||
      this.view !== JSON.stringify(this.project.scene.view)
    );
  }
  private report() {
    const status =
      this.paused || this.failed ? 'error' : this.dirty() ? 'saving' : 'saved';
    if (this.status !== status) {
      this.status = status;
      this.options.onStatus(status);
    }
  }
  update(project: EditorProject) {
    this.project = project;
    this.report();
    this.touch();
  }
  interaction(owner: string, active: boolean) {
    if (active) this.busy.add(owner);
    else this.busy.delete(owner);
    this.touch();
  }
  touch() {
    this.cancel?.();
    this.cancel = null;
    if (this.disposed || this.paused || this.busy.size || !this.dirty()) return;
    const schedule =
      this.options.schedule ??
      ((run, delay) => {
        const timer = setTimeout(run, delay);
        return () => clearTimeout(timer);
      });
    this.cancel = schedule(() => {
      this.cancel = null;
      void this.run();
    }, this.options.delay ?? 1000);
  }
  private fail(error: unknown) {
    this.cancel?.();
    this.cancel = null;
    this.failed = true;
    if (error instanceof StorageConflictError) this.pause();
    this.report();
    this.options.onError(error);
  }
  private write(data?: SerializedProject, snapshot = this.project) {
    if (data) {
      // Check the original bytes, without validating/serializing a second time.
      if (this.storage.getItem(STORAGE_KEY) !== this.source)
        throw new StorageConflictError();
      if (data.json !== this.source)
        this.storage.setItem(STORAGE_KEY, data.json);
      this.source = data.json;
      this.base = data.base;
      this.saved = snapshot;
      this.view = ''; // Replace a previous sidecar even when the full bytes are unchanged.
    }
    const view = JSON.stringify(
      validateEditorView(this.project.scene.view, this.project.scene.objects),
    );
    if (view !== this.view) {
      this.storage.setItem(
        VIEW_STORAGE_KEY,
        `{"version":1,"base":${JSON.stringify(this.base)},"view":${view}}`,
      );
      this.view = view;
    }
    if (this.storage.getItem(ROOM_WORKSPACE_STORAGE_KEY) !== '1')
      this.storage.setItem(ROOM_WORKSPACE_STORAGE_KEY, '1');
    this.failed = false;
    this.report();
  }
  private async run() {
    if (this.disposed || this.paused || this.busy.size || !this.dirty()) return;
    try {
      if (sameProjectModel(this.saved, this.project)) {
        this.write();
        return;
      }
      if (
        this.prepared &&
        sameProjectModel(this.prepared.project, this.project)
      ) {
        const ready = this.prepared;
        this.prepared = null;
        this.write(ready.data, ready.project);
        return;
      }
      if (this.inFlight) return;
      this.prepared = null;
      const snapshot = this.project,
        generation = this.generation;
      this.inFlight = true;
      let failure: unknown;
      try {
        const data = await this.options.serialize(snapshot);
        if (
          !this.disposed &&
          !this.paused &&
          generation === this.generation &&
          sameProjectModel(snapshot, this.project)
        )
          this.prepared = { project: snapshot, data };
      } catch (error) {
        if (!this.disposed && !this.paused && generation === this.generation)
          failure = error;
      } finally {
        this.inFlight = false;
      }
      if (failure) throw failure;
      // A user may have started another gesture while the worker was running.
      this.touch();
    } catch (error) {
      this.fail(error);
    }
  }
  /** Explicit save and page lifecycle flushes are synchronous and idempotent. */
  flush() {
    this.cancel?.();
    this.cancel = null;
    if (this.disposed || this.paused) return;
    this.generation++;
    try {
      if (!this.dirty() && !this.failed) return;
      if (sameProjectModel(this.saved, this.project)) this.write();
      else {
        const ready =
          this.prepared && sameProjectModel(this.prepared.project, this.project)
            ? this.prepared
            : null;
        this.prepared = null;
        this.write(
          ready?.data ?? serializeProject(this.project),
          ready?.project ?? this.project,
        );
      }
    } catch (error) {
      this.fail(error);
    }
  }
  external(source: string | null) {
    if (source !== this.source) this.fail(new StorageConflictError());
  }
  pause() {
    this.paused = true;
    this.generation++;
    this.prepared = null;
    this.cancel?.();
    this.cancel = null;
    this.report();
  }
  /** Called only after explicit reset/recovery/import, never by an external storage event. */
  reset(project: EditorProject, stored = false) {
    this.generation++;
    this.cancel?.();
    this.cancel = null;
    this.prepared = null;
    this.project = project;
    this.saved = stored ? project : null;
    this.source = this.storage.getItem(STORAGE_KEY);
    this.base = this.source === null ? '' : storageFingerprint(this.source);
    this.view = stored ? JSON.stringify(project.scene.view) : '';
    this.paused = false;
    this.failed = false;
    this.report();
    this.touch();
  }
  dispose() {
    this.disposed = true;
    this.generation++;
    this.cancel?.();
    this.cancel = null;
    this.prepared = null;
  }
}
