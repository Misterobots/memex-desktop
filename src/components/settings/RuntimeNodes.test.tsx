// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { RuntimeNodes } from "./RuntimeNodes";
import type { RuntimeTopology } from "../../lib/desktop";

/**
 * D5's honesty properties, checked where a user would actually misread them.
 *
 * The runtime answers with `vram_mb: null` today, so the two failure modes this
 * screen can have are inventing a capacity and mistaking an unread host list for
 * an empty one. Both are asserted here rather than assumed from the module tests.
 */
const TOPOLOGY: RuntimeTopology = {
  reason: null,
  checkedAt: "2026-09-26T00:00:00.000Z",
  nodes: [
    {
      name: "Lovelace", host: "http://ollama:11434", healthy: true, vramMb: null, vramSource: "unknown",
      loadedModels: [], availableModels: ["qwen3:8b", "qwen3:14b", "qwen3-coder:30b"],
    },
    {
      name: "Turing", host: "http://192.168.2.103:11434", healthy: true, vramMb: 8192, vramSource: "declared",
      loadedModels: ["qwen3:8b"], availableModels: ["phi4-mini:latest"],
    },
  ],
};

function stubBridge(runtime: unknown) {
  window.memex = { runtime } as unknown as typeof window.memex;
}

beforeEach(() => {
  cleanup();
  delete window.memex;
});

afterEach(() => {
  cleanup();
  delete window.memex;
  vi.restoreAllMocks();
});

describe("RuntimeNodes", () => {
  it("lists each reported host with what it holds", async () => {
    const nodes = vi.fn().mockResolvedValue(TOPOLOGY);
    stubBridge({ nodes });
    render(<RuntimeNodes />);

    await waitFor(() => expect(screen.getByText("Lovelace")).toBeTruthy());
    expect(screen.getByText("Turing")).toBeTruthy();
    expect(screen.getByText("3 models available")).toBeTruthy();
    // Singular noun, and the loaded count on the same line — the count and its
    // noun must be one text node for either assertion to mean anything.
    expect(screen.getByText("1 model available · 1 loaded")).toBeTruthy();
  });

  it("says capacity unknown instead of turning a null into 0 GB", async () => {
    stubBridge({ nodes: async () => TOPOLOGY });
    render(<RuntimeNodes />);
    await waitFor(() => expect(screen.getByText("Lovelace")).toBeTruthy());

    expect(screen.getByText("capacity unknown")).toBeTruthy();
    expect(screen.getByText("8 GB")).toBeTruthy();
    expect(screen.queryByText(/0 GB/)).toBeNull();
  });

  it("shows the runtime's own reason when the report could not be read", async () => {
    const unread: RuntimeTopology = {
      nodes: [], checkedAt: "2026-09-26T00:00:00.000Z",
      reason: "Could not read the runtime's node report: connect ECONNREFUSED",
    };
    stubBridge({ nodes: async () => unread });
    render(<RuntimeNodes />);

    const notice = await waitFor(() => screen.getByText(/ECONNREFUSED/));
    expect(notice.textContent).toMatch(/not evidence that a model is missing/);
    // An unread topology must not render as "no hosts" or "0 models".
    expect(screen.queryByText(/models available/)).toBeNull();
  });

  it("degrades to a stated failure when the preload has no such channel", async () => {
    stubBridge(undefined);
    render(<RuntimeNodes />);
    const notice = await waitFor(() => screen.getByText(/could not be asked/i));
    expect(notice.textContent).toMatch(/Role assignment stays available/);
  });

  it("re-reads on demand", async () => {
    const nodes = vi.fn().mockResolvedValue(TOPOLOGY);
    stubBridge({ nodes });
    render(<RuntimeNodes />);
    await waitFor(() => expect(nodes).toHaveBeenCalledTimes(1));

    const button = await screen.findByRole("button", { name: /re-read/i });
    button.click();
    await waitFor(() => expect(nodes).toHaveBeenCalledTimes(2));
  });
});
