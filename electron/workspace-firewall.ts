/**
 * Workspace capability firewall.
 *
 * Controls which file paths and shell commands the renderer may access.
 * Three permission modes:
 *   - "trusted"   — allow everything inside workspace roots without prompting
 *   - "workspace" — allow reads inside roots; prompt for writes or outside reads
 *   - "ask"       — prompt for every file, shell, and PTY operation
 *
 * All audit decisions are appended to userData/audit.jsonl.
 */
import { join, resolve, normalize, isAbsolute } from "path";
import { appendFileSync, existsSync } from "fs";
import { BrowserWindow, dialog } from "electron";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
export type PermissionMode = "trusted" | "workspace" | "ask";

export interface WorkspacePolicy {
  roots:          string[];       // absolute canonicalized paths
  mode:           PermissionMode;
  allowShell:     boolean;        // allow shell:exec at all
  allowWrite:     boolean;        // allow fs:writeFile / fs:mkdir at all
}

export type AuditAction = "fs:read" | "fs:write" | "shell:exec" | "pty:create" | "fs:mkdir";
export type AuditDecision = "allowed" | "denied" | "approved_once" | "approved_session";

export interface AuditEvent {
  ts:       string;           // ISO-8601
  action:   AuditAction;
  subject:  string;           // path or command
  decision: AuditDecision;
  mode:     PermissionMode;
}

// ---------------------------------------------------------------------------
// Default policy — workspace mode, roots empty (any path inside CWD)
// ---------------------------------------------------------------------------
const DEFAULT_POLICY: WorkspacePolicy = {
  roots:      [],
  mode:       "workspace",
  allowShell: true,
  allowWrite: true,
};

// ---------------------------------------------------------------------------
// WorkspaceFirewall
// ---------------------------------------------------------------------------
export class WorkspaceFirewall {
  private policy:       WorkspacePolicy = { ...DEFAULT_POLICY };
  private sessionAllow: Set<string>     = new Set(); // paths/cmds approved for session
  private auditPath:    string;

  constructor(userData: string) {
    this.auditPath = join(userData, "audit.jsonl");
  }

  setPolicy(policy: Partial<WorkspacePolicy>) {
    this.policy = { ...DEFAULT_POLICY, ...policy };
  }

  getPolicy(): WorkspacePolicy { return this.policy; }

  addRoot(root: string) {
    const abs = this.canon(root);
    if (!this.policy.roots.includes(abs)) this.policy.roots.push(abs);
  }

  clearSessionApprovals() { this.sessionAllow.clear(); }

  // ---------------------------------------------------------------------------
  // Path helpers
  // ---------------------------------------------------------------------------
  private canon(p: string): string {
    // Normalize without resolving symlinks (no fs sync needed)
    return normalize(isAbsolute(p) ? p : join(process.cwd(), p));
  }

  private insideRoots(p: string): boolean {
    if (this.policy.roots.length === 0) return true; // no roots = open
    const cp = this.canon(p);
    return this.policy.roots.some((r) => cp.startsWith(r + "\\") || cp.startsWith(r + "/") || cp === r);
  }

  // ---------------------------------------------------------------------------
  // Audit
  // ---------------------------------------------------------------------------
  private audit(event: Omit<AuditEvent, "ts">) {
    const line = JSON.stringify({ ts: new Date().toISOString(), ...event }) + "\n";
    try { appendFileSync(this.auditPath, line, "utf-8"); } catch {}
  }

  // ---------------------------------------------------------------------------
  // Permission resolution (no dialog — caller must handle prompt)
  // ---------------------------------------------------------------------------
  private isSessionApproved(key: string): boolean { return this.sessionAllow.has(key); }
  private grantSession(key: string)               { this.sessionAllow.add(key); }

  // ---------------------------------------------------------------------------
  // Public check API
  // ---------------------------------------------------------------------------

  /**
   * Check and gate a filesystem read.
   * Returns true if allowed, false if denied.
   * May show a native dialog when mode === "ask" or path is outside roots.
   */
  async checkRead(path: string, win: BrowserWindow | null): Promise<boolean> {
    const cp  = this.canon(path);
    const key = `read:${cp}`;

    if (this.policy.mode === "trusted") {
      this.audit({ action: "fs:read", subject: cp, decision: "allowed", mode: this.policy.mode });
      return true;
    }

    if (this.policy.mode === "workspace") {
      if (this.insideRoots(cp)) {
        this.audit({ action: "fs:read", subject: cp, decision: "allowed", mode: this.policy.mode });
        return true;
      }
      // Outside workspace — prompt
    }

    // mode === "ask" or outside workspace
    if (this.isSessionApproved(key)) {
      this.audit({ action: "fs:read", subject: cp, decision: "approved_session", mode: this.policy.mode });
      return true;
    }

    return this.prompt("fs:read", cp, key, win, `Read file outside workspace:\n${cp}`);
  }

