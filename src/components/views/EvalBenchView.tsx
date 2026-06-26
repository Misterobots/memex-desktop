import { useCallback, useEffect, useState } from "react";
import { desktop }    from "../../lib/desktop";
import { streamChat } from "../../lib/sse-stream";
import { useStore }   from "../../lib/store";
import { MODE_FLAGS, MODE_LABELS, type MemexMode } from "../../types/memex";
import type { EvalCase, EvalResult } from "../../types/memex";

const MODES: MemexMode[] = ["chat", "swarm", "research", "design", "think", "plan"];

// ---------------------------------------------------------------------------
// Empty form defaults
// ---------------------------------------------------------------------------
const EMPTY: Omit<EvalCase, "id" | "createdAt"> = {
  name:          "",
  input:         "",
  mode:          "chat",
  model:         "qwen3.6:27b",
  expectedNotes: "",
  rubric:        "",
  workspaceRoot: "",
};

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <label className="text-[11px] font-medium text-muted uppercase tracking-wide">{label}</label>
      {children}
    </div>
  );
}

function TextInput({ value, onChange, placeholder, mono = false }: {
  value: string; onChange: (v: string) => void;
  placeholder?: string; mono?: boolean;
}) {
  return (
    <input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className={`w-full px-3 py-1.5 rounded-lg bg-surface2 border border-border/60 text-sm text-text
        focus:outline-none focus:ring-1 focus:ring-accent/60
        ${mono ? "font-mono" : ""}`}
    />
  );
}

function TextArea({ value, onChange, placeholder, rows = 3 }: {
  value: string; onChange: (v: string) => void;
  placeholder?: string; rows?: number;
}) {
  return (
    <textarea
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      rows={rows}
      className="w-full px-3 py-2 rounded-lg bg-surface2 border border-border/60 text-sm text-text
        focus:outline-none focus:ring-1 focus:ring-accent/60 resize-none font-mono"
    />
  );
}

