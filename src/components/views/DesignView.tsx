import { useState } from "react";
import { useStore } from "../../lib/store";
import { ConversationPane } from "../chat/ConversationPane";
import { InputBar } from "../layout/InputBar";
import { SessionList } from "../sidebar/SessionList";

/**
 * Product-design workspace: intentionally separate from Art/media generation.
 * It gives the existing design-mode agent a persistent product conversation
 * rather than mixing UI/site work with image prompts or fabrication controls.
 */
export function DesignView() {
  const { activeSession } = useStore();
  const [prefillText, setPrefillText] = useState("");
  const session = activeSession("product_design");
  const empty = !session || session.messages.length === 0;

  return (
    <div className="flex flex-1 min-h-0">
      <aside className="w-[260px] flex-shrink-0 border-r border-border/60 bg-surface overflow-y-auto">
        <SessionList experience="product_design" newLabel="New product design" />
      </aside>
      <main className="flex min-w-0 flex-1 flex-col min-h-0">
        {empty ? (
          <div className="flex flex-1 flex-col items-center justify-center px-6 text-center select-none">
            <div className="max-w-2xl">
              <div className="mb-5 text-5xl text-accent opacity-90">▣</div>
              <h1 className="text-2xl font-medium text-text">Product Design</h1>
              <p className="mx-auto mt-2 max-w-xl text-sm leading-relaxed text-muted">
                Shape an app, site, dashboard, or system with Memex. Start with the problem and audience; the conversation should move through requirements, structure, interactions, visual direction, and implementation-ready output.
              </p>
              <div className="mt-7 grid gap-2.5 text-left sm:grid-cols-2">
                {[
                  "Design a Friday companion dashboard for the robot build.",
                  "Turn this rough workflow into an interactive desktop app.",
                  "Create a responsive home-control site with clear states and safeguards.",
                  "Develop a visual system and component plan for a new product.",
                ].map((example) => (
                  <button
                    key={example}
                    onClick={() => setPrefillText(example)}
                    className="rounded-xl border border-border/60 bg-surface px-4 py-3 text-xs text-muted text-left hover:bg-surface2 hover:text-text transition-colors"
                  >
                    {example}
                  </button>
                ))}
              </div>
            </div>
          </div>
        ) : <ConversationPane experience="product_design" />}
        <InputBar experience="product_design" lockMode="design" placeholder="Describe the product, workflow, or interface you want to design…" prefillText={prefillText} />
      </main>
    </div>
  );
}
