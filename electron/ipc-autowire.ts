/**
 * Registers ipcMain.handle for pure-passthrough store methods — the
 * "namespace:method calls one store method and returns the result" shape
 * that's the majority of this app's IPC surface (33 of 59 handlers as of the
 * audit that motivated this file). Anything with a permission check, an
 * event broadcast, or state beyond the store itself (fs:writeFile,
 * shell:exec, config:setActive, pty:*, ...) stays hand-written in
 * ipc-handlers.ts — that logic needs to stay visible, not be hidden behind a
 * generic wrapper.
 *
 * `methods` is an explicit allowlist, never reflection over every public
 * method on the class. That's the safety-critical property, not an
 * incidental API choice: a store can have public methods that must NOT be
 * renderer-reachable (e.g. HooksStore.setApproval() — internal-only, called
 * by hooks-runner.ts in the main process to record a first-fire consent
 * decision; auto-exposing every public method would let renderer code call
 * it directly and silently self-approve a hook, bypassing the whole
 * first-fire dialog). Only list what's genuinely meant to be callable from
 * the renderer.
 */
import { ipcMain } from "electron";

/**
 * `methods` is either:
 *   - an array, when the IPC channel suffix should equal the store method
 *     name ("hooks:save" -> store.save()) — the common case for anything
 *     designed alongside its IPC surface from the start.
 *   - a { channelSuffix: methodName } map, for stores whose existing
 *     renderer-facing channel name predates (or is just friendlier than) the
 *     store's own method name — e.g. "config:save" must keep calling
 *     ConfigStore.saveProfile(), and "artifact:add" must keep calling
 *     addArtifact(). Renaming the channel to match the method would ripple
 *     into every renderer call site (bridge.config.save(...) etc.) for zero
 *     benefit — the map exists specifically to avoid that.
 */
export function autoWireStore<T extends object>(
  namespace: string,
  store: T,
  methods: readonly (keyof T & string)[] | Readonly<Record<string, keyof T & string>>,
): void {
  const entries: Array<[string, keyof T & string]> = Array.isArray(methods)
    ? methods.map((m) => [m, m])
    : Object.entries(methods as Record<string, keyof T & string>);

  for (const [channelSuffix, method] of entries) {
    const fn = store[method];
    if (typeof fn !== "function") continue;
    ipcMain.handle(`${namespace}:${channelSuffix}`, (_e, ...args) => (fn as (...a: unknown[]) => unknown).apply(store, args));
  }
}
