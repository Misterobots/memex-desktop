/**
 * Owner-scoped approval decisions for renderer-originated tool requests.
 *
 * Session approvals intentionally live only in memory. Workspace approvals
 * survive restart, but are partitioned by authenticated desktop UID and a
 * workspace fingerprint so a second identity or workspace cannot inherit
 * another workspace's grants.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export type ApprovalScope = "once" | "session" | "workspace";
export type StoredApprovalScope = Exclude<ApprovalScope, "once">;

type PersistedApprovals = Record<string, Record<string, Record<string, true>>>;

export class PermissionStore {
  private readonly path: string;
  private persisted: PersistedApprovals = {};
  private readonly session = new Map<string, Set<string>>();

  constructor(userData: string) {
    this.path = join(userData, "tool-approvals.json");
    this.load();
  }

  isApproved(uid: string, workspaceKey: string, toolName: string): StoredApprovalScope | null {
    const owner = this.owner(uid);
    const workspace = this.workspace(workspaceKey);
    const tool = this.tool(toolName);
    const sessionKey = `${workspace}:${tool}`;
    if (this.session.get(owner)?.has(sessionKey)) return "session";
    if (this.persisted[owner]?.[workspace]?.[tool] === true) return "workspace";
    return null;
  }

  /**
   * Store a session or workspace grant. A workspace grant is only reported as
   * successful after it has been durably written, preserving fail-closed
   * behavior when the user-data directory is unavailable.
   */
  grant(uid: string, workspaceKey: string, toolName: string, scope: StoredApprovalScope): boolean {
    const owner = this.owner(uid);
    const workspace = this.workspace(workspaceKey);
    const tool = this.tool(toolName);
    const sessionKey = `${workspace}:${tool}`;

    if (scope === "session") {
      const approvals = this.session.get(owner) ?? new Set<string>();
      approvals.add(sessionKey);
      this.session.set(owner, approvals);
      return true;
    }

    const previous = this.persisted[owner];
    const previousWorkspace = previous?.[workspace];
    this.persisted[owner] = {
      ...previous,
      [workspace]: { ...previousWorkspace, [tool]: true },
    };
    if (this.persist()) return true;
    if (previous) this.persisted[owner] = previous;
    else delete this.persisted[owner];
    return false;
  }

  clearSession(uid?: string): void {
    if (uid === undefined) this.session.clear();
    else this.session.delete(this.owner(uid));
  }

  private load(): void {
    if (!existsSync(this.path)) return;
    try {
      const raw = JSON.parse(readFileSync(this.path, "utf-8")) as unknown;
      if (!raw || typeof raw !== "object" || Array.isArray(raw)) return;
      const parsed: PersistedApprovals = Object.create(null) as PersistedApprovals;
      for (const [uid, workspaces] of Object.entries(raw)) {
        if (!workspaces || typeof workspaces !== "object" || Array.isArray(workspaces)) continue;
        const validWorkspaces: Record<string, Record<string, true>> = Object.create(null) as Record<string, Record<string, true>>;
        for (const [workspace, tools] of Object.entries(workspaces)) {
          if (!tools || typeof tools !== "object" || Array.isArray(tools)) continue;
          const valid = Object.entries(tools)
            .filter((entry): entry is [string, true] => entry[1] === true)
            .reduce<Record<string, true>>((result, [tool]) => {
              result[tool] = true;
              return result;
            }, Object.create(null) as Record<string, true>);
          if (Object.keys(valid).length > 0) validWorkspaces[workspace] = valid;
        }
        if (Object.keys(validWorkspaces).length > 0) parsed[uid] = validWorkspaces;
      }
      this.persisted = parsed;
    } catch {
      // Malformed or unreadable approval state must never grant access.
      this.persisted = {};
    }
  }

  private persist(): boolean {
    try {
      writeFileSync(this.path, JSON.stringify(this.persisted, null, 2), "utf-8");
      return true;
    } catch {
      return false;
    }
  }

  private owner(uid: string): string {
    return encodeURIComponent(uid.trim() || "desktop");
  }

  private tool(toolName: string): string {
    return toolName.trim() || "unknown_tool";
  }

  private workspace(workspaceKey: string): string {
    return encodeURIComponent(workspaceKey.trim() || "default-workspace");
  }
}
