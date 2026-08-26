import { describe, expect, it } from "vitest";
import { parseNotebook, serializeNotebook } from "../notebook";

describe("notebook round-trip", () => {
  it("normalizes line-array sources without dropping metadata or outputs", () => {
    const notebook = parseNotebook(JSON.stringify({
      cells: [{ cell_type: "code", source: ["print(1)\n"], outputs: [{ output_type: "stream", text: "1\n" }] }],
      metadata: { kernelspec: { name: "python3" } }, nbformat: 4, nbformat_minor: 5,
    }));
    expect(notebook.cells[0].source).toBe("print(1)\n");
    expect(notebook.metadata).toEqual({ kernelspec: { name: "python3" } });
    expect(JSON.parse(serializeNotebook(notebook)).cells[0].outputs).toHaveLength(1);
  });

  it("rejects malformed cell types", () => {
    expect(() => parseNotebook(JSON.stringify({ cells: [{ cell_type: "unknown", source: "" }] }))).toThrow("unsupported type");
  });
});
