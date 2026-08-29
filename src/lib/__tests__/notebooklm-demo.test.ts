import { describe, expect, it } from "vitest";
import { answerNotebookQuestion, DEMO_NOTEBOOK_SOURCES } from "../notebooklm-demo";

describe("NotebookLM experiment contract", () => {
  it("returns citations only for ready sources", () => {
    const answer = answerNotebookQuestion("What is the workflow?", DEMO_NOTEBOOK_SOURCES);
    expect(answer.citations).toHaveLength(2);
    expect(answer.citations.some((citation) => citation.sourceId === "source-web")).toBe(false);
  });
});
