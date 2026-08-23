import { useState } from "react";
import { useStore } from "../../lib/store";
import { ConversationPane } from "../chat/ConversationPane";
import { InputBar } from "../layout/InputBar";
import { SessionList } from "../sidebar/SessionList";
import { ScheduledTasks } from "../scheduled/ScheduledTasks";

export function GoalsView() {
  const { activeSession } = useStore();
  const [section, setSection] = useState<"work" | "schedule">("work");
  const [prefillText, setPrefillText] = useState("");
  const session = activeSession("goals");
  const empty = !session || session.messages.length === 0;

  return (
    <div className="flex flex-1 min-h-0">
      <aside className="w-[260px] flex-shrink-0 border-r border-border/60 bg-surface flex flex-col">
        <div className="px-3 pt-3 flex gap-1">
          <button onClick={() => setSection("work")} className={`flex-1 rounded-lg px-2 py-1.5 text-xs ${section === "work" ? "bg-surface2 text-text" : "text-muted hover:text-text"}`}>Threads</button>
          <button onClick={() => setSection("schedule")} className={`flex-1 rounded-lg px-2 py-1.5 text-xs ${section === "schedule" ? "bg-surface2 text-text" : "text-muted hover:text-text"}`}>Schedules</button>
        </div>
        {section === "work" ? <div className="flex-1 overflow-y-auto"><SessionList experience="goals" newLabel="New routine" /></div> : (
          <div className="px-4 py-4 text-xs text-muted leading-relaxed">Recurring and one-time work belongs to this Routines experience, alongside the threads that define it.</div>
        )}
      </aside>

      {section === "schedule" ? (
        <main className="flex-1 overflow-y-auto px-6 py-6">
          <div className="max-w-2xl mx-auto">
            <h1 className="text-lg font-medium text-text">Schedules</h1>
            <p className="text-sm text-muted mt-1 mb-5">Run a saved routine daily, on an interval, or once.</p>
            <ScheduledTasks />
          </div>
        </main>
      ) : (
        <main className="flex flex-col flex-1 min-w-0 min-h-0">
          {empty ? (
            <div className="flex-1 flex flex-col items-center justify-center px-6 select-none">
              <div className="max-w-conversation w-full text-center">
                <div className="text-5xl text-accent mb-5 opacity-90">◎</div>
                <h1 className="text-2xl text-text font-medium mb-2">Create or run a routine</h1>
                <p className="text-muted text-sm mb-8 max-w-md mx-auto">
                  Build a repeatable workflow, refine it in its own thread, then schedule it when it is ready.
                </p>
                <div className="flex flex-col gap-2 max-w-md mx-auto text-left">
                  {["Prepare a weekly project review", "Design a morning routine that sticks", "Track and summarize household maintenance"].map((ex) => (
                    <button
                      key={ex}
                      onClick={() => setPrefillText(ex)}
                      className="px-4 py-2.5 rounded-xl border border-border/60 bg-surface text-muted text-sm text-left hover:bg-surface2 hover:text-text transition-colors"
                    >
                      {ex}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          ) : <ConversationPane experience="goals" />}
          <InputBar experience="goals" lockMode="workshop" placeholder="Describe a repeatable workflow…" prefillText={prefillText} />
        </main>
      )}
    </div>
  );
}
