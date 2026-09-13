import { describe, expect, it } from "vitest";
import { composerClearanceForViewport } from "./pioneers-layout";

describe("AgentDock layout", () => {
  it("keeps the default clearance when the composer is at the viewport bottom", () => {
    expect(composerClearanceForViewport(900, 900)).toBe(112);
  });

  it("reserves the moved composer's full lower region", () => {
    // A bottom project pane can move the composer up without changing its own
    // height. The dock must clear the composer's top edge, not just its height.
    expect(composerClearanceForViewport(900, 700)).toBe(212);
  });

  it("handles missing or invalid measurements safely", () => {
    expect(composerClearanceForViewport(900, undefined)).toBe(112);
    expect(composerClearanceForViewport(Number.NaN, 700)).toBe(112);
  });
});
