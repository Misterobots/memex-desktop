import { join }           from "path";
import { appendFileSync, readFileSync, writeFileSync, existsSync } from "fs";
import type { MemexMode } from "../src/types/memex";

// ---------------------------------------------------------------------------
// Types (mirrored in src/types/memex.ts)
// ---------------------------------------------------------------------------
export interface EvalCase {
  id:            string;
  name:          string;
  input:         string;
  mode:          MemexMode;
  model:         string;
  expectedNotes: string;
  rubric:        string;
  workspaceRoot?: string;
  createdAt:     string;
}

export interface EvalResult {
  id:         string;
  caseId:     string;
  runId?:     string;
  startedAt:  string;
  endedAt?:   string;
  latencyMs?: number;
  output:     string;
  score?:     number;   // 0-5 manual score
  notes?:     string;
}

// ---------------------------------------------------------------------------
// EvalStore
// ---------------------------------------------------------------------------
export class EvalStore {
  private casesPath:   string;
  private resultsPath: string;

  constructor(userData: string) {
    this.casesPath   = join(userData, "eval-cases.jsonl");
    this.resultsPath = join(userData, "eval-results.jsonl");
  }

  // ── Cases ─────────────────────────────────────────────────────────────────
  getCases(): EvalCase[] {
    if (!existsSync(this.casesPath)) return [];
    return readFileSync(this.casesPath, "utf-8")
      .split("\n")
      .filter(Boolean)
      .map((l) => JSON.parse(l) as EvalCase);
  }

  saveCase(partial: Omit<EvalCase, "id" | "createdAt"> & { id?: string }): EvalCase {
    const id = partial.id ?? `eval-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const existing = this.getCases();
    const idx = existing.findIndex((c) => c.id === id);

    const ec: EvalCase = {
      id,
      name:          partial.name,
      input:         partial.input,
      mode:          partial.mode,
      model:         partial.model,
      expectedNotes: partial.expectedNotes,
      rubric:        partial.rubric,
      workspaceRoot: partial.workspaceRoot,
      createdAt:     idx >= 0 ? existing[idx].createdAt : new Date().toISOString(),
    };

    if (idx >= 0) {
      existing[idx] = ec;
      writeFileSync(this.casesPath, existing.map((c) => JSON.stringify(c)).join("\n") + "\n", "utf-8");
    } else {
      appendFileSync(this.casesPath, JSON.stringify(ec) + "\n", "utf-8");
    }
    return ec;
  }

  deleteCase(id: string): void {
    if (!existsSync(this.casesPath)) return;
    const remaining = this.getCases().filter((c) => c.id !== id);
    writeFileSync(this.casesPath, remaining.map((c) => JSON.stringify(c)).join("\n") + "\n", "utf-8");
  }

  // ── Results ───────────────────────────────────────────────────────────────
  getResults(caseId?: string): EvalResult[] {
    if (!existsSync(this.resultsPath)) return [];
    const all = readFileSync(this.resultsPath, "utf-8")
      .split("\n")
      .filter(Boolean)
      .map((l) => JSON.parse(l) as EvalResult);
    return caseId ? all.filter((r) => r.caseId === caseId) : all;
  }

  startResult(caseId: string, runId?: string): EvalResult {
    const r: EvalResult = {
      id:        `er-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      caseId,
      runId,
      startedAt: new Date().toISOString(),
      output:    "",
    };
    appendFileSync(this.resultsPath, JSON.stringify(r) + "\n", "utf-8");
    return r;
  }

  updateResult(id: string, patch: Partial<EvalResult>): EvalResult | null {
    if (!existsSync(this.resultsPath)) return null;
    const all = this.getResults();
    const idx = all.findIndex((r) => r.id === id);
    if (idx < 0) return null;
    all[idx] = { ...all[idx], ...patch };
    writeFileSync(this.resultsPath, all.map((r) => JSON.stringify(r)).join("\n") + "\n", "utf-8");
    return all[idx];
  }
}
