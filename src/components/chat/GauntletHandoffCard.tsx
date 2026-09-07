import { useEffect, useState } from "react";
import { desktop, type GauntletHandoff } from "../../lib/desktop";
import { getAgentRuntime } from "../../lib/runtime-urls";

function resumeText(packet: GauntletHandoff): string {
  return [
    `Resume Gauntlet checkpoint ${packet.id}.`,
    `Original goal (immutable): ${packet.goal}`,
    `Quality bar (immutable): ${packet.qualityBar}`,
    `Required effort policy: model ${packet.effort.model}; output ${packet.effort.outputDetail}; reasoning summary ${packet.effort.reasoningSummary}; reasoning effort ${packet.effort.reasoningEffort}.`,
    `Role: ${packet.role}; phase: ${packet.phase}.`,
    `Next action: ${packet.nextAction}`,
    "Do not lower the quality bar, replace the goal, or mark this complete until an independent critic has compared the result against the bar and all deficits are repaired.",
  ].join("\n");
}

export function GauntletHandoffCard({ handoffId }: { handoffId: string }) {
  const [packet, setPacket] = useState<GauntletHandoff | null>(null);
  const [busy, setBusy] = useState(false);
  const [coordinatorNote, setCoordinatorNote] = useState("");
  useEffect(() => { void desktop()?.gauntlet?.get(handoffId).then(setPacket); }, [handoffId]);
  if (!packet) return null;

  const accept = async () => {
    setBusy(true);
    const updated = await desktop()?.gauntlet?.accept(packet.id, "desktop coordinator");
    if (updated) setPacket(updated);
    setBusy(false);
  };
  const resume = () => window.dispatchEvent(new CustomEvent("chat:prefill", { detail: resumeText(packet) }));
  const checkCoordinator = async () => {
    const bridge = desktop();
    if (!bridge?.api) {
      setCoordinatorNote("Coordinator status is available in the installed desktop app.");
      return;
    }
    setBusy(true);
    setCoordinatorNote("Checking the durable coordinator record…");
    try {
      const base = `${getAgentRuntime()}/v1/tasks/${encodeURIComponent(packet.id)}`;
      const [taskResponse, eventsResponse] = await Promise.all([
        bridge.api.request({ url: base, method: "GET" }),
        bridge.api.request({ url: `${base}/events`, method: "GET" }),
      ]);
      if (taskResponse.status === 404) {
        setCoordinatorNote("No coordinator record exists yet. Resume this checkpoint to start or reconnect it.");
        return;
      }
      if (taskResponse.status < 200 || taskResponse.status >= 300) throw new Error(`status ${taskResponse.status}`);
      const task = JSON.parse(taskResponse.body || "{}") as { run?: { status?: string; phase?: string } };
      const events = eventsResponse.status >= 200 && eventsResponse.status < 300
        ? JSON.parse(eventsResponse.body || "{}") as { events?: unknown[] } : { events: [] };
      const remoteStatus = task.run?.status || "unknown";
      const remotePhase = task.run?.phase || packet.phase;
      const phase = ["scope", "build", "critic", "compare", "repair", "verify", "final_review"].includes(remotePhase)
        ? remotePhase as GauntletHandoff["phase"] : packet.phase;
      setCoordinatorNote(`Coordinator is ${remoteStatus} in ${phase}; ${events.events?.length ?? 0} retained activity events.`);
      const status = remoteStatus === "completed" ? "completed"
        : remoteStatus === "cancelled" ? "cancelled"
        : remoteStatus === "failed" || remoteStatus === "denied" ? "blocked"
        : packet.status;
      const updated = await bridge.gauntlet?.patch(packet.id, { status, phase, nextAction: remoteStatus === "running" || remoteStatus === "queued"
        ? "The coordinator is still active remotely. Check again for progress or resume only after it becomes blocked."
        : packet.nextAction });
      if (updated) setPacket(updated);
    } catch (error) {
      setCoordinatorNote(`Coordinator status could not be read: ${error instanceof Error ? error.message : "unknown error"}. Your local checkpoint is preserved.`);
    } finally {
      setBusy(false);
    }
  };

  return <section className="rounded-lg border border-accent/35 bg-accent/5 px-3 py-2.5 text-xs" aria-label="Gauntlet checkpoint">
    <div className="flex items-center justify-between gap-3">
      <span className="font-medium text-text">Gauntlet checkpoint</span>
      <span className="rounded-full border border-border/60 px-1.5 py-0.5 text-[10px] text-muted">{packet.status} · {packet.phase}</span>
    </div>
    <p className="mt-1 text-muted line-clamp-2"><span className="text-text">Bar:</span> {packet.qualityBar}</p>
    <p className="mt-1 text-muted">{packet.effort.model} · {packet.effort.reasoningEffort} reasoning · {packet.effort.outputDetail} output</p>
    <p className="mt-1.5 text-muted">Next: {packet.nextAction}</p>
    {coordinatorNote && <p className="mt-1.5 text-muted" role="status">{coordinatorNote}</p>}
    <div className="mt-2 flex gap-2">
      {packet.status === "ready" && <button disabled={busy} onClick={() => void accept()} className="rounded border border-accent/50 px-2 py-1 text-accent hover:bg-accent/10 disabled:opacity-50">Accept ownership</button>}
      <button disabled={busy} onClick={() => void checkCoordinator()} className="rounded border border-border/60 px-2 py-1 text-text hover:bg-surface2 disabled:opacity-50">Check coordinator</button>
      <button onClick={resume} className="rounded border border-border/60 px-2 py-1 text-text hover:bg-surface2">Resume with preserved brief</button>
    </div>
  </section>;
}
