import { useState } from "react";
import { useStore } from "../../lib/store";
import { ConversationPane } from "../chat/ConversationPane";
import { InputBar } from "../layout/InputBar";
import { SessionList } from "../sidebar/SessionList";
import { WorkspaceSidebar } from "../sidebar/WorkspaceSidebar";

/** Site-focused design space with its own conversations and design-mode routing. */
export function SitesView() {
  const { activeSession } = useStore();
  const [prefillText, setPrefillText] = useState("");
  const session = activeSession("sites");
  const empty = !session || session.messages.length === 0;

  return <div className="flex flex-1 min-h-0">
    <WorkspaceSidebar>
      <SessionList experience="sites" newLabel="New site" />
    </WorkspaceSidebar>
    <main className="flex min-w-0 flex-1 flex-col min-h-0">
      {empty ? <div className="flex flex-1 flex-col items-center justify-center px-6 text-center select-none">
        <div className="max-w-2xl"><div className="mb-5 text-5xl text-accent opacity-90">⌘</div><h1 className="text-2xl font-medium text-text">Sites</h1>
          <p className="mx-auto mt-2 max-w-xl text-sm leading-relaxed text-muted">Plan, design, and build a web experience with Memex—from audience and structure through pages, visual direction, and implementation.</p>
          <div className="mt-7 grid gap-2.5 text-left sm:grid-cols-2">{[
            "Create a polished landing page for Memex Desktop.",
            "Design a client portal with clear account and project states.",
            "Plan an internal operations dashboard for the home AI lab.",
            "Turn this product idea into a responsive marketing site.",
          ].map((example) => <button key={example} onClick={() => setPrefillText(example)} className="rounded-xl border border-border/60 bg-surface px-4 py-3 text-xs text-muted text-left hover:bg-surface2 hover:text-text transition-colors">{example}</button>)}</div>
        </div>
      </div> : <ConversationPane experience="sites" />}
      <InputBar experience="sites" lockMode="design" placeholder="Describe the site you want to create…" prefillText={prefillText} />
    </main>
  </div>;
}