function ScorePips({ score, onChange }: { score?: number; onChange: (s: number) => void }) {
  return (
    <div className="flex gap-1">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          onClick={() => onChange(n)}
          className={`w-6 h-6 rounded-full border text-xs transition-colors
            ${(score ?? 0) >= n
              ? "bg-accent border-accent text-white"
              : "border-border/60 text-muted hover:border-accent/50"}`}
        >{n}</button>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main view
// ---------------------------------------------------------------------------
export function EvalBenchView() {
  const bridge = desktop();
  const { selectedModel } = useStore();

  const [cases,       setCases]       = useState<EvalCase[]>([]);
  const [selectedId,  setSelectedId]  = useState<string | null>(null);
  const [editing,     setEditing]     = useState<Partial<EvalCase> | null>(null);
  const [results,     setResults]     = useState<EvalResult[]>([]);
  const [replaying,   setReplaying]   = useState(false);
  const [replayOut,   setReplayOut]   = useState("");

  const load = useCallback(async () => {
    if (!bridge) return;
    const cs = await bridge.evals.getCases();
    setCases(cs);
  }, [bridge]);

  useEffect(() => { load(); }, [load]);

  const loadResults = useCallback(async (caseId: string) => {
    if (!bridge) return;
    const rs = await bridge.evals.getResults(caseId);
    setResults(rs.sort((a, b) => b.startedAt.localeCompare(a.startedAt)));
  }, [bridge]);

  useEffect(() => {
    if (selectedId) loadResults(selectedId);
    else setResults([]);
  }, [selectedId, loadResults]);

  const selected = cases.find((c) => c.id === selectedId) ?? null;

  // ── Save ────────────────────────────────────────────────────────────────
  const handleSave = async () => {
    if (!bridge || !editing) return;
    const saved = await bridge.evals.saveCase(editing);
    await load();
    setSelectedId(saved.id);
    setEditing(null);
  };

  const handleDelete = async (id: string) => {
    await bridge?.evals.deleteCase(id);
    if (selectedId === id) setSelectedId(null);
    await load();
  };

  // ── Replay ──────────────────────────────────────────────────────────────
  const handleReplay = useCallback(() => {
    if (!selected || replaying || !bridge) return;
    setReplaying(true);
    setReplayOut("");

    let accumulated = "";
    const t0 = Date.now();
    let resultId: string | undefined;

    bridge.evals.startResult(selected.id).then((r) => { resultId = r.id; });

    const stop = streamChat({
      messages: [{ role: "user", content: selected.input }],
      mode:    selected.mode,
      model:   selected.model || selectedModel,
      modeFlags: MODE_FLAGS[selected.mode] ?? {},
      onEvent: (ev) => {
        if (ev.type === "message" || ev.type === "response") {
          accumulated += ev.content;
          setReplayOut(accumulated);
        }
      },
      onDone: async () => {
        setReplaying(false);
        if (resultId) {
          await bridge.evals.updateResult(resultId, {
            endedAt:   new Date().toISOString(),
            latencyMs: Date.now() - t0,
            output:    accumulated,
          });
          await loadResults(selected.id);
        }
      },
      onError: (err) => {
        setReplaying(false);
        setReplayOut(`Error: ${err.message}`);
      },
    });
    return stop;
  }, [selected, replaying, bridge, selectedModel, loadResults]);

  const handleScore = async (resultId: string, score: number) => {
    if (!bridge || !selectedId) return;
    await bridge.evals.updateResult(resultId, { score });
    await loadResults(selectedId);
  };

  if (!bridge) {
    return (
      <div className="flex-1 flex items-center justify-center text-muted text-sm">
        Eval Bench only available inside Memex Desktop.
      </div>
    );
  }

  return (
    <div className="flex flex-1 min-h-0">
      {/* ── Case list ── */}
      <aside className="w-56 flex-shrink-0 border-r border-border/60 flex flex-col">
        <div className="px-3 py-2.5 border-b border-border/40 flex items-center justify-between">
          <span className="text-xs font-semibold text-muted uppercase tracking-wide">Eval Cases</span>
          <button
            onClick={() => { setSelectedId(null); setEditing({ ...EMPTY }); }}
            className="text-accent text-xs hover:text-accent/80"
          >+ New</button>
        </div>
        <div className="flex-1 overflow-y-auto py-1">
          {cases.length === 0 && (
            <p className="px-3 py-4 text-xs text-muted text-center">No evals yet</p>
          )}
          {cases.map((c) => (
            <button
              key={c.id}
              onClick={() => { setSelectedId(c.id); setEditing(null); }}
              className={`w-full text-left px-3 py-2 transition-colors
                ${selectedId === c.id ? "bg-accent/10 text-text" : "text-muted hover:text-text hover:bg-surface2/40"}`}
            >
              <div className="text-xs font-medium truncate">{c.name || "Untitled"}</div>
              <div className="text-[10px] opacity-60 truncate">{c.mode} · {c.model}</div>
            </button>
          ))}
        </div>
      </aside>

      {/* ── Main area ── */}
      <main className="flex flex-col flex-1 min-w-0 overflow-y-auto px-6 py-5 space-y-5">

        {/* Editor mode */}
        {editing && (
          <div className="space-y-4 max-w-2xl">
            <h2 className="text-sm font-semibold text-text">{editing.id ? "Edit Eval" : "New Eval"}</h2>
            <Field label="Name">
              <TextInput value={editing.name ?? ""} onChange={(v) => setEditing({ ...editing, name: v })} placeholder="My eval" />
            </Field>
            <Field label="Input prompt">
              <TextArea value={editing.input ?? ""} onChange={(v) => setEditing({ ...editing, input: v })}
                placeholder="Summarize the following article…" rows={4} />
            </Field>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Mode">
                <select
                  value={editing.mode ?? "chat"}
                  onChange={(e) => setEditing({ ...editing, mode: e.target.value as MemexMode })}
                  className="w-full px-3 py-1.5 rounded-lg bg-surface2 border border-border/60 text-sm text-text focus:outline-none"
                >
                  {MODES.map((m) => <option key={m} value={m}>{MODE_LABELS[m]}</option>)}
                </select>
              </Field>
              <Field label="Model">
                <TextInput value={editing.model ?? ""} onChange={(v) => setEditing({ ...editing, model: v })} placeholder="qwen3.6:27b" mono />
              </Field>
            </div>
            <Field label="Expected notes">
              <TextArea value={editing.expectedNotes ?? ""} onChange={(v) => setEditing({ ...editing, expectedNotes: v })}
                placeholder="Should mention X, avoid Y…" rows={2} />
            </Field>
            <Field label="Rubric">
              <TextArea value={editing.rubric ?? ""} onChange={(v) => setEditing({ ...editing, rubric: v })}
                placeholder="1=fails, 3=partial, 5=perfect…" rows={2} />
            </Field>
            <Field label="Workspace root (optional)">
              <TextInput value={editing.workspaceRoot ?? ""} onChange={(v) => setEditing({ ...editing, workspaceRoot: v })}
                placeholder="/path/to/workspace" mono />
            </Field>
            <div className="flex gap-2 pt-1">
              <button onClick={handleSave}
                className="px-4 py-1.5 rounded-lg bg-accent text-white text-sm hover:bg-accent/80">
                Save
              </button>
              <button onClick={() => setEditing(null)}
                className="px-4 py-1.5 rounded-lg bg-surface2 border border-border/60 text-sm hover:bg-surface2/80">
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Selected case view */}
        {selected && !editing && (
          <div className="space-y-5 max-w-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-base font-semibold text-text">{selected.name || "Untitled"}</h2>
                <p className="text-xs text-muted mt-0.5">{selected.mode} · {selected.model}</p>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => setEditing({ ...selected })}
                  className="text-xs px-3 py-1 rounded-lg border border-border/60 text-muted hover:text-text"
                >Edit</button>
                <button
                  onClick={() => handleDelete(selected.id)}
                  className="text-xs px-3 py-1 rounded-lg border border-red-500/30 text-red-400 hover:text-red-300"
                >Delete</button>
                <button
                  onClick={handleReplay}
                  disabled={replaying}
                  className="text-xs px-3 py-1.5 rounded-lg bg-accent text-white hover:bg-accent/80 disabled:opacity-50"
                >
                  {replaying ? "Running…" : "▶ Replay"}
                </button>
              </div>
            </div>

            <div className="space-y-1">
              <p className="text-[11px] text-muted uppercase tracking-wide">Input</p>
              <pre className="text-sm text-text/90 font-mono whitespace-pre-wrap bg-surface2/40 rounded-lg px-3 py-2 border border-border/40">
                {selected.input}
              </pre>
            </div>

            {selected.expectedNotes && (
              <div className="space-y-1">
                <p className="text-[11px] text-muted uppercase tracking-wide">Expected</p>
                <p className="text-sm text-text/80">{selected.expectedNotes}</p>
              </div>
            )}

            {selected.rubric && (
              <div className="space-y-1">
                <p className="text-[11px] text-muted uppercase tracking-wide">Rubric</p>
                <p className="text-sm text-text/80">{selected.rubric}</p>
              </div>
            )}

            {/* Live output during replay */}
            {replayOut && (
              <div className="space-y-1">
                <p className="text-[11px] text-muted uppercase tracking-wide">
                  {replaying ? "Output (streaming…)" : "Latest output"}
                </p>
                <pre className="text-sm text-text/90 whitespace-pre-wrap bg-surface2/40 rounded-lg px-3 py-2 border border-border/40 max-h-64 overflow-y-auto">
                  {replayOut}
                </pre>
              </div>
            )}

            {/* Past results */}
            {results.length > 0 && (
              <div className="space-y-2">
                <p className="text-[11px] text-muted uppercase tracking-wide">Past results ({results.length})</p>
                {results.map((r) => (
                  <div key={r.id} className="border border-border/40 rounded-xl p-3 space-y-2">
                    <div className="flex items-center gap-3">
                      <span className="text-[10px] text-muted">{new Date(r.startedAt).toLocaleString()}</span>
                      {r.latencyMs && (
                        <span className="text-[10px] text-muted">{(r.latencyMs / 1000).toFixed(1)}s</span>
                      )}
                      <ScorePips score={r.score} onChange={(s) => handleScore(r.id, s)} />
                    </div>
                    <pre className="text-xs text-text/70 whitespace-pre-wrap max-h-32 overflow-y-auto">
                      {r.output.slice(0, 400)}{r.output.length > 400 ? "…" : ""}
                    </pre>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Empty state */}
        {!selected && !editing && (
          <div className="flex-1 flex flex-col items-center justify-center text-center select-none">
            <div className="text-4xl mb-4 text-accent/40">⚗</div>
            <p className="text-sm text-muted">Select an eval case or create a new one</p>
          </div>
        )}
      </main>
    </div>
  );
}
