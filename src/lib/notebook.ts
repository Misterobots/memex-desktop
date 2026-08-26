export type NotebookCellType = "code" | "markdown" | "raw";

export interface NotebookCell {
  cell_type: NotebookCellType;
  source: string;
  metadata?: Record<string, unknown>;
  outputs?: unknown[];
  execution_count?: number | null;
  [key: string]: unknown;
}

export interface NotebookDocument {
  cells: NotebookCell[];
  metadata?: Record<string, unknown>;
  nbformat: number;
  nbformat_minor: number;
  [key: string]: unknown;
}

function sourceText(source: unknown): string {
  if (typeof source === "string") return source;
  if (Array.isArray(source) && source.every((line) => typeof line === "string")) return source.join("");
  return "";
}

export function parseNotebook(raw: string): NotebookDocument {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("Notebook is not valid JSON");
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Notebook must contain a JSON object");
  }
  const document = parsed as Record<string, unknown>;
  if (!Array.isArray(document.cells)) throw new Error("Notebook has no cells array");

  const cells = document.cells.map((rawCell, index) => {
    if (!rawCell || typeof rawCell !== "object" || Array.isArray(rawCell)) {
      throw new Error(`Notebook cell ${index + 1} is invalid`);
    }
    const cell = { ...(rawCell as Record<string, unknown>) };
    const cellType = cell.cell_type;
    if (cellType !== "code" && cellType !== "markdown" && cellType !== "raw") {
      throw new Error(`Notebook cell ${index + 1} has an unsupported type`);
    }
    return { ...cell, cell_type: cellType, source: sourceText(cell.source) } as NotebookCell;
  });

  return {
    ...document,
    cells,
    nbformat: typeof document.nbformat === "number" ? document.nbformat : 4,
    nbformat_minor: typeof document.nbformat_minor === "number" ? document.nbformat_minor : 5,
  } as NotebookDocument;
}

export function serializeNotebook(document: NotebookDocument): string {
  return `${JSON.stringify(document, null, 1)}\n`;
}
