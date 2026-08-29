import { useMemo, useState } from "react";
import { answerNotebookQuestion, DEMO_NOTEBOOK_SOURCES } from "../../lib/notebooklm-demo";
import type { NotebookSourceKind } from "../../types/notebooklm";

const KIND_LABEL: Record<NotebookSourceKind, string> = { pdf: "PDF", web: "Web", text: "Text", notebook: "Notebook" };

export function NotebookLMLab() {
  const [sources, setSources] = useState(DEMO_NOTEBOOK_SOURCES);
  const [selectedId, setSelectedId] = useState(sources[0].id);
  const [question, setQuestion] = useState("How do these sources describe a safe, inspectable workflow?");
  const [submitted, setSubmitted] = useState(question);
  const answer = useMemo(() => answerNotebookQuestion(submitted, sources), [submitted, sources]);
  const selected = sources.find((source) => source.id === selectedId) ?? sources[0];

  const addDemoSource = () => {
    const id = `source-note-${sources.length + 1}`;
    setSources((current) => [...current, { id, title: `New source ${current.length - 3}`, kind: "text", status: "ready", wordCount: 320, excerpt: "A newly added source is ready for grounded notebook questions." }]);
    setSelectedId(id);
  };

  return (
    <main className="notebook-lab min-h-screen overflow-y-auto bg-canvas p-6 text-text md:p-10">
      <div className="mx-auto max-w-6xl">
        <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="text-[11px] uppercase tracking-[0.24em] text-accent2">Experimental surface</div>
            <h1 className="mt-2 text-3xl font-medium">NotebookLM workspace</h1>
            <p className="mt-2 max-w-2xl text-sm text-muted">A standalone operability lab for source-grounded answers, citations, and notebook source management.</p>
          </div>
          <div className="rounded-lg border border-border/60 bg-surface px-3 py-2 text-right text-[11px] text-muted"><div className="font-mono text-text">?experimental=notebooklm</div><div>renderer-only lab</div></div>
        </div>

        <div className="grid gap-5 lg:grid-cols-[260px_minmax(0,1fr)]">
          <aside className="rounded-xl border border-border/60 bg-surface p-3">
            <div className="mb-3 flex items-center justify-between"><span className="text-[11px] uppercase tracking-wide text-faint">Sources</span><button type="button" onClick={addDemoSource} className="rounded-md border border-border/60 px-2 py-1 text-[10px] text-accent hover:bg-surface2">Add</button></div>
            <div className="space-y-1.5">
              {sources.map((source) => <button key={source.id} type="button" onClick={() => setSelectedId(source.id)} className={`w-full rounded-lg border px-2.5 py-2 text-left transition-colors ${source.id === selected.id ? "border-accent2/60 bg-accent2/10" : "border-transparent hover:border-border/60 hover:bg-surface2"}`}><div className="flex items-center gap-2"><span className="truncate text-xs text-text">{source.title}</span><span className={`ml-auto text-[9px] ${source.status === "ready" ? "text-green" : source.status === "processing" ? "text-yellow" : "text-red"}`}>{source.status}</span></div><div className="mt-1 text-[10px] text-muted">{KIND_LABEL[source.kind]} · {source.wordCount.toLocaleString()} words</div></button>)}
            </div>
          </aside>

          <section className="min-w-0 rounded-xl border border-border/60 bg-surface p-5">
            <div className="border-b border-border/60 pb-4"><div className="text-[11px] uppercase tracking-wide text-faint">Selected source</div><h2 className="mt-1 text-lg font-medium">{selected.title}</h2><p className="mt-2 text-sm leading-6 text-muted">{selected.excerpt}</p></div>
            <div className="py-5"><div className="mb-3 text-[11px] uppercase tracking-wide text-faint">Ask your notebook</div><textarea value={question} onChange={(event) => setQuestion(event.target.value)} rows={3} className="w-full resize-y rounded-lg border border-border/60 bg-canvas p-3 text-sm text-text outline-none focus:border-accent2/70" /><button type="button" onClick={() => setSubmitted(question)} className="mt-3 rounded-lg bg-accent2 px-3 py-2 text-xs font-medium text-white hover:opacity-90">Ask grounded question</button></div>
            <div className="rounded-lg border border-border/60 bg-canvas p-4"><div className="mb-2 flex items-center justify-between"><span className="text-[11px] uppercase tracking-wide text-accent2">Grounded answer</span><span className="text-[10px] text-muted">{answer.citations.length} citations</span></div><p className="text-sm leading-6 text-text">{answer.text}</p><div className="mt-4 space-y-2">{answer.citations.map((citation) => <button key={citation.sourceId} type="button" onClick={() => setSelectedId(citation.sourceId)} className="block w-full rounded-md border border-accent2/20 bg-accent2/5 p-2.5 text-left text-xs hover:border-accent2/60"><div className="font-medium text-accent2">{citation.label}</div><div className="mt-1 text-muted">{citation.quote}</div></button>)}</div></div>
          </section>
        </div>
      </div>
    </main>
  );
}
