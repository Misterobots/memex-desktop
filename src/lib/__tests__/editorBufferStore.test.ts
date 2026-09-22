import { afterEach, describe, expect, it } from "vitest";
import { clearEditorBuffers, getEditorBuffer, setEditorBuffer } from "../editorBufferStore";

describe("editor buffer store", () => {
  afterEach(() => clearEditorBuffers());

  it("keeps unsaved content and its on-disk baseline separate", () => {
    setEditorBuffer("C:/repo/src/app.ts", { content: "draft", original: "saved" });

    expect(getEditorBuffer("C:/repo/src/app.ts")).toEqual({ content: "draft", original: "saved" });
    expect(getEditorBuffer("C:/repo/src/other.ts")).toBeUndefined();
  });

  it("clears buffers between sessions", () => {
    setEditorBuffer("C:/repo/src/app.ts", { content: "draft", original: "saved" });
    clearEditorBuffers();

    expect(getEditorBuffer("C:/repo/src/app.ts")).toBeUndefined();
  });
});
