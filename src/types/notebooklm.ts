export type NotebookSourceKind = "pdf" | "web" | "text" | "notebook";

export interface NotebookSource {
  id: string;
  title: string;
  kind: NotebookSourceKind;
  status: "ready" | "processing" | "error";
  wordCount: number;
  excerpt: string;
}

export interface NotebookCitation {
  sourceId: string;
  label: string;
  quote: string;
}

export interface NotebookAnswer {
  text: string;
  citations: NotebookCitation[];
}
