import { describe, expect, it } from "vitest";
import { modelsForArena } from "../model-arena";

describe("modelsForArena", () => {
  it("keeps an ordered, unique entrant list for multi-model arena tasks", () => {
    expect(modelsForArena({
      model: "qwen3:14b",
      models: ["qwen3:14b", " gemma3:12b ", "qwen3:14b", ""],
    })).toEqual(["qwen3:14b", "gemma3:12b"]);
  });

  it("falls back to a legacy case's single model", () => {
    expect(modelsForArena({ model: "qwen3:14b" })).toEqual(["qwen3:14b"]);
  });
});
