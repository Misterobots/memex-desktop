import { describe, expect, it } from "vitest";
import { heroStateForWorker } from "../hero-state";

describe("hero worker state contract", () => {
  it("maps lifecycle states to badge animation states", () => {
    expect(heroStateForWorker("queued")).toBe("created");
    expect(heroStateForWorker("running")).toBe("working");
    expect(heroStateForWorker("reviewing")).toBe("review");
    expect(heroStateForWorker("needs_input")).toBe("waiting");
    expect(heroStateForWorker("completed")).toBe("complete");
    expect(heroStateForWorker("failed")).toBe("failed");
  });

  it("uses the phase as a review hint when status is generic", () => {
    expect(heroStateForWorker("running", "evidence verification")).toBe("review");
    expect(heroStateForWorker(undefined)).toBe("working");
  });
});
