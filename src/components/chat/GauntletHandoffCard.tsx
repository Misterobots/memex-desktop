import { useEffect, useState } from "react";
import { desktop, type GauntletHandoff } from "../../lib/desktop";

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
  useEffect(() => { void desktop()?.gauntlet?.get(handoffId).then(setPacket); }, [handoffId]);
  if (!packet) return null;

  const accept = async () => {
    setBusy(true);
    const updated = await desktop()?.gauntlet?.accept(packet.id, "desktop coordinator");
    if (updated) setPacket(updated);
    setBusy(false);
  };
  const resume = () => window.dispatchEvent(new CustomEvent("chat:prefill", { detail: resumeText(packet) }));

  return <section className="rounded-lg border border-accent/35 bg-accent/5 px-3 py-2.5 text-xs" aria-label="Gauntlet checkpoint">
    <div className="flex items-center justify-between gap-3">
      <span className="font-medium text-text">Gauntlet checkpoint</span>
      <span className="rounded-full border border-border/60 px-1.5 py-0.5 text-[10px] text-muted">{packet.status} · {packet.phase}</span>
    </div>
    <p className="mt-1 text-muted line-clamp-2"><span className="text-text">Bar:</span> {packet.qualityBar}</p>
    <p className="mt-1 text-muted">{packet.effort.model} · {packet.effort.reasoningEffort} reasoning · {packet.effort.outputDetail} output</p>
    <p className="mt-1.5 text-muted">Next: {packet.nextAction}</p>
    <div className="mt-2 flex gap-2">
      {packet.status === "ready" && <button disabled={busy} onClick={() => void accept()} className="rounded border border-accent/50 px-2 py-1 text-accent hover:bg-accent/10 disabled:opacity-50">Accept ownership</button>}
      <button onClick={resume} className="rounded border border-border/60 px-2 py-1 text-text hover:bg-surface2">Resume with preserved brief</button>
    </div>
  </section>;
}
