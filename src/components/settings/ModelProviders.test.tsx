// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ModelProviders } from "./ModelProviders";
import type { ProviderCatalog } from "../../lib/desktop";

/**
 * D6's honesty properties, at the place a user would misread them.
 *
 * Two claims this screen can get wrong in a way no unit test on the reader would
 * catch: treating a refused connection list as "not connected" (the runtime would not
 * say — that is not an absence), and offering a gateway model whose id another
 * provider owns as if picking it sent the turn there.
 */
const CATALOG: ProviderCatalog = {
  reason: null,
  checkedAt: "2026-09-28T00:00:00.000Z",
  providers: [
    {
      id: "nvidia", label: "NVIDIA NIM", connected: true, connectedAt: "2026-09-20T00:00:00Z",
      live: false, catalog: null,
      models: [{ id: "mistralai/mistral-nemotron", label: "Mistral Nemotron", context: 128000 }],
    },
    {
      id: "anthropic", label: "Anthropic (Claude)", connected: false, connectedAt: null,
      live: false, catalog: null,
      models: [{ id: "claude-opus-4-20250514", label: "Claude Opus 4", context: 200000 }],
    },
    {
      id: "openrouter", label: "OpenRouter", connected: null, connectedAt: null,
      live: true, catalog: { known: 497, stale: false, shadowed: 1, lastError: null },
      models: [
        { id: "meta-llama/llama-3.1-70b-instruct", label: "Llama 3.1 70B", context: 131072, routesHere: true },
        { id: "openai/gpt-4o", label: "GPT-4o", context: 128000, routesHere: false },
      ],
    },
  ],
};

function stubBridge(providers: unknown, config?: unknown) {
  window.memex = { providers, config } as unknown as typeof window.memex;
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

describe("ModelProviders", () => {
  it("lists each provider with the state the runtime actually reported", async () => {
    stubBridge({ catalog: async () => CATALOG });
    render(<ModelProviders />);

    await waitFor(() => expect(screen.getByText("NVIDIA NIM")).toBeTruthy());
    expect(screen.getByText("OpenRouter")).toBeTruthy();
    expect(screen.getByText("Connected")).toBeTruthy();
    expect(screen.getByText("Not connected")).toBeTruthy();
  });

  it("says connection unknown rather than not connected when the list was refused", async () => {
    stubBridge({ catalog: async () => CATALOG });
    render(<ModelProviders />);
    await waitFor(() => expect(screen.getByText("OpenRouter")).toBeTruthy());

    // Three providers, one connected and one refused: only two "Not connected"
    // badges may exist, or a 401 would read as an absence the app never observed.
    expect(screen.getAllByText("Not connected")).toHaveLength(1);
    expect(screen.getByText("connection unknown")).toBeTruthy();
  });

  it("marks a gateway model that another provider answers", async () => {
    stubBridge({ catalog: async () => CATALOG });
    render(<ModelProviders />);
    await waitFor(() => expect(screen.getByText("OpenRouter")).toBeTruthy());

    expect(screen.getByText("answered elsewhere")).toBeTruthy();
    expect(screen.getByText(/2 models · 1 answered elsewhere/)).toBeTruthy();
    // The unshadowed provider says nothing about routing.
    expect(screen.queryByText(/1 model ·/)).toBeNull();
  });

  it("sends the key to the bridge once, and does not echo it back", async () => {
    const connect = vi.fn().mockResolvedValue({ ok: true, detail: "openrouter connected." });
    stubBridge({ catalog: async () => CATALOG, connect });
    render(<ModelProviders />);
    await waitFor(() => expect(screen.getByText("OpenRouter")).toBeTruthy());

    // Two providers offer Connect (the connected one offers Disconnect); the second
    // is OpenRouter. A wrong index here fails the assertion below rather than passing
    // against the wrong row.
    fireEvent.click(screen.getAllByRole("button", { name: /^connect$/i })[1]);
    const input = await screen.findByLabelText("OpenRouter API key");
    expect(input.getAttribute("type")).toBe("password");
    fireEvent.change(input, { target: { value: "sk-or-secret-123" } });
    fireEvent.click(screen.getByRole("button", { name: /save key/i }));

    await waitFor(() => expect(connect).toHaveBeenCalledWith("openrouter", "sk-or-secret-123", ""));
    expect(await screen.findByText("openrouter connected.")).toBeTruthy();
    expect(document.body.textContent).not.toContain("sk-or-secret-123");
  });

  it("warns about cleartext only when the runtime is not on this machine", async () => {
    stubBridge(
      { catalog: async () => CATALOG },
      { getUrls: async () => ({ agentRuntime: "http://192.168.2.101:8008", mempalace: "", ollama: "" }) },
    );
    render(<ModelProviders />);
    await waitFor(() => expect(screen.getByText(/crosses the network in cleartext/)).toBeTruthy());
    cleanup();

    stubBridge(
      { catalog: async () => CATALOG },
      { getUrls: async () => ({ agentRuntime: "http://[::1]:8008", mempalace: "", ollama: "" }) },
    );
    render(<ModelProviders />);
    await waitFor(() => expect(screen.getByText("OpenRouter")).toBeTruthy());
    expect(screen.queryByText(/crosses the network in cleartext/)).toBeNull();
  });

  it("states a failure when the preload has no such channel", async () => {
    stubBridge(undefined);
    render(<ModelProviders />);
    const notice = await waitFor(() => screen.getByText(/cannot ask the runtime about providers/i));
    expect(notice.textContent).toMatch(/Provider assignment is unaffected/);
  });
});
