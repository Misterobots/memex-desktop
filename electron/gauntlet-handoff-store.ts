/**
 * Durable, desktop-owned Gauntlet handoff packets.
 *
 * The agent runtime may coordinate builders and critics, but it must never be
 * the only place the original goal, quality bar, or effort policy exists.
 * Packets are append-only JSONL records with patches, so an interrupted run
 * can be inspected and explicitly accepted on this machine before it resumes.
 */
import { appendFileSync, existsSync, readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { join } from "node:path";

export type GauntletRole = "coordinator" | "builder" | "critic";
export type GauntletPhase = "scope" | "build" | "critic" | "compare" | "repair" | "verify" | "final_review";
export type GauntletHandoffStatus = "ready" | "accepted" | "completed" | "blocked" | "cancelled";

export interface GauntletEffortPolicy {
  model: string;
  outputDetail: "low" | "medium" | "high";
  reasoningSummary: "auto" | "concise" | "detailed" | "none";
  reasoningEffort: "low" | "medium" | "high";
}

export interface GauntletHandoff {
  id: string;
  version: 1;
  createdAt: string;
  updatedAt: string;
  sessionId: string;
  workspaceKey?: string;
  runId?: string;
  parentId?: string;
  role: GauntletRole;
  phase: GauntletPhase;
  status: GauntletHandoffStatus;
  /** Immutable after creation. */
  goal: string;
  /** Immutable after creation. */
  qualityBar: string;
  /** Immutable after creation. */
  effort: GauntletEffortPolicy;
  owner?: string;
  acceptedAt?: string;
  completed: string[];
  pending: string[];
  deficits: string[];
  nextAction: string;
}

export type NewGauntletHandoff = Omit<GauntletHandoff,
  "id" | "version" | "createdAt" | "updatedAt" | "status" | "completed" | "pending" | "deficits" | "phase" | "nextAction"
> & Partial<Pick<GauntletHandoff, "status" | "completed" | "pending" | "deficits" | "phase" | "nextAction">>;

type MutablePatch = Partial<Pick<GauntletHandoff,
  "runId" | "parentId" | "role" | "phase" | "status" | "owner" | "acceptedAt" | "completed" | "pending" | "deficits" | "nextAction"
>>;

const ALLOWED: Record<GauntletHandoffStatus, GauntletHandoffStatus[]> = {
  ready: ["accepted", "blocked", "cancelled"],
  accepted: ["ready", "completed", "blocked", "cancelled"],
  completed: [], blocked: ["ready", "cancelled"], cancelled: [],
};

export class GauntletHandoffStore {
  private readonly path: string;
  constructor(userData: string) { this.path = join(userData, "gauntlet-handoffs.jsonl"); }

  create(input: NewGauntletHandoff): GauntletHandoff {
    const now = new Date().toISOString();
    const record: GauntletHandoff = {
      id: randomUUID(), version: 1, createdAt: now, updatedAt: now,
      status: "ready", phase: "scope", completed: [], deficits: [],
      pending: ["Accept coordinator ownership", "Create a builder handoff", "Create an independent critic handoff"],
      nextAction: "Accept coordinator ownership before work continues.",
      ...input,
    };
    this.append(record);
    return record;
  }

  get(id: string): GauntletHandoff | null { return this.all().find((record) => record.id === id) ?? null; }
  forSession(sessionId: string): GauntletHandoff[] { return this.all().filter((record) => record.sessionId === sessionId); }

  accept(id: string, owner: string): GauntletHandoff | null {
    const existing = this.get(id);
    if (!existing || !ALLOWED[existing.status].includes("accepted")) return null;
    return this.patch(id, { status: "accepted", owner, acceptedAt: new Date().toISOString(), nextAction: "Coordinate a builder handoff against the preserved quality bar." });
  }

  patch(id: string, patch: MutablePatch): GauntletHandoff | null {
    const existing = this.get(id);
    if (!existing) return null;
    // IPC values are untyped at runtime. Copy only the explicit mutable
    // fields so a renderer cannot quietly rewrite the original goal/bar or
    // effort policy by smuggling extra keys through a `Partial` object.
    const candidate: MutablePatch = {
      runId: patch.runId, parentId: patch.parentId, role: patch.role,
      phase: patch.phase, status: patch.status, owner: patch.owner,
      acceptedAt: patch.acceptedAt, completed: patch.completed,
      pending: patch.pending, deficits: patch.deficits, nextAction: patch.nextAction,
    };
    const mutable = Object.fromEntries(Object.entries(candidate).filter(([, value]) => value !== undefined)) as MutablePatch;
    if (mutable.status && mutable.status !== existing.status && !ALLOWED[existing.status].includes(mutable.status)) return null;
    const updated: GauntletHandoff = { ...existing, ...mutable, updatedAt: new Date().toISOString() };
    this.append({ id, _patch: true, ...mutable, updatedAt: updated.updatedAt });
    return updated;
  }

  private all(): GauntletHandoff[] {
    if (!existsSync(this.path)) return [];
    try {
      const records = new Map<string, GauntletHandoff>();
      for (const raw of readFileSync(this.path, "utf8").split("\n").filter(Boolean)) {
        const line = JSON.parse(raw) as GauntletHandoff & { _patch?: boolean };
        if (!line._patch) records.set(line.id, line);
        else {
          const prior = records.get(line.id);
          if (prior) records.set(line.id, { ...prior, ...line, _patch: undefined } as GauntletHandoff);
        }
      }
      return [...records.values()].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    } catch { return []; }
  }

  private append(value: unknown): void { try { appendFileSync(this.path, `${JSON.stringify(value)}\n`, "utf8"); } catch {} }
}
