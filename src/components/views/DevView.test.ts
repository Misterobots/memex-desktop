import { describe, expect, it } from "vitest";
import { explorerWidthForPointer } from "./dev-layout";

describe("Code explorer resize contract", () => {
  it("uses the explorer origin rather than viewport origin", () => {
    expect(explorerWidthForPointer(520, 248, 1280)).toBe(272);
  });

  it("clamps to usable bounds when the pointer leaves the pane", () => {
    expect(explorerWidthForPointer(0, 248, 1280)).toBe(180);
    expect(explorerWidthForPointer(1200, 248, 1280)).toBe(420);
  });
});
