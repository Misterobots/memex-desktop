import { describe, expect, it } from "vitest";
import { classifyHealthResponse } from "../health-status";

describe("public health classification", () => {
  it("keeps a healthy authenticated API connected", () => {
    expect(classifyHealthResponse(200, "application/json", true)).toBe("connected");
  });

  it.each([301, 302, 401, 403])("reports public authentication challenges as sign-in required (%i)", (status) => {
    expect(classifyHealthResponse(status, null, true)).toBe("sign_in_required");
  });

  it("recognizes an SSO login document after an automatic redirect", () => {
    expect(classifyHealthResponse(200, "text/html; charset=utf-8", true)).toBe("sign_in_required");
  });

  it("keeps real local and public outages distinct from authentication", () => {
    expect(classifyHealthResponse(503, "application/json", true)).toBe("disconnected");
    expect(classifyHealthResponse(302, null, false)).toBe("disconnected");
  });
});
