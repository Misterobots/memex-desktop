/**
 * In-memory editor buffers keep unsaved work alive while Code panes are
 * switched or temporarily unmounted. This is intentionally not part of the
 * persisted settings payload: source files can be large and the filesystem is
 * the durable source of truth after an explicit save.
 */
export interface EditorBuffer {
  content: string;
  original: string;
}

const buffers = new Map<string, EditorBuffer>();

export function getEditorBuffer(path: string): EditorBuffer | undefined {
  return buffers.get(path);
}

export function setEditorBuffer(path: string, buffer: EditorBuffer): void {
  buffers.set(path, buffer);
}

export function clearEditorBuffer(path: string): void {
  buffers.delete(path);
}

/** Test-only cleanup; no renderer component should need to call this. */
export function clearEditorBuffers(): void {
  buffers.clear();
}
