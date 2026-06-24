import type { MessageEvent } from "../../types/memex";

interface Props { event: MessageEvent; }

const TYPE_STYLE: Record<string, string> = {
  status:  "text-accent",
  thought: "text-muted",
  log:     "text-muted opacity-60",
};

export function StatusEvent({ event }: Props) {
  return (
    <div className={`text-xs font-mono flex items-start gap-2 ${TYPE_STYLE[event.type] ?? "text-muted"}`}>
      <span className="opacity-40 mt-px">
        {event.type === "status" ? "›" : event.type === "thought" ? "→" : "·"}
      </span>
      <span>{event.content}</span>
    </div>
  );
}
