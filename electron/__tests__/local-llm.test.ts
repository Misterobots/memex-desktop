import { describe, expect, it, vi } from "vitest";

vi.mock("os", () => ({ totalmem: () => 32 * 1024 ** 3 }));
vi.mock("child_process", () => ({ execFile: vi.fn() }));
vi.mock("util", () => ({ promisify: () => async () => ({ stdout: "" }) }));
import { normalizeLocalEndpoint, recommendLocalModels } from "../local-llm";

describe("local LLM setup", () => {
  it("recommends a capable model for a 16 GB local GPU", () => {
    expect(recommendLocalModels([{ name: "RTX", vramGb: 16 }], 32)[0]?.model).toBe("qwen3:14b");
  });
  it("recommends a small model when local hardware is constrained", () => {
    expect(recommendLocalModels([], 16)[0]?.model).toBe("gemma4:e4b");
  });
  it("normalizes user-provided local service endpoints", () => {
    expect(normalizeLocalEndpoint("http://localhost:11434/api/tags")).toBe("http://localhost:11434");
    expect(() => normalizeLocalEndpoint("file:///etc/passwd")).toThrow("http or https");
  });
});
