import { useEffect, useRef } from "react";
import { useStore } from "../../lib/store";
import { MessageBubble } from "./MessageBubble";
import { MODE_LABELS, type MemexMode } from "../../types/memex";

const SUGGESTIONS: Array<{ mode: MemexMode; label: string; prompt: string }> = [
  { mode: "swarm",    label: "Build something",   prompt: "Build " },
  { mode: "research", label: "Research a topic",  prompt: "Research " },
  { mode: "design",   label: "Design a UI",       prompt: "Design " },
  { mode: "think",    label: "Think through",     prompt: "Help me think through " },
];

function WelcomeScreen() {
  const { setMode } = useStore();
  return (
    <div className="flex-1 flex flex-col items-center justify-center px-6 select-none">
      <div className="max-w-conversation w-full text-center">
        <div className="text-5xl text-accent mb-5 opacity-90">◈</div>
        <h1 className="text-2xl text-text font-medium mb-2">How can I help today?</h1>
        <p className="text-muted text-sm mb-8">
          Powered by local models through Memex · No cloud, no limits
        </p>
        <div className="grid grid-cols-2 gap-2.5 max-w-md mx-auto">
          {SUGGESTIONS.map((s) => (
            <button
              key={s.mode}
              onClick={() => setMode(s.mode)}
              className="flex flex-col items-start gap-1 px-4 py-3 rounded-xl border border-border/60 bg-surface hover:bg-surface2 hover:border-accent/40 transition-colors text-left"
            >
              <span className="text-text text-sm font-medium">{s.label}</span>
              <span className="text-faint text-xs">{MODE_LABELS[s.mode]} mode</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

export function ConversationPane() {
  const { activeSession, streaming } = useStore();
  const session = activeSession();
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [session?.messages.length, streaming]);

  if (!session || session.messages.length === 0) {
    return <WelcomeScreen />;
  }

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-conversation mx-auto px-6 py-8 space-y-7">
        {session.messages.map((msg) => (
          <MessageBubble key={msg.id} message={msg} />
        ))}
        <div ref={bottomRef} className="h-4" />
      </div>
    </div>
  );
}
