import { useCallback, useEffect, useState } from "react";
import { desktop, type RuntimeTopology } from "../../lib/desktop";
import { capacityLabel, type RuntimeNode } from "../../../electron/runtime-nodes";

type ReadState = "idle" | "loading" | "loaded" | "failed";

/** One string, one text node: split across JSX expressions the count and its
 * noun become separate nodes, which is both bad grammar and bad for anything
 * trying to read the line back. */
function availabilityLine(node: RuntimeNode): string {
  const count = node.availableModels.length;
  const base = `${count} model${count === 1 ? "" : "s"} available`;
  return node.loadedModels.length > 0 ? `${base} · ${node.loadedModels.length} loaded` : base;
}

/**
 * What the runtime reports about its own model hosts (D5).
 *
 * Read-only and never written to `config.json`: which hosts exist and which
 * models they hold is runtime state, not user intent. The app does not choose
 * placement either — the orchestrator does, from residency and its own host
 * policy — so this is a disclosure, and it says as much where it can be
 * misread as a control.
 *
 * `electron/runtime-nodes.ts` is imported for one pure formatter. That module is
 * Electron-free by design, which is what lets both processes share the rules for
 * "capacity unknown" instead of the renderer re-deriving them.
 */
export function RuntimeNodes() {
  const bridge = desktop();
  const [topology, setTopology] = useState<RuntimeTopology | null>(null);
  const [state, setState] = useState<ReadState>("idle");

  const read = useCallback(async () => {
    if (!bridge?.runtime?.nodes) {
      // An older preload without the channel is a failed read, not an empty one.
      setState("failed");
      setTopology(null);
      return;
    }
    setState("loading");
    try {
      const result = await bridge.runtime.nodes();
      setTopology(result);
      // Loaded only when hosts actually came back; otherwise the reason is the
      // honest state, and nothing below may imply the runtime has no models.
      setState(result.nodes.length > 0 ? "loaded" : "failed");
    } catch {
      setState("failed");
      setTopology(null);
    }
  }, [bridge]);

  useEffect(() => { void read(); }, [read]);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-muted">
          Reported by the runtime at send time. The orchestrator decides which host runs a model;
          this is what it says it can reach.
        </p>
        <button
          onClick={() => void read()}
          disabled={state === "loading"}
          className="shrink-0 text-xs text-accent hover:text-accent/80 disabled:text-muted"
        >{state === "loading" ? "Reading…" : "Re-read"}</button>
      </div>

      {state === "loaded" && topology ? (
        <ul className="space-y-1">
          {topology.nodes.map((node) => (
            <li
              key={`${node.name}-${node.host}`}
              className="px-3 py-2 rounded-lg border border-border/40 bg-surface2/40"
            >
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-text">{node.name}</span>
                <span
                  className={`text-[9px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded-full border ${
                    node.healthy ? "border-border/50 text-muted" : "border-yellow/30 text-yellow"
                  }`}
                >{node.healthy ? "healthy" : "unreachable"}</span>
                <span className="text-xs text-muted ml-auto">{capacityLabel(node)}</span>
              </div>
              <div className="text-xs text-muted truncate">{node.host || "no host reported"}</div>
              <div className="text-xs text-muted">{availabilityLine(node)}</div>
            </li>
          ))}
        </ul>
      ) : null}

      {state === "failed" && (
        <p className="px-3 py-2 rounded-lg border border-yellow/30 bg-yellow/5 text-xs text-yellow">
          {topology?.reason ?? "The runtime could not be asked."} Role assignment stays available — an
          unread host list is not evidence that a model is missing.
        </p>
      )}
    </div>
  );
}
