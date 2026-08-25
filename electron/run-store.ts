/**
 * Run and audit data model.
 *
 * A "run" is created for every user message sent to agent_runtime.
 * Events (SSE chunks, tool calls, permission decisions, memory events,
 * file writes) are linked to the run by runId and appended to runs.jsonl.
 *
 * Schema is append-only JSONL so runs survive crashes and are easy to tail.
 */
import { join }                              from "path";
import { appendFileSync, readFileSync, existsSync } from "fs";
import { randomUUID }                        from "crypto";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
export type RunStatus = "running" | "done" | "error" | "cancelled";

export type RunEventType =
  | "message_chunk"
  | "tool_call"
  | "permission"
  | "memory_read"
  | "memory_write"
  | "file_write"
  | "status"
  | "error"
  | "done";

export interface RunEvent {
  runId:     string;
  seq:       number;
  type:      RunEventType;
  ts:        string;  // ISO-8601
  payload:   unknown;
}

export interface RunRecord {
  id:        string;
  sessionId: string;
  startedAt: string;
  endedAt?:  string;
  status:    RunStatus;
  mode:      string;
  model:     string;
  profile:   string; // active profile name at time of run
  message:   string; // first ~200 chars of user message
  eventCount: number;
}

// ---------------------------------------------------------------------------
// RunStore
// ---------------------------------------------------------------------------
export class RunStore {
  private runsPath:   string;
  private eventsPath: string;
  private seq = new Map<string, number>(); // runId → next seq

  constructor(userData: string) {
    this.runsPath   = join(userData, "runs.jsonl");
    this.eventsPath = join(userData, "run-events.jsonl");
  }

  // ── Run lifecycle ──────────────────────────────────────────────────────────

  startRun(opts: Omit<RunRecord, "id" | "startedAt" | "endedAt" | "status" | "eventCount">): RunRecord {
    const run: RunRecord = {
      id:         randomUUID(),
      startedAt:  new Date().toISOString(),
      status:     "running",
      eventCount: 0,
      ...opts,
    };
    this.appendRun(run);
    this.seq.set(run.id, 0);
    return run;
  }

  endRun(runId: string, status: RunStatus): void {
    const patch = { id: runId, endedAt: new Date().toISOString(), status };
    this.appendLine(this.runsPath, { ...patch, _patch: true });
  }

  // ── Event recording ───────────────────────────────────────────────────────

  addEvent(runId: string, type: RunEventType, payload: unknown): RunEvent {
    const seq = this.seq.get(runId) ?? 0;
    this.seq.set(runId, seq + 1);
    const event: RunEvent = { runId, seq, type, ts: new Date().toISOString(), payload };
    this.appendLine(this.eventsPath, event);
    return event;
  }

  // ── Query (simple — reads all, filters in-memory for now) ─────────────────

  getRecentRuns(limit = 50): RunRecord[] {
    return this.readLines<RunRecord>(this.runsPath)
      .filter((r) => !((r as any)._patch))
      .slice(-limit)
      .reverse();
  }

  getEventsForRun(runId: string): RunEvent[] {
    return this.readLines<RunEvent>(this.eventsPath).filter((e) => e.runId === runId);
  }

  // ── Private helpers ───────────────────────────────────────────────────────

  private appendRun(run: RunRecord): void { this.appendLine(this.runsPath, run); }

  private appendLine(path: string, obj: unknown): void {
    try { appendFileSync(path, JSON.stringify(obj) + "\n", "utf-8"); } catch {}
  }

  private readLines<T>(path: string): T[] {
    if (!existsSync(path)) return [];
    try {
      return readFileSync(path, "utf-8")
        .split("\n")
        .filter(Boolean)
        .map((l) => JSON.parse(l) as T);
    } catch { return []; }
  }
}
