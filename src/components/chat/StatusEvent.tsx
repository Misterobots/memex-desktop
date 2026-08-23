import type { MessageEvent } from "../../types/memex";

interface Props { event: MessageEvent; }

const TYPE_STYLE: Record<string, string> = {
  status: "border-accent/40 text-accent",
  thought: "border-border/50 text-muted",
  log: "border-border/40 text-muted/70",
};

/** Compact, text-first progress readout. Detailed raw events remain in Run Inspector. */
export function StatusEvent({ event }: Props) {
  return (
    <div className={`border-l-2 pl-2.5 text-xs leading-5 ${TYPE_STYLE[event.type] ?? "border-border/40 text-muted"}`}>
      {event.content}
    </div>
  );
}