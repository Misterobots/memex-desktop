import { describe, expect, it } from "vitest";
import { classifyHealthResponse } from "../health-status";

describe("native health classification", () => {
  it("reports a success response as connected", () => {
    expect(classifyHealthResponse(200)).toBe("connected");
  });

  it("keeps real outages as disconnected", () => {
    expect(classifyHealthResponse(503)).toBe("disconnected");
    expect(classifyHealthResponse(302)).toBe("disconnected");
    expect(classifyHealthResponse(401)).toBe("disconnected");
  });
});
