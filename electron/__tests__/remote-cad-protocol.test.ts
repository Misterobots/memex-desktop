import { beforeEach, describe, expect, it, vi } from "vitest";

const cadPrintMock = vi.hoisted(() => ({
  parts: vi.fn(), printerContext: vi.fn(), render: vi.fn(), exportBuildSet: vi.fn(),
  artifacts: vi.fn(), printStatus: vi.fn(), printJobs: vi.fn(), preflight: vi.fn(), requestApproval: vi.fn(),
}));

vi.mock("../../src/lib/cad-print-api", () => ({ cadPrint: cadPrintMock }));

import { handleRemoteCadRequest } from "../../src/lib/remote-cad-protocol";

const guest = (action: string, payload: Record<string, unknown> = {}) => ({
  type: "cad:request", request_id: "request-1", action, payload, _from: "guest",
});

describe("paired CAD protocol", () => {
  beforeEach(() => vi.resetAllMocks());

  it("rejects unsupported physical-print actions before they reach the bridge", async () => {
    const reply = await handleRemoteCadRequest(guest("print:start"));
    expect(reply).toMatchObject({ type: "cad:error", ok: false, error: "This CAD action is not available remotely." });
    expect(cadPrintMock.requestApproval).not.toHaveBeenCalled();
  });

  it("accepts only guest relay messages", async () => {
    const reply = await handleRemoteCadRequest({ ...guest("parts"), _from: "host" });
    expect(reply).toMatchObject({ type: "cad:error", ok: false, error: "Only the paired guest may issue CAD requests." });
    expect(cadPrintMock.parts).not.toHaveBeenCalled();
  });

  it("redacts local artifact paths from a remote render result", async () => {
    cadPrintMock.render.mockResolvedValue({ ok: true, artifact: { name: "deck.3mf", path: "C:\\private\\deck.3mf", bytes: 42, sha256: "abc" } });
    const reply = await handleRemoteCadRequest(guest("render", { part: "wheeled_b_deck", format: "3mf" }));
    expect(cadPrintMock.render).toHaveBeenCalledWith("wheeled_b_deck", "3mf");
    expect(reply).toMatchObject({ type: "cad:result", ok: true, action: "render" });
    const payload = (reply as any).payload;
    expect(payload.artifact).toMatchObject({ name: "deck.3mf", available_on_host: true });
    expect(payload.artifact.path).toBeUndefined();
  });

  it("does not disclose a host approval token to the mobile guest", async () => {
    cadPrintMock.requestApproval.mockResolvedValue({ ok: true, approval_token: "host-only", job_id: "deck" });
    const reply = await handleRemoteCadRequest(guest("request_approval", { job_id: "deck" }));
    expect(reply).toMatchObject({ type: "cad:result", ok: true, action: "request_approval" });
    const payload = (reply as any).payload;
    expect(payload.approval_token).toBeUndefined();
    expect(payload.requires_local_confirmation).toBe(true);
  });
});
