import { useEffect, useRef } from "react";
import { useStore } from "../../lib/store";
import { MessageBubble } from "./MessageBubble";
import type { AppTab, ChatDisplayMode, ExperienceId } from "../../types/memex";

const SUGGESTIONS: Array<{ tab: AppTab; label: string; description: string }> = [
  { tab: "dev",      label: "Build code",       description: "Open the Code workspace" },
  { tab: "research", label: "Research a topic", description: "Start a Research thread" },
  { tab: "design",   label: "Design an app", description: "Open the product Design workspace" },
  { tab: "art",      label: "Create media", description: "Open Art, 3D, and Print" },
  { tab: "goals",    label: "Create a routine", description: "Build a repeatable workflow" },
];

function WelcomeScreen() {
  const { setActiveTab } = useStore();
  return (
    <div className="flex-1 flex flex-col items-center justify-center px-6 select-none">
      <div className="max-w-conversation w-full text-center">
        <div className="w-10 h-1 rounded-full bg-accent/70 mb-5 mx-auto" aria-hidden="true" />
        <h1 className="text-2xl text-text font-medium mb-2">How can I help today?</h1>
        <p className="text-muted text-sm mb-8">
          Powered by the active Memex routing profile
        </p>
        <div className="grid grid-cols-2 gap-2.5 max-w-md mx-auto">
          {SUGGESTIONS.map((s) => (
            <button
              key={s.tab}
              onClick={() => setActiveTab(s.tab)}
              className="flex flex-col items-start gap-1 px-4 py-3 rounded-xl border border-border/60 bg-surface hover:bg-surface2 hover:border-accent/40 transition-colors text-left"
            >
              <span className="text-text text-sm font-medium">{s.label}</span>
              <span className="text-faint text-xs">{s.description}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

interface Props {
  experience?: ExperienceId;
  workspaceKey?: string;
  displayMode?: ChatDisplayMode;
}

export function ConversationPane({ experience = "chat", workspaceKey, displayMode = "normal" }: Props) {
  const { activeSession, streamingSessions } = useStore();
  const session = activeSession(experience, workspaceKey);
  const streaming = session ? !!streamingSessions[session.id] : false;
  const containerRef = useRef<HTMLDivElement>(null);
  const pinnedRef    = useRef(true);              // is the user parked at the bottom?
  const prevLenRef   = useRef(0);

  const messages = session?.messages ?? [];
  const last = messages[messages.length - 1];
  // Grows as the assistant streams (content chars + event count) so the view
  // follows the live response, not just new-message boundaries.
  const streamSignal = (last?.content?.length ?? 0) + (last?.events?.length ?? 0);

  // Track whether the user is near the bottom; if they scroll up to read, we
  // stop auto-following so we don't yank them back down.
  const handleScroll = () => {
    const el = containerRef.current;
    if (!el) return;
    pinnedRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
  };

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const isNewMessage = messages.length !== prevLenRef.current;
    prevLenRef.current = messages.length;
    // A new message (your send, or the assistant bubble) always pulls the view
    // down; streaming growth only follows when already pinned to the bottom.
    if (isNewMessage) pinnedRef.current = true;
    if (isNewMessage || pinnedRef.current) el.scrollTop = el.scrollHeight;
  }, [messages.length, streamSignal, streaming]);

  if (!session || messages.length === 0) {
    return <WelcomeScreen />;
  }

  return (
    <div ref={containerRef} onScroll={handleScroll} className="flex-1 overflow-y-auto">
      <div className="max-w-conversation mx-auto px-6 py-8 space-y-7">
        {messages.map((msg, i) => (
          <MessageBubble
            key={msg.id}
            message={msg}
            isActive={streaming && i === messages.length - 1 && msg.role === "assistant"}
            displayMode={displayMode}
          />
        ))}
        <div className="h-4" />
      </div>
    </div>
  );
}
