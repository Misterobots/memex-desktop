import { useEffect, useRef } from "react";
import { useStore } from "../../lib/store";
import { MessageBubble } from "./MessageBubble";

export function ConversationPane() {
  const { activeSession, streaming } = useStore();
  const session = activeSession();
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [session?.messages.length, streaming]);

  if (!session || session.messages.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-muted gap-3 select-none">
        <div className="text-4xl opacity-20">◈</div>
        <p className="text-sm">Memex Desktop</p>
        <p className="text-xs opacity-60">Connected to local Ollama · Powered by Memex</p>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto px-4 py-4 space-y-6">
      <div className="max-w-4xl mx-auto space-y-6">
        {session.messages.map((msg) => (
          <MessageBubble key={msg.id} message={msg} />
        ))}
      </div>
      <div ref={bottomRef} />
    </div>
  );
}
