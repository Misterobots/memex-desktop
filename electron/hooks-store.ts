/**
 * Hooks — event-triggered local shell commands (e.g. "when a run finishes,
 * run this"). Persisted as userData/hooks.json, same plain-JSON pattern as
 * config-store.ts.
 *
 * Two independent gates, not one: `enabled` is the user explicitly turning a
 * hook on in Settings; `approved` is a SEPARATE per-command consent granted
 * the first time it actually fires (see hooks-runner.ts) — enabling a hook
 * alone never lets it run unattended.
 */
import { join } from "path";
import { readFileSync, writeFileSync, existsSync } from "fs";
import { randomUUID } from "crypto";

export type HookEvent = "run:start" | "run:end";

export interface Hook {
  id:        string;
  name:      string;
  event:     HookEvent;
  command:   string;
  cwd?:      string;
  enabled:   boolean;   // default false — explicit per-hook opt-in
  approved:  boolean;   // true only after "Always allow" on a first-fire prompt
  createdAt: string;
}

interface HooksFile {
  hooks: Hook[];
}

export class HooksStore {
  private filePath: string;
  private hooks:    Hook[];

  constructor(userData: string) {
    this.filePath = join(userData, "hooks.json");
    this.hooks    = this.load();
  }

  private load(): Hook[] {
    if (existsSync(this.filePath)) {
      try {
        const raw = JSON.parse(readFileSync(this.filePath, "utf-8")) as HooksFile;
        return raw.hooks ?? [];
      } catch {}
    }
    return [];
  }

  private persist(): void {
    try { writeFileSync(this.filePath, JSON.stringify({ hooks: this.hooks }, null, 2), "utf-8"); } catch {}
  }

  getAll(): Hook[] { return this.hooks; }

  /**
   * Insert (no id) or update (with id). Resets `approved` to false whenever
   * an EXISTING hook's command or cwd changes — approval is consent for a
   * specific command, not a standing grant for whatever the hook is later
   * edited to run. New hooks always start unapproved regardless.
   */
  save(hook: Partial<Hook> & { name: string; event: HookEvent; command: string }): Hook {
    const idx = hook.id ? this.hooks.findIndex((h) => h.id === hook.id) : -1;

    if (idx >= 0) {
      const existing = this.hooks[idx];
      const commandChanged = existing.command !== hook.command || existing.cwd !== hook.cwd;
      const updated: Hook = {
        ...existing,
        ...hook,
        approved: commandChanged ? false : (hook.approved ?? existing.approved),
      };
      this.hooks[idx] = updated;
      this.persist();
      return updated;
    }

    const created: Hook = {
      id:        randomUUID(),
      name:      hook.name,
      event:     hook.event,
      command:   hook.command,
      cwd:       hook.cwd,
      enabled:   hook.enabled ?? false,
      approved:  false,
      createdAt: new Date().toISOString(),
    };
    this.hooks.push(created);
    this.persist();
    return created;
  }

  /** Used by hooks-runner.ts after an "Always allow"/"Deny" decision — same
   *  save() path, just a narrower call site for the runner's own updates. */
  setApproval(id: string, patch: { approved?: boolean; enabled?: boolean }): void {
    const hook = this.hooks.find((h) => h.id === id);
    if (!hook) return;
    Object.assign(hook, patch);
    this.persist();
  }

  delete(id: string): boolean {
    const before = this.hooks.length;
    this.hooks = this.hooks.filter((h) => h.id !== id);
    this.persist();
    return this.hooks.length < before;
  }
}
