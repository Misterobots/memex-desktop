import { useStore } from "../../lib/store";
import { ConversationPane } from "../chat/ConversationPane";
import { InputBar } from "../layout/InputBar";

export function ArtView() {
  const { activeSession } = useStore();
  const session = activeSession();
  const empty = !session || session.messages.length === 0;

  return (
    <div className="flex flex-col flex-1 min-h-0">
      {empty ? (
        <div className="flex-1 flex flex-col items-center justify-center px-6 select-none">
          <div className="max-w-conversation w-full text-center">
            <div className="text-5xl text-accent mb-5 opacity-90">✦</div>
            <h1 className="text-2xl text-text font-medium mb-2">Art &amp; Design Studio</h1>
            <p className="text-muted text-sm mb-8 max-w-md mx-auto">
              Generate visuals and interactive mockups with local models.
              Describe what you want to see.
            </p>
            <div className="grid grid-cols-2 gap-2.5 max-w-md mx-auto text-left">
              {[
                "A cosmic library, oil painting style",
                "Landing page for a coffee subscription",
                "Album cover, synthwave aesthetic",
                "Dashboard UI for a smart home app",
              ].map((ex) => (
                <div key={ex} className="px-4 py-3 rounded-xl border border-border/60 bg-surface text-muted text-xs">
                  {ex}
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : (
        <ConversationPane />
      )}
      <InputBar lockMode="design" placeholder="Describe an image or interface to generate…" />
    </div>
  );
}
