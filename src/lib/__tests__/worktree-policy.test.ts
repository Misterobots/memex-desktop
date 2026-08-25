import { describe, expect, it } from "vitest";
import { safeWorktreeSlug } from "../worktree-policy";

describe("worktree naming", () => {
  it("turns labels into safe bounded path segments", () => {
    expect(safeWorktreeSlug("Fix auth / login!!!")).toBe("fix-auth-login");
    expect(safeWorktreeSlug("../../")).toBe("task");
    expect(safeWorktreeSlug("A".repeat(100))).toHaveLength(48);
  });
});
