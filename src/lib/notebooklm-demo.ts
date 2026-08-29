import type { NotebookAnswer, NotebookSource } from "../types/notebooklm";

export const DEMO_NOTEBOOK_SOURCES: NotebookSource[] = [
  { id: "source-architecture", title: "Agent architecture notes", kind: "pdf", status: "ready", wordCount: 1840, excerpt: "The runtime separates orchestration, approval, and workspace execution into independently observable boundaries." },
  { id: "source-recovery", title: "Recovery design brief", kind: "text", status: "ready", wordCount: 920, excerpt: "A resumed session replays only registered capabilities and preserves owner and workspace scope." },
  { id: "source-notebook", title: "Notebook workflow.ipynb", kind: "notebook", status: "ready", wordCount: 640, excerpt: "Notebook cells combine narrative, executable code, outputs, and metadata in one reviewable document." },
  { id: "source-web", title: "Grounded research link", kind: "web", status: "processing", wordCount: 0, excerpt: "Fetching and indexing source content…" },
];

export function answerNotebookQuestion(question: string, sources: NotebookSource[]): NotebookAnswer {
  const active = sources.filter((source) => source.status === "ready");
  return {
    text: `Based on the indexed sources, ${question.trim() || "this notebook"} is best understood as a workflow that keeps evidence attached to the answer. The strongest common thread is explicit scope, inspectable intermediate work, and a clear path from source material to conclusion.`,
    citations: active.slice(0, 2).map((source, index) => ({
      sourceId: source.id,
      label: `[${index + 1}] ${source.title}`,
      quote: source.excerpt,
    })),
  };
}
