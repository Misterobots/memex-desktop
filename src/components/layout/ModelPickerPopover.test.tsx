// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ModelPickerPopover } from "./ModelPickerPopover";
import { useStore } from "../../lib/store";
import type { CapabilityReport, EngineDescriptor, EngineModel, RoutingConfig, RuntimeProfile } from "../../lib/desktop";

// Every runtime URL is refused: this is the machine state where the user's own
// engine is up and the orchestrator is down. A picker that still asks the
// runtime for its list fails the tests below loudly, not silently.
const { apiFetch, getMyPermissions } = vi.hoisted(() => ({
  apiFetch: vi.fn(),
  getMyPermissions: vi.fn(),
}));
vi.mock("../../lib/api-fetch", () => ({ apiFetch }));
// The `model_selection` grant is an input to these tests, not the thing under
// test. It is served locally so the runtime never gets to answer it either.
vi.mock("../../lib/user-permissions", () => ({ getMyPermissions }));

const OLLAMA: EngineDescriptor = { id: "ollama", kind: "ollama", baseUrl: "http://[::1]:11434", label: "Ollama" };
const LLAMA: EngineDescriptor = { id: "llama.cpp", kind: "llama.cpp", baseUrl: "http://127.0.0.1:8011", label: "llama.cpp" };

const engineRow = (engine: EngineDescriptor, model: string, extra: Partial<EngineModel> = {}): EngineModel => ({
  engineId: engine.id,
  engineKind: engine.kind,
  engineLabel: engine.label ?? engine.id,
  model,
  ...extra,
});

/** The realistic install: an internal routing profile whose engine is local. */
const LOCAL_PROFILE: RuntimeProfile = {
  id: "localhost",
  name: "Localhost",
  providerType: "internal",
  agentRuntime: "http://[::1]:8008",
  mempalace: "http://192.168.2.102:8200",
  ollama: "http://[::1]:11434",
  defaultModel: "qwen3:8b",
};

/** The D4 answer for a fixture that was never asked: `unknown`, never an empty set
 * wearing `reported`, because the picker's own contract is that these two read
 * differently. */
export const SILENT: CapabilityReport = {
  capabilities: [], source: "unknown", contextLength: null, detail: "fixture engine did not answer /api/show",
};

/** A live Ollama's answer, from the payloads recorded in electron/model-capabilities.ts. */
export const reportedAs = (capabilities: string[], contextLength: number | null = null): CapabilityReport => ({
  capabilities, source: "reported", contextLength, detail: `/api/show reported: ${capabilities.join(", ")}`,
});

/** Swaps the bridge to a local-engine install; the runtime stays unreachable. */
function useLocalEngines(
  models: (engineId: string) => Promise<EngineModel[]>,
  descriptors = [OLLAMA],
  capabilities: (lane: { id: string; model: string }) => Promise<CapabilityReport> = async () => SILENT,
) {
  window.memex!.config.getActive = vi.fn().mockResolvedValue(LOCAL_PROFILE);
  // `modelsFor` takes `{ id }` and main resolves it to a stored lane before probing,
  // so a fixture that ignores the lookup would hide a missing lane; delegating keeps
  // the two channels answering the same question.
  window.memex!.engines = {
    list: async () => descriptors, models, modelsFor: async ({ id }) => models(id), capabilities,
  };
}

/** The D2 table this install routes by, as the main process would hand it over. */
function useRouting(routing: RoutingConfig) {
  window.memex!.routing = {
    get:      async () => ({ routing, errors: [] }),
    set:      async () => ({ ok: true, routing, issues: [] }),
    validate: async () => [],
  };
}

const OLLAMA_ONLY = (model: string): RoutingConfig => ({
  runStyle: "multi",
  engines: { ollama: { kind: "ollama", baseUrl: OLLAMA.baseUrl, label: "Ollama" } },
  routing: { default: { engine: "ollama", model } },
});

