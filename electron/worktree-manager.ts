import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join, normalize } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { randomUUID } from "node:crypto";
import { safeWorktreeSlug } from "../src/lib/worktree-policy";

const execFileAsync = promisify(execFile);

export interface WorktreeRecord {
  id: string;
  repoPath: string;
  path: string;
  branch: string;
  baseRef: string;
  createdAt: string;
}

export interface WorktreeExitResult {
  removed: boolean;
  branchDeleted: boolean;
  branch: string;
}

export interface WorktreeMergeResult {
  merged: boolean;
  branch: string;
  targetBranch: string;
  removed: boolean;
  branchDeleted: boolean;
}

function inside(root: string, candidate: string): boolean {
  const base = normalize(root);
  const target = normalize(candidate);
  return target === base || target.startsWith(`${base}/`) || target.startsWith(`${base}\\`);
}

export class WorktreeManager {
  private readonly statePath: string;
  private records: WorktreeRecord[] = [];

  constructor(userData: string) {
    this.statePath = join(userData, "worktrees.json");
    this.load();
  }

  async enter(repoPath: string, baseRef = "HEAD", label = "task"): Promise<WorktreeRecord> {
    const repoRoot = await this.git(repoPath, ["rev-parse", "--show-toplevel"]);
    const root = normalize(repoRoot.stdout.trim());
    if (!root || !existsSync(root)) throw new Error("Git repository root is unavailable");

    const id = randomUUID();
    const branch = `memex/${safeWorktreeSlug(label)}-${id.slice(0, 8)}`;
    const path = join(root, ".memex-worktrees", `${safeWorktreeSlug(label)}-${id.slice(0, 8)}`);
    if (!inside(root, path)) throw new Error("Worktree path escaped repository root");

    const resolvedBase = baseRef === "HEAD"
      ? ((await this.git(root, ["branch", "--show-current"])).stdout.trim() || "HEAD")
      : baseRef;
    await this.git(root, ["worktree", "add", "-b", branch, path, resolvedBase]);
    const record: WorktreeRecord = { id, repoPath: root, path, branch, baseRef: resolvedBase, createdAt: new Date().toISOString() };
    this.records.push(record);
    this.persist();
    return record;
  }

  async merge(id: string): Promise<WorktreeMergeResult> {
    const record = this.records.find((item) => item.id === id);
    if (!record) throw new Error("Unknown worktree");
    const rootStatus = await this.git(record.repoPath, ["status", "--porcelain"]);
    if (rootStatus.stdout.trim()) throw new Error("Repository root has uncommitted changes; review or stash them first");
    const targetBranch = (await this.git(record.repoPath, ["branch", "--show-current"])).stdout.trim();
    if (targetBranch !== record.baseRef) {
      throw new Error(`Repository root must be on ${record.baseRef} before merging`);
    }

    try {
      await this.git(record.repoPath, ["merge", "--no-ff", "--no-edit", record.branch]);
    } catch (error) {
      try { await this.git(record.repoPath, ["merge", "--abort"]); } catch { /* preserve original error */ }
      throw error;
    }

    await this.git(record.repoPath, ["worktree", "remove", record.path]);
    let branchDeleted = false;
    try {
      await this.git(record.repoPath, ["branch", "-d", record.branch]);
      branchDeleted = true;
    } catch {
      // A merged branch should normally delete cleanly; retain it if Git
      // refuses so the user's commits remain recoverable.
    }
    this.records = this.records.filter((item) => item.id !== id);
    this.persist();
    return { merged: true, branch: record.branch, targetBranch, removed: true, branchDeleted };
  }

  async exit(id: string, force = false): Promise<WorktreeExitResult> {
    const record = this.records.find((item) => item.id === id);
    if (!record) throw new Error("Unknown worktree");
    if (!force) {
      const status = await this.git(record.path, ["status", "--porcelain"]);
      if (status.stdout.trim()) throw new Error("Worktree has uncommitted changes; review or force removal first");
    }
    await this.git(record.repoPath, ["worktree", "remove", ...(force ? ["--force"] : []), record.path]);
    let branchDeleted = false;
    try {
      await this.git(record.repoPath, ["branch", force ? "-D" : "-d", record.branch]);
      branchDeleted = true;
    } catch {
      // Keep the record removed; a branch with reviewed commits is intentionally
      // left behind rather than deleting user work.
    }
    this.records = this.records.filter((item) => item.id !== id);
    this.persist();
    return { removed: true, branchDeleted, branch: record.branch };
  }

  list(repoPath?: string): WorktreeRecord[] {
    const root = repoPath ? normalize(repoPath) : undefined;
    return this.records.filter((record) => !root || record.repoPath === root);
  }

  private async git(cwd: string, args: string[]): Promise<{ stdout: string; stderr: string }> {
    try {
      return await execFileAsync("git", ["-C", cwd, ...args], { windowsHide: true, maxBuffer: 2 * 1024 * 1024 });
    } catch (error) {
      const detail = error instanceof Error ? error.message : "Git command failed";
      throw new Error(detail.slice(0, 500));
    }
  }

  private load(): void {
    if (!existsSync(this.statePath)) return;
    try {
      const raw = JSON.parse(readFileSync(this.statePath, "utf-8")) as unknown;
      if (Array.isArray(raw)) this.records = raw.filter((item): item is WorktreeRecord => this.valid(item));
    } catch { this.records = []; }
  }

  private persist(): void {
    try { writeFileSync(this.statePath, JSON.stringify(this.records, null, 2), "utf-8"); } catch {}
  }

  private valid(value: unknown): value is WorktreeRecord {
    if (!value || typeof value !== "object") return false;
    const item = value as Partial<WorktreeRecord>;
    return [item.id, item.repoPath, item.path, item.branch, item.baseRef, item.createdAt].every((field) => typeof field === "string");
  }
}
