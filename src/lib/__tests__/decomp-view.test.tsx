// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { DecompView } from "../../components/views/DecompView";
import { DecompConnect } from "../../components/settings/DecompConnect";

const url = "http://127.0.0.1:6464/?k=abcDEF123_-xyz789";
const pane = () => ({
  open: vi.fn().mockResolvedValue({ url, title: "decomp.wtf", canGoBack: false, canGoForward: false, loading: false }),
  navigate: vi.fn(), setBounds: vi.fn().mockResolvedValue(undefined), hide: vi.fn().mockResolvedValue(undefined),
  back: vi.fn(), forward: vi.fn(), reload: vi.fn(), stop: vi.fn(), getState: vi.fn(), onState: vi.fn(() => () => {}),
});
const install = (decomp: Record<string, unknown>, browserPane = pane()) => {
  (window as unknown as { memex: unknown }).memex = { decomp, browserPane, shell: { openExternal: vi.fn() } };
  return browserPane;
};

beforeEach(() => {
  class RO { observe() {} disconnect() {} unobserve() {} }
  (globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = RO;
});
afterEach(() => { cleanup(); delete (window as unknown as { memex?: unknown }).memex; });

describe("DecompView", () => {
  it("opens the sandboxed pane on the loopback address once started", async () => {
    const browserPane = install({ start: vi.fn().mockResolvedValue({ status: "ready", url }), installPage: vi.fn() });
    render(<DecompView />);
    await waitFor(() => expect(browserPane.open).toHaveBeenCalledWith(url));
    expect(screen.queryByLabelText("Address")).toBeNull(); // the session key is not displayed
  });

  it("explains a missing install, links to the installer and can retry", async () => {
    const decomp = { start: vi.fn().mockResolvedValue({ status: "missing" }), installPage: vi.fn() };
    install(decomp);
    render(<DecompView />);
    fireEvent.click(await screen.findByText("Install decomp.wtf"));
    expect(decomp.installPage).toHaveBeenCalled();
    fireEvent.click(screen.getByText("Retry"));
    await waitFor(() => expect(decomp.start).toHaveBeenCalledTimes(2));
  });

  it("on Windows offers guided setup, lists what it does, and starts decomp.wtf when setup succeeds", async () => {
    const start = vi.fn().mockResolvedValueOnce({ status: "missing", canSetup: true }).mockResolvedValue({ status: "ready", url });
    const setup = vi.fn().mockResolvedValue({ status: "ok" });
    const browserPane = install({ start, setup, onSetupProgress: vi.fn(() => () => {}), installPage: vi.fn() });
    render(<DecompView />);
    fireEvent.click(await screen.findByText("Set up decomp.wtf"));
    expect(screen.getByText(/checked against Microsoft's SHA-256/)).toBeTruthy();
    expect(setup).not.toHaveBeenCalled(); // nothing runs before the confirmation
    fireEvent.click(screen.getAllByText("Set up decomp.wtf").slice(-1)[0]);
    await waitFor(() => expect(setup).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(browserPane.open).toHaveBeenCalledWith(url));
  });

  it("reports a restart requirement instead of claiming success", async () => {
    const start = vi.fn().mockResolvedValue({ status: "missing", canSetup: true });
    const setup = vi.fn().mockResolvedValue({ status: "restart-required", message: "Restart Windows to finish." });
    install({ start, setup, onSetupProgress: vi.fn(() => () => {}), installPage: vi.fn() });
    render(<DecompView />);
    fireEvent.click(await screen.findByText("Set up decomp.wtf"));
    fireEvent.click(screen.getAllByText("Set up decomp.wtf").slice(-1)[0]);
    expect(await screen.findByText("Restart Windows to finish.")).toBeTruthy();
  });

  it("shows start failures with Retry instead of a permanent spinner", async () => {
    install({ start: vi.fn().mockRejectedValue(new Error("x")), installPage: vi.fn() });
    render(<DecompView />);
    expect(await screen.findByText("Could not reach the desktop service.")).toBeTruthy();
    expect(screen.getByText("Retry")).toBeTruthy();
  });
});

describe("DecompConnect", () => {
  it("shows decomp connect output verbatim", async () => {
    const connect = vi.fn().mockResolvedValue({ status: "ok", output: "claude: connected" });
    install({ connect, installPage: vi.fn() });
    render(<DecompConnect />);
    fireEvent.click(screen.getByText("Connect agents"));
    expect(await screen.findByText("claude: connected")).toBeTruthy();
    expect(connect).toHaveBeenCalledWith(false);
  });

  it("explains when decomp.wtf is not installed", async () => {
    install({ connect: vi.fn().mockResolvedValue({ status: "missing", output: "" }), installPage: vi.fn() });
    render(<DecompConnect />);
    fireEvent.click(screen.getByText("Check status"));
    expect(await screen.findByText(/isn't installed/)).toBeTruthy();
  });
});
