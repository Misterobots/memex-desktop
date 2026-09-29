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
 * D7: a gateway lists 464 models, so the key alone must not decide what the picker
 * offers, and a list of 464 checkboxes is not the answer either. These cover the parts a
 * user would otherwise read backwards — a saved selection rendering as an empty offer, a
 * typo'd id being stored silently and refused three screens later, an id another provider
 * owns being accepted as a choice that cannot take effect, and a refused write looking
 * like an abandoned edit.
 */
const ADD_BOX = "Add OpenRouter models by id";

describe("ModelProviders — choosing which gateway models are offered", () => {
  it("shows the stored selection as chips, labelled", async () => {
    stubBridge({ catalog: async () => CONNECTED });
    render(<ModelProviders />);
    await waitFor(() => expect(screen.getByText("OpenRouter")).toBeTruthy());

    // The catalogue's label, not the raw id: what the user chose is what they read.
    // Queried through the chip's own hook because the browse list renders the same label
    // and id in the DOM even while collapsed.
    const chips = document.querySelectorAll("[data-chip]");
    expect(chips).toHaveLength(1);
    expect(chips[0].textContent).toContain("Llama 3.1 70B");
    expect(chips[0].textContent).toContain("meta-llama/llama-3.1-70b-instruct");
    expect(chips[0].getAttribute("data-chip")).toBe("known");
    expect(screen.getByText("1 offered")).toBeTruthy();
    expect(screen.getByLabelText("Stop offering meta-llama/llama-3.1-70b-instruct")).toBeTruthy();
    // Nothing was edited, so there is nothing to send.
    expect((screen.getByRole("button", { name: /no changes/i }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("adds a typed id and sends the whole list on save", async () => {
    const setSelection = vi.fn().mockResolvedValue({
      ok: true, detail: "openrouter: 2 models selected.",
      selected: ["deepseek/deepseek-chat", "meta-llama/llama-3.1-70b-instruct"],
    });
    const catalog = vi.fn(async () => CONNECTED);
    stubBridge({ catalog, setSelection });
    render(<ModelProviders />);
    await waitFor(() => expect(screen.getByText("OpenRouter")).toBeTruthy());

    fireEvent.change(screen.getByLabelText(ADD_BOX), { target: { value: "deepseek/deepseek-chat" } });
    fireEvent.click(screen.getByRole("button", { name: /^add$/i }));
    expect(screen.getByText("2 offered")).toBeTruthy();
    // The box empties after a commit, so the next id starts clean.
    expect((screen.getByLabelText(ADD_BOX) as HTMLInputElement).value).toBe("");

    fireEvent.click(screen.getByRole("button", { name: /save selection/i }));
    // The pre-existing choice travels with the new one: the runtime replaces the whole
    // value, so a delta would have quietly dropped Llama.
    await waitFor(() => expect(setSelection).toHaveBeenCalledWith(
      "openrouter", ["meta-llama/llama-3.1-70b-instruct", "deepseek/deepseek-chat"],
    ));
    expect(await screen.findByText("openrouter: 2 models selected.")).toBeTruthy();
    expect(catalog.mock.calls.length).toBeGreaterThan(1);
  });

  it("adds every id in a pasted comma list, not just the last", async () => {
    // Each add would otherwise read the draft before React had written the previous one.
    stubBridge({ catalog: async () => CONNECTED });
    render(<ModelProviders />);
    await waitFor(() => expect(screen.getByText("OpenRouter")).toBeTruthy());

    fireEvent.change(screen.getByLabelText(ADD_BOX), { target: { value: "acme/one, acme/two ,acme/three" } });
    fireEvent.click(screen.getByRole("button", { name: /^add$/i }));

    // Three unknown ids plus the one the catalogue knows: the summary counts what is
    // offered and names how many of them the fetched list has never heard of, rather
    // than producing "4 of 3 offered".
    expect(screen.getByText("4 offered · 3 not in the fetched list")).toBeTruthy();
    for (const id of ["acme/one", "acme/two", "acme/three"]) {
      expect(screen.getByLabelText(`Stop offering ${id}`)).toBeTruthy();
    }
  });

  it("accepts an id the fetched list does not carry, and says so on the chip", async () => {
    stubBridge({ catalog: async () => CONNECTED });
    render(<ModelProviders />);
    await waitFor(() => expect(screen.getByText("OpenRouter")).toBeTruthy());

    fireEvent.change(screen.getByLabelText(ADD_BOX), { target: { value: "vendor/brand-new-2026" } });
    fireEvent.click(screen.getByRole("button", { name: /^add$/i }));

    // Refusing it would be wrong — the catalogue is fetched and can be behind upstream.
    // Storing it silently would be worse: the runtime accepts anything, lists nothing
    // for it, and refuses a turn on it with a message naming neither provider nor
    // selection. So the chip carries the caveat where the id was typed.
    const chip = document.querySelector("[data-chip='unknown']");
    expect(chip?.textContent).toContain("vendor/brand-new-2026");
    expect(chip?.textContent).toContain("not in the fetched list");
    expect(document.querySelector("[data-chip='known']")).not.toBeNull();
  });

  it("refuses an id another provider answers, with the reason", async () => {
    stubBridge({ catalog: async () => CONNECTED });
    render(<ModelProviders />);
    await waitFor(() => expect(screen.getByText("OpenRouter")).toBeTruthy());

    fireEvent.change(screen.getByLabelText(ADD_BOX), { target: { value: "openai/gpt-4o" } });
    fireEvent.click(screen.getByRole("button", { name: /^add$/i }));

    expect(await screen.findByText(/answered by another provider on your runtime/)).toBeTruthy();
    expect(screen.getByText("1 offered")).toBeTruthy();
    expect(document.querySelector("[data-chip='unknown']")).toBeNull();
  });

  it("adds from the browse list and marks what is already offered", async () => {
    stubBridge({ catalog: async () => CONNECTED });
    render(<ModelProviders />);
    await waitFor(() => expect(screen.getByText("OpenRouter")).toBeTruthy());

    // Chosen rows say so instead of offering a second add; the shadowed one is labelled
    // and carries no button, because it could never route here.
    expect(screen.getByText("offered")).toBeTruthy();
    expect(screen.getByText("answered elsewhere")).toBeTruthy();
    const addable = screen.getAllByRole("button", { name: /\+ add/ });
    expect(addable).toHaveLength(1);

    fireEvent.click(addable[0]);
    expect(screen.getByText("2 offered")).toBeTruthy();
  });

  it("says a connected key offers nothing until models are named", async () => {
    const none: ProviderCatalog = {
      ...CONNECTED,
      providers: CONNECTED.providers.map((p) => ({ ...p, selectedModels: [] })),
    };
    stubBridge({ catalog: async () => none });
    render(<ModelProviders />);

    // The state right after connecting, stated as a choice rather than as a gap.
    await waitFor(() => expect(screen.getByText(/nothing offered yet/)).toBeTruthy());
    expect(screen.getByText(/Nothing is offered yet/)).toBeTruthy();
  });

  it("keeps the chips on screen when the runtime refuses the write", async () => {
    const setSelection = vi.fn().mockResolvedValue({
      ok: false, detail: "No openrouter key is connected, so there is nothing to select against.", selected: [],
    });
    stubBridge({ catalog: async () => CONNECTED, setSelection });
    render(<ModelProviders />);
    await waitFor(() => expect(screen.getByText("OpenRouter")).toBeTruthy());

    fireEvent.change(screen.getByLabelText(ADD_BOX), { target: { value: "deepseek/deepseek-chat" } });
    fireEvent.click(screen.getByRole("button", { name: /^add$/i }));
    fireEvent.click(screen.getByRole("button", { name: /save selection/i }));

    expect(await screen.findByText(/nothing to select against/)).toBeTruthy();
    // A failed write that dropped the chip would read as an edit the user undid.
    expect(screen.getByLabelText("Stop offering deepseek/deepseek-chat")).toBeTruthy();
    expect(screen.getByRole("button", { name: /save selection/i })).toBeTruthy();
  });

  it("discards an unsaved edit back to what the runtime reported", async () => {
    stubBridge({ catalog: async () => CONNECTED });
    render(<ModelProviders />);
    await waitFor(() => expect(screen.getByText("OpenRouter")).toBeTruthy());

    fireEvent.change(screen.getByLabelText(ADD_BOX), { target: { value: "deepseek/deepseek-chat" } });
    fireEvent.click(screen.getByRole("button", { name: /^add$/i }));
    fireEvent.click(screen.getByRole("button", { name: /discard/i }));

    expect(screen.getByText("1 offered")).toBeTruthy();
  });

  it("offers no selection editor for a curated provider", async () => {
    stubBridge({ catalog: async () => CONNECTED });
    render(<ModelProviders />);
    await waitFor(() => expect(screen.getByText("NVIDIA NIM")).toBeTruthy());

    // Three to eight models is already a menu; opt-in there would be a behaviour change
    // wearing a new control, so the row says what happens instead.
    expect(screen.queryByLabelText("Add NVIDIA NIM models by id")).toBeNull();
    expect(screen.getByText(/All of these are offered while the key is connected/)).toBeTruthy();
  });

  it("says so when the build cannot save a selection", async () => {
    stubBridge({ catalog: async () => CONNECTED }); // an older preload: no setSelection
    render(<ModelProviders />);
    await waitFor(() => expect(screen.getByText(/cannot save a selection/i)).toBeTruthy());
    expect((screen.getByRole("button", { name: /no changes/i }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("names models while connecting, and sends the key and the list in one action", async () => {
    const connect = vi.fn().mockResolvedValue({ ok: true, detail: "openrouter connected." });
    const setSelection = vi.fn().mockResolvedValue({
      ok: true, detail: "openrouter: 1 model selected.", selected: ["deepseek/deepseek-chat"],
    });
    stubBridge({ catalog: async () => CATALOG, connect, setSelection });
    render(<ModelProviders />);
    await waitFor(() => expect(screen.getByText("OpenRouter")).toBeTruthy());

    // CATALOG has anthropic and openrouter unconnected; openrouter is the second.
    fireEvent.click(screen.getAllByRole("button", { name: /^connect$/i })[1]);
    fireEvent.change(await screen.findByLabelText("OpenRouter API key"), { target: { value: "sk-or-secret-123" } });
    fireEvent.change(screen.getByLabelText("OpenRouter model ids"), {
      target: { value: "deepseek/deepseek-chat" },
    });
    fireEvent.click(screen.getByRole("button", { name: /save key/i }));

    await waitFor(() => expect(connect).toHaveBeenCalledWith("openrouter", "sk-or-secret-123", ""));
    await waitFor(() => expect(setSelection).toHaveBeenCalledWith("openrouter", ["deepseek/deepseek-chat"]));
    expect(await screen.findByText(/connected with 1 model offered/)).toBeTruthy();
    expect(document.body.textContent).not.toContain("sk-or-secret-123");
  });

  it("keeps the model field off a curated provider's connect form", async () => {
    stubBridge({ catalog: async () => CATALOG });
    render(<ModelProviders />);
    await waitFor(() => expect(screen.getByText("Anthropic (Claude)")).toBeTruthy());

    fireEvent.click(screen.getAllByRole("button", { name: /^connect$/i })[0]);
    await screen.findByLabelText("Anthropic (Claude) API key");
    expect(screen.queryByLabelText("Anthropic (Claude) model ids")).toBeNull();
  });

  it("renders the browse list a screenful at a time", async () => {
    // The real shape is 464 rows. Scrolling all of them to find one id is the thing the
    // typed box solves, so browsing stays capped and the filter is the way in.
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
    await waitFor(() => expect(screen.getByText("1 offered")).toBeTruthy());

    // 60 rows rendered, one of which is already offered and says so rather than adding.
    expect(screen.getAllByRole("button", { name: /\+ add/ })).toHaveLength(59);
    fireEvent.click(screen.getByRole("button", { name: /show all 120 models/i }));
    expect(screen.getAllByRole("button", { name: /\+ add/ })).toHaveLength(119);

    fireEvent.change(screen.getByLabelText("Filter OpenRouter models"), { target: { value: "model-11" } });
    // 11 and 110-119, by id: the filter narrows the whole list, not the rendered page.
    expect(screen.getAllByRole("button", { name: /\+ add/ })).toHaveLength(11);
  });

  it("suggests catalogue matches while typing, and never suggests an unaddable one", async () => {
    stubBridge({ catalog: async () => CONNECTED });
    render(<ModelProviders />);
    await waitFor(() => expect(screen.getByText("OpenRouter")).toBeTruthy());

    fireEvent.change(screen.getByLabelText(ADD_BOX), { target: { value: "llama" } });
    // `meta-llama/llama-3.1-70b-instruct` matches but is already offered, so it is not
    // proposed again; nothing else in the fixture carries "llama".
    expect(screen.queryByRole("list", { name: "Matching models" })).toBeNull();

    fireEvent.change(screen.getByLabelText(ADD_BOX), { target: { value: "deepseek" } });
    const suggestion = await screen.findByRole("button", { name: /DeepSeek Chat/ });
    expect(suggestion.textContent).toContain("+ add");
    fireEvent.click(suggestion);
    expect(screen.getByText("2 offered")).toBeTruthy();
  });
});
