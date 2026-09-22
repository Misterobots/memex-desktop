import { describe, expect, it } from "vitest";
import { needsUnrealSetup } from "../capability-recovery";

describe("capability recovery", () => {
  it("recognizes an unavailable Unreal tooling response", () => {
    expect(needsUnrealSetup("The Unreal Engine command-line tools (ue/ue5) are not available in this sandbox environment.")).toBe(true);
  });
  it("does not offer Unreal setup for unrelated responses", () => {
    expect(needsUnrealSetup("The model finished the research task.")).toBe(false);
  });
});