describe("ModelPickerPopover", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    // The orchestrator answers nothing at all, for any URL, in every test here.
    apiFetch.mockRejectedValue(new TypeError("fetch failed"));
    getMyPermissions.mockResolvedValue({ features: { model_selection: true } });
    useStore.setState({
      selectedModel: "qwen3:8b",
    });

    window.memex = {
      config: {
        getActive: vi.fn().mockResolvedValue({
          id: "local",
          providerType: "external",
          defaultModel: "qwen3:8b",
        }),
        save: vi.fn().mockResolvedValue(undefined),
        onChange: vi.fn().mockReturnValue(() => {}),
      },
      ollama: {
        listModels: vi.fn().mockResolvedValue([]),
        contextLength: vi.fn().mockResolvedValue(32768),
        getLoadedModels: vi.fn().mockResolvedValue([
          {
            name: "qwen3:8b",
            model: "qwen3:8b",
            sizeGb: 5.2,
            vramGb: 5.2,
            host: "http://127.0.0.1:11434",
          },
        ]),
        unloadModel: vi.fn().mockResolvedValue({ ok: true, unloaded: ["qwen3:8b"] }),
      },
    } as unknown as typeof window.memex;
  });

  afterEach(cleanup);

  it("renders trigger button and shows In VRAM indicator when a model is resident", async () => {
    render(<ModelPickerPopover />);

    // Waits for access permissions and initial loaded models fetch
    await waitFor(() => {
      expect(screen.getAllByTitle(/resident in VRAM/i).length).toBeGreaterThan(0);
    });

    expect(screen.getByRole("button", { name: /qwen3 8b/i })).toBeTruthy();
  });

  it("opens popover, shows resident VRAM banner, and calls unloadModel on click", async () => {
    const user = userEvent.setup();
    render(<ModelPickerPopover />);

    await waitFor(() => {
      expect(screen.getAllByTitle(/resident in VRAM/i).length).toBeGreaterThan(0);
    });

    // Click trigger to open popover
    await user.click(screen.getByRole("button", { name: /qwen3 8b/i }));

    // Popover is open: check VRAM status banner
    await waitFor(() => {
      expect(screen.getByText("In VRAM")).toBeTruthy();
      expect(screen.getByText("5.2 GB")).toBeTruthy();
      expect(screen.getByRole("button", { name: /Unload/i })).toBeTruthy();
    });

    // Click Unload
    const unloadBtn = screen.getByRole("button", { name: /Unload/i });
    await user.click(unloadBtn);

    expect(window.memex?.ollama.unloadModel).toHaveBeenCalledWith("qwen3:8b");
  });

  // D1b acceptance: "with Ollama running and the agent runtime stopped, the
  // picker still lists pulled models" (plan-09-24-2026.md). `apiFetch` rejects for
  // every URL in this file, so these tests are that machine state — and the list
  // they assert on can only have come from the engine bridge.
  it("lists the engine's pulled models with the agent runtime unreachable", async () => {
    const models = vi.fn(async () => [
      engineRow(OLLAMA, "qwen3:14b", { sizeBytes: 9e9 }),
      engineRow(OLLAMA, "nomic-embed-text:latest", { sizeBytes: 2.78e8 }),
    ]);
    useLocalEngines(models);

    const user = userEvent.setup();
    render(<ModelPickerPopover />);
    // The trigger only exists once the access check has resolved.
    await user.click(await screen.findByRole("button", { name: /qwen3 8b/i }));

    await waitFor(() => expect(screen.getByTitle("qwen3:14b — on Ollama")).toBeTruthy());
    expect(screen.getByTitle("nomic-embed-text:latest — on Ollama")).toBeTruthy();

    // Not merely "unbroken by" the dead runtime — never consulted. Had the list
    // still come from it, `apiFetch` rejects and an error row replaces both models.
    expect(apiFetch).not.toHaveBeenCalled();
    expect(screen.queryByText(/Fetch Error|Unrecognized API response|Error 5/)).toBeNull();
    expect(models).toHaveBeenCalledWith("ollama");
  });

  it("selects an engine row without qualifying the model on the wire", async () => {
    useLocalEngines(async () => [engineRow(OLLAMA, "qwen3:14b", { sizeBytes: 9e9 })]);

    const user = userEvent.setup();
    render(<ModelPickerPopover />);
    await user.click(await screen.findByRole("button", { name: /qwen3 8b/i }));
    await waitFor(() => expect(screen.getByTitle("qwen3:14b — on Ollama")).toBeTruthy());
    await user.click(screen.getByTitle("qwen3:14b — on Ollama"));

    // D1c is what carries the engine; until then a selection must send the bare
    // model name exactly as the runtime-backed list did.
    expect(useStore.getState().selectedModel).toBe("qwen3:14b");
    expect(window.memex?.config.save).toHaveBeenCalledWith(
      expect.objectContaining({ defaultModel: "qwen3:14b" }),
    );
  });

  it("shows both engines at once, each row labelled and a shared tag kept twice", async () => {
    useLocalEngines(
      async (engineId: string) => engineId === LLAMA.id
        ? [engineRow(LLAMA, "qwen3-coder:30b", { resident: true })]
        : [engineRow(OLLAMA, "qwen3:14b", { sizeBytes: 9e9 }), engineRow(OLLAMA, "qwen3-coder:30b", { sizeBytes: 1.8e10 })],
      [OLLAMA, LLAMA],
    );

    const user = userEvent.setup();
    render(<ModelPickerPopover />);
    await user.click(await screen.findByRole("button", { name: /qwen3 8b/i }));

    // The lane reuses Ollama's own GGUF, so the same name legitimately exists on
    // two engines: both are offered, distinguished by their engine.
    await waitFor(() => expect(screen.getAllByTitle(/qwen3-coder:30b/)).toHaveLength(2));
    expect(screen.getByTitle("qwen3-coder:30b — on Ollama")).toBeTruthy();
    expect(screen.getByTitle("qwen3-coder:30b — on llama.cpp")).toBeTruthy();
    expect(screen.getAllByText("Ollama").length).toBe(2);
    expect(screen.getByText("llama.cpp")).toBeTruthy();
  });

  it("keeps an external provider's own model list, which no local engine can answer", async () => {
    // The shared bridge is already providerType "external"; what must NOT happen
    // is the picker inventing local Ollama rows for a third-party API profile.
    const rows = [engineRow(OLLAMA, "qwen3:14b")];
    window.memex!.engines = {
      list: async () => [OLLAMA],
      models: async () => rows,
      modelsFor: async () => rows,
      capabilities: async () => SILENT,
    };

    const user = userEvent.setup();
    render(<ModelPickerPopover />);
    await user.click(await screen.findByRole("button", { name: /qwen3 8b/i }));

    await waitFor(() => expect(apiFetch).toHaveBeenCalled());
    expect(screen.queryByTitle("qwen3:14b — on Ollama")).toBeNull();
  });

  // D2's entitlement change, both directions. Whether the picker *exists* on an
  // internal profile used to hinge on the same answer either way, so a stopped
  // orchestrator hid a control that only ever touches the user's own engine.
  it("lists the engine's models for an internal profile whose runtime never answered", async () => {
    // Rejection is "nothing answered": `getMyPermissions` throws for a connection
    // that failed as well as for a runtime that answered without a readable policy.
    // Neither is a deny, and only a deny may hide the picker.
    getMyPermissions.mockRejectedValue(new TypeError("fetch failed"));
    useLocalEngines(async () => [engineRow(OLLAMA, "qwen3:14b")]);

    const user = userEvent.setup();
    render(<ModelPickerPopover />);
    await user.click(await screen.findByRole("button", { name: /qwen3 8b/i }));

    await waitFor(() => expect(screen.getByTitle("qwen3:14b — on Ollama")).toBeTruthy());
    expect(screen.queryByText("Memex default")).toBeNull();
  });

  it("stays hidden when the runtime answered and withheld model_selection", async () => {
    const models = vi.fn(async () => [engineRow(OLLAMA, "qwen3:14b")]);
    useLocalEngines(models);
    getMyPermissions.mockResolvedValue({ features: { model_selection: false } });

    render(<ModelPickerPopover />);

    // An explicit false is a decision, not an outage: the picker stays closed and the
    // engine is never even asked — failing open here would be the same bug wearing
    // the other direction.
    await waitFor(() => expect(screen.getByText("Memex default")).toBeTruthy());
    expect(screen.queryByRole("button", { name: /qwen3 8b/i })).toBeNull();
    expect(models).not.toHaveBeenCalled();
  });

  it("follows routing.default and names the slot the model came from", async () => {
    // The profile's own legacy default and the routing table disagree on purpose:
    // once the file declares a route, the file decides.
    useLocalEngines(async () => [engineRow(OLLAMA, "qwen3:14b"), engineRow(OLLAMA, "qwen2.5:7b")]);
    useRouting({
      ...OLLAMA_ONLY("qwen2.5:7b"),
      routing: { default: { engine: "ollama", model: "qwen2.5:7b" }, code: { engine: "ollama", model: "qwen3:14b" } },
    });

    const user = userEvent.setup();
    render(<ModelPickerPopover />);
    const trigger = await screen.findByRole("button", { name: /qwen2\.5 7b/i });
    expect(useStore.getState().selectedModel).toBe("qwen2.5:7b");

    await user.click(trigger);
    // The substitution has to be visible, not just correct: a model that arrived
    // through the table should say which slot sent it, and on what engine.
    await waitFor(() => expect(screen.getByText('routed from routing.default on Ollama')).toBeTruthy());
    expect(trigger.title).toContain("routed from routing.default");
  });

  /** A routing stub that records what the picker tried to write and answers with it,
   * so a later render can be seeded with the result — a restart, not a re-assert. */
  function captureRouting(initial: RoutingConfig) {
    const written: RoutingConfig[] = [];
    let current = initial;
    window.memex!.routing = {
      get:      async () => ({ routing: current, errors: [] }),
      set:      async (next: unknown) => { written.push(next as RoutingConfig); current = next as RoutingConfig; return { ok: true, routing: current, issues: [] }; },
      validate: async () => [],
    };
    return { written, current: () => current };
  }

  it("writes a pick into routing.default, so the next launch still means it", async () => {
    // The picker follows routing.default on load. If a click only reaches the profile's
    // legacy defaultModel, the table re-asserts on the next start and the choice quietly
    // reverts — the silent substitution this whole layer exists to make impossible.
    useLocalEngines(async () => [engineRow(OLLAMA, "qwen3:14b"), engineRow(OLLAMA, "qwen2.5:7b")]);
    const routing = captureRouting(OLLAMA_ONLY("qwen2.5:7b"));

    const user = userEvent.setup();
    const view = render(<ModelPickerPopover />);
    await user.click(await screen.findByRole("button", { name: /qwen2\.5 7b/i }));
    await user.click(await screen.findByTitle("qwen3:14b — on Ollama"));

    await waitFor(() => expect(routing.written.length).toBe(1));
    expect(routing.written[0].routing.default).toEqual({ engine: "ollama", model: "qwen3:14b" });
    expect(routing.written[0].engines).toEqual(OLLAMA_ONLY("qwen2.5:7b").engines);

    view.unmount();
    useStore.setState({ selectedModel: "qwen2.5:7b" });
    render(<ModelPickerPopover />);
    await waitFor(() => expect(screen.getByRole("button", { name: /qwen3 14b/i })).toBeTruthy());
  });

  it("moves the pin in single style, because every slot resolves to it anyway", async () => {
    // In "single" the table is flattened onto the engine's pinned model, so writing
    // only routing.default would be a note about a choice that never takes effect.
    useLocalEngines(async () => [engineRow(OLLAMA, "qwen3:14b"), engineRow(OLLAMA, "qwen2.5:7b")]);
    const routing = captureRouting({
      runStyle: "single",
      engines: { ollama: { kind: "ollama", baseUrl: OLLAMA.baseUrl, label: "Ollama", pinnedModel: "qwen2.5:7b" } },
      routing: { default: { engine: "ollama", model: "qwen2.5:7b" } },
    });

    const user = userEvent.setup();
    render(<ModelPickerPopover />);
    await user.click(await screen.findByRole("button", { name: /qwen2\.5 7b/i }));
    await user.click(await screen.findByTitle("qwen3:14b — on Ollama"));

    await waitFor(() => expect(routing.written.length).toBe(1));
    expect(routing.written[0].engines.ollama.pinnedModel).toBe("qwen3:14b");
    expect(routing.written[0].routing.default.model).toBe("qwen3:14b");
  });

  it("says so when the table refuses the write, instead of looking accepted", async () => {
    useLocalEngines(async () => [engineRow(OLLAMA, "qwen3:14b")]);
    window.memex!.routing = {
      get:      async () => ({ routing: OLLAMA_ONLY("qwen2.5:7b"), errors: [] }),
      set:      async () => ({ ok: false, routing: OLLAMA_ONLY("qwen2.5:7b"), issues: [{ path: "routing.default.engine", message: "names no engine" }] }),
      validate: async () => [],
    };

    const user = userEvent.setup();
    render(<ModelPickerPopover />);
    await user.click(await screen.findByRole("button", { name: /qwen2\.5 7b/i }));
    await user.click(await screen.findByTitle("qwen3:14b — on Ollama"));

    await waitFor(() => expect(screen.getByText(/routing\.default\.engine: names no engine/)).toBeTruthy());
  });

  // D4 — the picker must say what a model cannot do, and must still list it. The
  // capability arrays below are the ones measured from `POST /api/show` on this
  // machine (see the header of electron/model-capabilities.ts). The verdict sentences
  // come from main's module through the component's own bridge call; nothing here
  // re-implements the matrix.
  it("marks the embedding-only model with the capability it lacks, and keeps the row listed and clickable", async () => {
    useLocalEngines(
      async () => [engineRow(OLLAMA, "qwen3:14b"), engineRow(OLLAMA, "nomic-embed-text:latest")],
      [OLLAMA],
      async ({ model }) => reportedAs(
        model === "nomic-embed-text:latest" ? ["embedding"] : ["completion", "tools", "thinking"],
        model === "nomic-embed-text:latest" ? 2048 : 40960,
      ),
    );

    const user = userEvent.setup();
    render(<ModelPickerPopover />);
    await user.click(await screen.findByRole("button", { name: /qwen3 8b/i }));

    // Stated, not filtered: the row is there, it names the missing capability, and it
    // quotes what the engine actually reported.
    const row = await screen.findByTitle("nomic-embed-text:latest — on Ollama");
    expect(row.hasAttribute("disabled")).toBe(false);
    await waitFor(() => expect(screen.getByText(/needs completion/)).toBeTruthy());
    expect(screen.getByText(/reports embedding/)).toBeTruthy();
    // Exactly one row is marked: the capable model beside it carries no such line.
    expect(document.querySelectorAll("[data-capability='missing']")).toHaveLength(1);

    // And it is still assignable — the app's authority here is the sentence, not the gate.
    await user.click(row);
    expect(useStore.getState().selectedModel).toBe("nomic-embed-text:latest");
  });

  it("says it cannot verify, rather than assuming parity, when the engine stays silent", async () => {
    useLocalEngines(
      async () => [engineRow(OLLAMA, "qwen3:14b")],
      [OLLAMA],
      async () => SILENT,
    );

    const user = userEvent.setup();
    render(<ModelPickerPopover />);
    await user.click(await screen.findByRole("button", { name: /qwen3 8b/i }));

    await waitFor(() => expect(screen.getByText(/cannot verify/)).toBeTruthy());
    // "cannot verify" is not a refusal: nothing on the row claims the model is unusable.
    expect(screen.queryByText(/needs completion/)).toBeNull();
    expect(document.querySelectorAll("[data-capability='missing']")).toHaveLength(0);
    expect(document.querySelectorAll("[data-capability='unknown']")).toHaveLength(1);
  });

  it("marks nothing when the preload predates the matrix, which is not the same as everything passing", async () => {
    const bridge = window.memex!;
    bridge.config.getActive = vi.fn().mockResolvedValue(LOCAL_PROFILE);
    bridge.engines = {
      list: async () => [OLLAMA],
      models: async () => [engineRow(OLLAMA, "qwen3:14b")],
      modelsFor: async () => [engineRow(OLLAMA, "qwen3:14b")],
    } as unknown as typeof bridge.engines;

    const user = userEvent.setup();
    render(<ModelPickerPopover />);
    await user.click(await screen.findByRole("button", { name: /qwen3 8b/i }));

    await waitFor(() => expect(screen.getByTitle("qwen3:14b — on Ollama")).toBeTruthy());
    expect(document.querySelectorAll("[data-capability]").length).toBe(0);
  });
});
