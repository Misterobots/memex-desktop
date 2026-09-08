import { useCallback, useEffect, useState } from "react";
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
  const [requiresSignIn, setRequiresSignIn] = useState(false);
  useEffect(() => { void desktop()?.gauntlet?.get(handoffId).then(setPacket); }, [handoffId]);

  const checkCoordinator = useCallback(async (silent = false) => {
    if (!packet) return;
    const bridge = desktop();
    if (!bridge?.api) {
      setCoordinatorNote("Coordinator status is available in the installed desktop app.");
      return;
    }
    if (!silent) setBusy(true);
    setRequiresSignIn(false);
    if (!silent) setCoordinatorNote("Refreshing coordinator status…");
    try {
      const base = `${getAgentRuntime()}/v1/tasks/${encodeURIComponent(packet.id)}`;
      const [taskResponse, eventsResponse] = await Promise.all([
        bridge.api.request({ url: base, method: "GET" }),
        bridge.api.request({ url: `${base}/events`, method: "GET" }),
      ]);
      const taskBody = taskResponse.body || "";
      const taskContentType = taskResponse.headers["content-type"] || "";
      if (/text\/html/i.test(taskContentType) || /<html[\s>]/i.test(taskBody)) {
        setRequiresSignIn(true);
        setCoordinatorNote("Memex Anywhere returned its sign-in page, not a coordinator record. Sign in again, then retry this checkpoint.");
        return;
      }
      if (taskResponse.status === 404) {
        setCoordinatorNote("This runtime has no durable record for the checkpoint. It may predate coordinator persistence or be on another runtime; resume with the preserved brief after the target runtime is upgraded.");
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
        : remoteStatus === "needs_input" ? "needs_input"
        : packet.status;
      const nextAction = remoteStatus === "running" || remoteStatus === "queued"
        ? "Coordinator is active. Status refreshes automatically while it works."
        : remoteStatus === "needs_input"
          ? "Coordinator needs a project decision before it can create a builder handoff."
          : packet.nextAction;
      if (status !== packet.status || phase !== packet.phase || nextAction !== packet.nextAction) {
        const updated = await bridge.gauntlet?.patch(packet.id, { status, phase, nextAction });
        if (updated) setPacket(updated);
      }
    } catch (error) {
      setCoordinatorNote(`Coordinator status could not be read: ${error instanceof Error ? error.message : "unknown error"}. Your local checkpoint is preserved.`);
    } finally {
      if (!silent) setBusy(false);
    }
  }, [packet]);

  // Read the durable server record on arrival, then keep an active coordinator
  // fresh without asking the user to babysit a "Check" button.  A paused run
  // deliberately stops polling because its next action requires user input.
  useEffect(() => {
    if (!packet || packet.status !== "accepted") return;
    void checkCoordinator(true);
    const timer = window.setInterval(() => void checkCoordinator(true), 12_000);
    return () => window.clearInterval(timer);
  }, [packet?.id, packet?.status, checkCoordinator]);

  if (!packet) return null;
  const resume = () => window.dispatchEvent(new CustomEvent("chat:prefill", { detail: resumeText(packet) }));
  const signIn = async () => {
    setBusy(true);
    try {
      const complete = await desktop()?.remoteAuth.signIn();
      setRequiresSignIn(!complete);
      setCoordinatorNote(complete ? "Sign-in completed. Check coordinator again to read the durable run." : "Sign-in was not completed; the local checkpoint remains preserved.");
    } finally {
      setBusy(false);
    }
  };

  return <section className="rounded-lg border border-accent/35 bg-accent/5 px-3 py-2.5 text-xs" aria-label="Gauntlet checkpoint">
    <div className="flex items-center justify-between gap-3">
      <span className="font-medium text-text">Gauntlet run</span>
      <span className="rounded-full border border-border/60 px-1.5 py-0.5 text-[10px] text-muted">{packet.status} · {packet.phase}</span>
    </div>
    <p className="mt-1 text-muted line-clamp-2"><span className="text-text">Bar:</span> {packet.qualityBar}</p>
    <p className="mt-1 text-muted">{packet.effort.model} · {packet.effort.reasoningEffort} reasoning · {packet.effort.outputDetail} output</p>
    <p className="mt-1.5 text-muted">Next: {packet.nextAction}</p>
    {coordinatorNote && <p className="mt-1.5 text-muted" role="status">{coordinatorNote}</p>}
    <div className="mt-2 flex gap-2">
      <button disabled={busy} onClick={() => void checkCoordinator()} className="rounded border border-border/60 px-2 py-1 text-text hover:bg-surface2 disabled:opacity-50">Refresh now</button>
      {requiresSignIn && <button disabled={busy} onClick={() => void signIn()} className="rounded border border-accent/50 px-2 py-1 text-accent hover:bg-accent/10 disabled:opacity-50">Sign in to Memex</button>}
      <button onClick={resume} className="rounded border border-border/60 px-2 py-1 text-text hover:bg-surface2">Resume with preserved brief</button>
    </div>
  </section>;
}