  async checkWrite(path: string, win: BrowserWindow | null): Promise<boolean> {
    if (!this.policy.allowWrite) {
      this.audit({ action: "fs:write", subject: path, decision: "denied", mode: this.policy.mode });
      return false;
    }
    const cp  = this.canon(path);
    const key = `write:${cp}`;

    if (this.policy.mode === "trusted") {
      this.audit({ action: "fs:write", subject: cp, decision: "allowed", mode: this.policy.mode });
      return true;
    }
    if (this.policy.mode === "workspace" && this.insideRoots(cp)) {
      this.audit({ action: "fs:write", subject: cp, decision: "allowed", mode: this.policy.mode });
      return true;
    }
    if (this.isSessionApproved(key)) {
      this.audit({ action: "fs:write", subject: cp, decision: "approved_session", mode: this.policy.mode });
      return true;
    }
    return this.prompt("fs:write", cp, key, win, `Write file:\n${cp}`);
  }

  async checkMkdir(path: string, win: BrowserWindow | null): Promise<boolean> {
    if (!this.policy.allowWrite) {
      this.audit({ action: "fs:mkdir", subject: path, decision: "denied", mode: this.policy.mode });
      return false;
    }
    const cp  = this.canon(path);
    const key = `mkdir:${cp}`;
    if (this.policy.mode === "trusted") {
      this.audit({ action: "fs:mkdir", subject: cp, decision: "allowed", mode: this.policy.mode });
      return true;
    }
    if (this.policy.mode === "workspace" && this.insideRoots(cp)) {
      this.audit({ action: "fs:mkdir", subject: cp, decision: "allowed", mode: this.policy.mode });
      return true;
    }
    if (this.isSessionApproved(key)) return true;
    return this.prompt("fs:mkdir", cp, key, win, `Create directory:\n${cp}`);
  }

  async checkShell(cmd: string, cwd: string | undefined, win: BrowserWindow | null): Promise<boolean> {
    if (!this.policy.allowShell) {
      this.audit({ action: "shell:exec", subject: cmd, decision: "denied", mode: this.policy.mode });
      return false;
    }
    if (this.policy.mode === "trusted") {
      this.audit({ action: "shell:exec", subject: cmd, decision: "allowed", mode: this.policy.mode });
      return true;
    }
    // Require a cwd inside workspace for non-trusted modes
    if (cwd && this.insideRoots(cwd)) {
      this.audit({ action: "shell:exec", subject: cmd, decision: "allowed", mode: this.policy.mode });
      return true;
    }
    const key = `shell:${cmd.slice(0, 80)}`;
    if (this.isSessionApproved(key)) return true;
    return this.prompt(
      "shell:exec", cmd, key, win,
      `Run shell command${cwd ? ` (cwd outside workspace)` : " (no cwd)"}:\n${cmd.slice(0, 200)}`
    );
  }

  async checkPty(cwd: string | undefined, win: BrowserWindow | null): Promise<boolean> {
    if (this.policy.mode === "trusted") {
      this.audit({ action: "pty:create", subject: cwd ?? "no cwd", decision: "allowed", mode: this.policy.mode });
      return true;
    }
    if (cwd && this.insideRoots(cwd)) {
      this.audit({ action: "pty:create", subject: cwd, decision: "allowed", mode: this.policy.mode });
      return true;
    }
    if (this.policy.mode === "ask") {
      const key = `pty:${cwd ?? ""}`;
      if (this.isSessionApproved(key)) return true;
      return this.prompt("pty:create", cwd ?? "no cwd", key, win, `Open terminal${cwd ? `\nDirectory: ${cwd}` : " (no workspace directory)"}`);
    }
    // workspace mode, cwd outside roots — allow but audit
    this.audit({ action: "pty:create", subject: cwd ?? "no cwd", decision: "allowed", mode: this.policy.mode });
    return true;
  }

  // ---------------------------------------------------------------------------
  // Native dialog prompt
  // ---------------------------------------------------------------------------
  private async prompt(
    action: AuditAction,
    subject: string,
    sessionKey: string,
    win: BrowserWindow | null,
    detail: string,
  ): Promise<boolean> {
    const w = win ?? BrowserWindow.getFocusedWindow();
    const opts = {
      type: "question" as const,
      title: "Workspace permission required",
      message: "Allow this operation?",
      detail,
      buttons: ["Allow once", "Allow for session", "Deny"],
      defaultId: 0, cancelId: 2, noLink: true,
    };
    const { response } = w
      ? await dialog.showMessageBox(w, opts)
      : await dialog.showMessageBox(opts);

    if (response === 1) {
      this.grantSession(sessionKey);
      this.audit({ action, subject, decision: "approved_session", mode: this.policy.mode });
      return true;
    }
    if (response === 0) {
      this.audit({ action, subject, decision: "approved_once", mode: this.policy.mode });
      return true;
    }
    this.audit({ action, subject, decision: "denied", mode: this.policy.mode });
    return false;
  }
}
