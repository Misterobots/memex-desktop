import { useState } from "react";
import { useStore } from "../../lib/store";
import { ConversationPane } from "../chat/ConversationPane";
import { InputBar } from "../layout/InputBar";
import { SessionList } from "../sidebar/SessionList";
import { CadWorkspacePanel } from "../dev/CadWorkspacePanel";
import { PrintWorkflowPanel } from "../dev/PrintWorkflowPanel";
import { FRIDAY_BODY_ROOT } from "../../lib/cad-print-api";

export function ArtView() {
  const { activeSession, setActiveTab, setCwd } = useStore();
  const [workspace, setWorkspace] = useState<"create" | "cad" | "print">("create");
  const [prefillText, setPrefillText] = useState("");
  const session = activeSession("design");
  const empty = !session || session.messages.length === 0;

  const tabClass = (id: typeof workspace) =>
    `rounded-md px-2.5 py-1 text-xs transition-colors ${workspace === id
      ? "bg-surface2 text-text"
      : "text-muted hover:bg-surface2 hover:text-text"}`;

  return (
    <div className="flex flex-1 min-h-0 flex-col">
      {/* Always keep the Art sub-navigation mounted. CAD and Print are
          destinations within Art, not modal views that replace the route. */}
      <div className="flex h-11 flex-shrink-0 items-center gap-1 border-b border-border/60 bg-surface px-4">
        <button onClick={() => setWorkspace("create")} className={tabClass("create")}>Create</button>
        <button onClick={() => setWorkspace("cad")} className={tabClass("cad")}>3D & CAD</button>
        <button onClick={() => setWorkspace("print")} className={tabClass("print")}>Print</button>
        <span className="ml-2 text-[11px] text-muted">
          {workspace === "cad" ? "Friday Body workspace" : workspace === "print" ? "Manufacturing handoff" : "Media generation"}
        </span>
      </div>

      {workspace === "cad" ? (
        <CadWorkspacePanel
          onOpenSource={() => { setCwd(FRIDAY_BODY_ROOT); setActiveTab("dev"); }}
          onGoToPrint={() => setWorkspace("print")}
        />
      ) : workspace === "print" ? (
        <PrintWorkflowPanel />
      ) : (
    <div className="flex flex-1 min-h-0">
      <aside className="w-[260px] flex-shrink-0 border-r border-border/60 bg-surface overflow-y-auto">
        <SessionList experience="design" newLabel="New design" />
      </aside>
      <main className="flex flex-col flex-1 min-w-0 min-h-0">
      {empty ? (
        <div className="flex-1 flex flex-col items-center justify-center px-6 select-none">
          <div className="max-w-conversation w-full text-center">
            <div className="text-5xl text-accent mb-5 opacity-90">✦</div>
            <h1 className="text-2xl text-text font-medium mb-2">Art & Media Studio</h1>
            <p className="text-muted text-sm mb-8 max-w-md mx-auto">
              Generate images, media concepts, and 3D ideas with your active Memex routing profile.
              Use 3D & CAD when the work should become a manufacturable model.
            </p>
            <div className="grid grid-cols-2 gap-2.5 max-w-md mx-auto text-left">
              {[
                "A cosmic library, oil painting style",
                "Product turntable render for a compact household robot",
                "Album cover, synthwave aesthetic",
                "Low-poly 3D character concept for a local AI assistant",
              ].map((ex) => (
                <button
                  key={ex}
                  onClick={() => setPrefillText(ex)}
                  className="px-4 py-3 rounded-xl border border-border/60 bg-surface text-muted text-xs text-left hover:bg-surface2 hover:text-text transition-colors"
                >
                  {ex}
                </button>
              ))}
            </div>
          </div>
        </div>
      ) : (
        <ConversationPane experience="design" />
      )}
      <InputBar experience="design" lockMode="design" placeholder="Describe an image, media concept, or 3D idea to generate…" prefillText={prefillText} />
      </main>
    </div>
      )}
    </div>
  );
}
