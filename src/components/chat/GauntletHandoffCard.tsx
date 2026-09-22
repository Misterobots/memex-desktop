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
      const task = JSON.parse(taskResponse.body || "{}") as { run?: { status?: string; phase?: string; error?: string } };
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
        : remoteStatus === "needs_input" && /runtime restarted/i.test(task.run?.error || "")
          ? "The runtime restarted. Resume from this preserved Gauntlet checkpoint; its goal, bar, effort policy, and prior critic evidence stay intact."
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

  return <section className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 border-t border-border/40 pt-2 text-xs text-muted" aria-label="Gauntlet checkpoint">
    <span className="font-medium text-text">Gauntlet</span>
    <span aria-label={`Gauntlet status: ${packet.status}, ${packet.phase}`}>{packet.status} · {packet.phase}</span>
    <button
      type="button"
      disabled={busy}
      onClick={() => void checkCoordinator()}
      title="Refresh coordinator status"
      aria-label="Refresh coordinator status"
      className="inline-flex h-5 w-5 items-center justify-center rounded text-muted hover:bg-surface2 hover:text-text disabled:opacity-50"
    >
      <svg viewBox="0 0 16 16" aria-hidden="true" className={busy ? "h-3.5 w-3.5 animate-spin" : "h-3.5 w-3.5"} fill="none" stroke="currentColor" strokeWidth="1.5">
        <path d="M13 4.5V1.8m0 0h-2.7M13 1.8A5.8 5.8 0 1 0 13.6 9" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </button>
    {(packet.status === "blocked" || packet.status === "cancelled" || packet.status === "needs_input") && <button onClick={resume} className="text-accent hover:underline">Resume preserved Gauntlet</button>}
    {requiresSignIn && <button disabled={busy} onClick={() => void signIn()} className="text-accent hover:underline disabled:opacity-50">Sign in to Memex</button>}
    {packet.status === "cancelled" && <button onClick={() => window.dispatchEvent(new CustomEvent("chat:prefill", { detail: "Start fresh: " }))} className="hover:text-text">Start fresh</button>}
    {coordinatorNote && <span className="basis-full text-[11px] text-muted" role="status">{coordinatorNote}</span>}
  </section>;
}
