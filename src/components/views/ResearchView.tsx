import { useStore } from "../../lib/store";
import { ConversationPane } from "../chat/ConversationPane";
import { InputBar } from "../layout/InputBar";
import { SessionList } from "../sidebar/SessionList";

export function ResearchView() {
  const { activeSession } = useStore();
  const session = activeSession("research");
  const empty = !session || session.messages.length === 0;

  return (
    <div className="flex flex-1 min-h-0">
      <aside className="w-[260px] flex-shrink-0 border-r border-border/60 bg-surface overflow-y-auto">
        <SessionList experience="research" newLabel="New research" />
      </aside>
      <main className="flex flex-col flex-1 min-w-0 min-h-0">
        {empty ? (
          <div className="flex-1 flex flex-col items-center justify-center px-6 select-none">
            <div className="max-w-conversation w-full text-center">
              <div className="text-5xl text-accent mb-5 opacity-90">⌕</div>
              <h1 className="text-2xl text-text font-medium mb-2">Research workspace</h1>
              <p className="text-muted text-sm mb-8 max-w-md mx-auto">
                Investigate a question in a dedicated thread with source gathering, synthesis, and a durable research history.
              </p>
              <div className="flex flex-col gap-2 max-w-md mx-auto text-left">
                {["Compare three approaches with sources", "Investigate a technical decision", "Build a cited background brief"].map((example) => (
                  <div key={example} className="px-4 py-2.5 rounded-xl border border-border/60 bg-surface text-muted text-sm">{example}</div>
                ))}
              </div>
            </div>
          </div>
        ) : <ConversationPane experience="research" />}
        <InputBar experience="research" lockMode="research" placeholder="What would you like to investigate?" />
      </main>
    </div>
  );
}
