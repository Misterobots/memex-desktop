import { useStore } from "../../lib/store";
import { ConversationPane } from "../chat/ConversationPane";
import { InputBar } from "../layout/InputBar";

export function GoalsView() {
  const { activeSession } = useStore();
  const session = activeSession();
  const empty = !session || session.messages.length === 0;

  return (
    <div className="flex flex-col flex-1 min-h-0">
      {empty ? (
        <div className="flex-1 flex flex-col items-center justify-center px-6 select-none">
          <div className="max-w-conversation w-full text-center">
            <div className="text-5xl text-accent mb-5 opacity-90">◎</div>
            <h1 className="text-2xl text-text font-medium mb-2">Cowork on a goal</h1>
            <p className="text-muted text-sm mb-8 max-w-md mx-auto">
              Describe something you want to accomplish. Memex will ask clarifying
              questions, then shape it into a structured brief you can build from.
            </p>
            <div className="flex flex-col gap-2 max-w-md mx-auto text-left">
              {[
                "Plan a family trip to Japan in spring",
                "Design a morning routine that sticks",
                "Launch a newsletter for my woodworking hobby",
              ].map((ex) => (
                <div key={ex} className="px-4 py-2.5 rounded-xl border border-border/60 bg-surface text-muted text-sm">
                  {ex}
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : (
        <ConversationPane />
      )}
      <InputBar lockMode="workshop" placeholder="Describe a goal to cowork on…" />
    </div>
  );
}
