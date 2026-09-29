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
      live: false, catalog: null, selectedModels: [],
      models: [{ id: "mistralai/mistral-nemotron", label: "Mistral Nemotron", context: 128000 }],
    },
    {
      id: "anthropic", label: "Anthropic (Claude)", connected: false, connectedAt: null,
      live: false, catalog: null, selectedModels: [],
      models: [{ id: "claude-opus-4-20250514", label: "Claude Opus 4", context: 200000 }],
    },
    {
      id: "openrouter", label: "OpenRouter", connected: null, connectedAt: null,
      live: true, catalog: { known: 497, stale: false, shadowed: 1, lastError: null },
      selectedModels: [],
      models: [
        { id: "meta-llama/llama-3.1-70b-instruct", label: "Llama 3.1 70B", context: 131072, routesHere: true },
        { id: "openai/gpt-4o", label: "GPT-4o", context: 128000, routesHere: false },
      ],
    },
  ],
};

/** D7: the same gateway with a key connected, so the selection editor is live. One id
 * is chosen, one is not, and one belongs to another provider. */
const CONNECTED: ProviderCatalog = {
  reason: null,
  checkedAt: "2026-09-29T00:00:00.000Z",
  providers: [
    {
      id: "openrouter", label: "OpenRouter", connected: true, connectedAt: "2026-09-28T00:00:00Z",
      live: true, catalog: { known: 460, stale: false, shadowed: 1, lastError: null },
      selectedModels: ["meta-llama/llama-3.1-70b-instruct"],
      models: [
        { id: "meta-llama/llama-3.1-70b-instruct", label: "Llama 3.1 70B", context: 131072, routesHere: true },
        { id: "deepseek/deepseek-chat", label: "DeepSeek Chat", context: 64000, routesHere: true },
        { id: "openai/gpt-4o", label: "GPT-4o", context: 128000, routesHere: false },
      ],
    },
    {
      id: "nvidia", label: "NVIDIA NIM", connected: true, connectedAt: "2026-09-20T00:00:00Z",
      live: false, catalog: null, selectedModels: [],
      models: [{ id: "mistralai/mistral-nemotron", label: "Mistral Nemotron", context: 128000 }],
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

/**
 * D7: a gateway lists 460 models, so the key alone must not decide what the picker
 * offers. These cover the parts a user would otherwise read backwards — a saved
 * selection rendering as an empty offer, an id another provider owns being offered as a
 * choice that cannot take effect, and a refused write looking like an abandoned edit.
 */
describe("ModelProviders — which gateway models are offered", () => {
  it("renders the stored selection as checked and counts it", async () => {
    stubBridge({ catalog: async () => CONNECTED });
    render(<ModelProviders />);
    await waitFor(() => expect(screen.getByText("OpenRouter")).toBeTruthy());

    expect((screen.getByLabelText("meta-llama/llama-3.1-70b-instruct") as HTMLInputElement).checked).toBe(true);
    expect((screen.getByLabelText("deepseek/deepseek-chat") as HTMLInputElement).checked).toBe(false);
    expect(screen.getByText("1 of 3 offered")).toBeTruthy();
    expect(screen.getByText("1 selected")).toBeTruthy();
    // Nothing was edited, so there is nothing to send.
    expect((screen.getByRole("button", { name: /no changes/i }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("sends the whole list on save rather than only the change", async () => {
    const setSelection = vi.fn().mockResolvedValue({
      ok: true, detail: "openrouter: 2 models selected.",
      selected: ["deepseek/deepseek-chat", "meta-llama/llama-3.1-70b-instruct"],
    });
    const catalog = vi.fn(async () => CONNECTED);
    stubBridge({ catalog, setSelection });
    render(<ModelProviders />);
    await waitFor(() => expect(screen.getByText("OpenRouter")).toBeTruthy());

    fireEvent.click(screen.getByLabelText("deepseek/deepseek-chat"));
    expect(screen.getByText("2 selected")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /save selection/i }));

    // The pre-existing choice travels with the new one: the runtime replaces the whole
    // value, so a delta would have quietly dropped Llama.
    await waitFor(() => expect(setSelection).toHaveBeenCalledWith(
      "openrouter", ["meta-llama/llama-3.1-70b-instruct", "deepseek/deepseek-chat"],
    ));
    expect(await screen.findByText("openrouter: 2 models selected.")).toBeTruthy();
    expect(catalog.mock.calls.length).toBeGreaterThan(1); // re-read, so the row shows the runtime's answer
  });

  it("will not offer a model another provider already answers", async () => {
    const setSelection = vi.fn();
    stubBridge({ catalog: async () => CONNECTED, setSelection });
    render(<ModelProviders />);
    await waitFor(() => expect(screen.getByText("OpenRouter")).toBeTruthy());

    const shadowed = screen.getByLabelText("openai/gpt-4o") as HTMLInputElement;
    expect(shadowed.disabled).toBe(true);
    expect(shadowed.checked).toBe(false);
    // Listed and labelled, not removed: the row is where the user learns why picking
    // it elsewhere would not send the turn here.
    expect(screen.getByText("answered elsewhere")).toBeTruthy();
    fireEvent.click(shadowed);
    expect(screen.getByText("1 selected")).toBeTruthy();
    expect(setSelection).not.toHaveBeenCalled();
  });

  it("says a connected key offers nothing until models are chosen", async () => {
    const none: ProviderCatalog = {
      ...CONNECTED,
      providers: CONNECTED.providers.map((p) => ({ ...p, selectedModels: [] })),
    };
    stubBridge({ catalog: async () => none });
    render(<ModelProviders />);

    // The state right after connecting, stated as a choice rather than as a gap.
    await waitFor(() => expect(screen.getByText(/0 of 3 offered — select the models to use/)).toBeTruthy());
  });

  it("keeps the edit on screen when the runtime refuses the write", async () => {
    const setSelection = vi.fn().mockResolvedValue({
      ok: false, detail: "No openrouter key is connected, so there is nothing to select against.", selected: [],
    });
    stubBridge({ catalog: async () => CONNECTED, setSelection });
    render(<ModelProviders />);
    await waitFor(() => expect(screen.getByText("OpenRouter")).toBeTruthy());

    fireEvent.click(screen.getByLabelText("deepseek/deepseek-chat"));
    fireEvent.click(screen.getByRole("button", { name: /save selection/i }));

    expect(await screen.findByText(/nothing to select against/)).toBeTruthy();
    // A failed write that cleared the checkboxes would read as an edit the user undid.
    expect((screen.getByLabelText("deepseek/deepseek-chat") as HTMLInputElement).checked).toBe(true);
    expect(screen.getByRole("button", { name: /save selection/i })).toBeTruthy();
  });

  it("offers no selection for a curated provider", async () => {
    stubBridge({ catalog: async () => CONNECTED });
    render(<ModelProviders />);
    await waitFor(() => expect(screen.getByText("NVIDIA NIM")).toBeTruthy());

    // Three to eight models is already a menu; opt-in there would be a behaviour
    // change wearing a new control, so the row says what happens instead.
    expect(screen.queryByLabelText("mistralai/mistral-nemotron")).toBeNull();
    expect(screen.getByText(/All of these are offered while the key is connected/)).toBeTruthy();
  });

  it("says so when the build cannot save a selection", async () => {
    stubBridge({ catalog: async () => CONNECTED }); // an older preload: no setSelection
    render(<ModelProviders />);
    await waitFor(() => expect(screen.getByText(/cannot save a selection/i)).toBeTruthy());
    expect((screen.getByRole("button", { name: /no changes/i }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("renders a gateway list a screenful at a time, with the chosen rows on top", async () => {
    // The real shape is 464 rows. Rendering all of them to reach the filter is a
    // settings pane that stutters on open, so the list is capped until asked.
    const many = Array.from({ length: 120 }, (_, i) => ({
      id: `vendor/model-${i}`, label: `Model ${i}`, context: 8000, routesHere: true,
    }));
    const big: ProviderCatalog = {
      reason: null,
      checkedAt: "2026-09-29T00:00:00.000Z",
      providers: [{
        id: "openrouter", label: "OpenRouter", connected: true, connectedAt: "2026-09-28T00:00:00Z",
        live: true, catalog: { known: 120, stale: false, shadowed: 0, lastError: null },
        selectedModels: ["vendor/model-7"], models: many,
      }],
    };
    stubBridge({ catalog: async () => big });
    render(<ModelProviders />);
    await waitFor(() => expect(screen.getByText("1 of 120 offered")).toBeTruthy());

    expect(document.querySelectorAll("input[type=checkbox]")).toHaveLength(60);
    // Chosen rows sort first, so the one already selected is on screen without a search.
    expect((screen.getByLabelText("vendor/model-7") as HTMLInputElement).checked).toBe(true);

    fireEvent.click(screen.getByRole("button", { name: /show all 120 models/i }));
    expect(document.querySelectorAll("input[type=checkbox]")).toHaveLength(120);

    fireEvent.change(screen.getByLabelText("Filter OpenRouter models"), { target: { value: "model-11" } });
    // 11 and 110-119, by id: a filter narrows the whole list, not the rendered page.
    expect(document.querySelectorAll("input[type=checkbox]")).toHaveLength(11);
  });
});
