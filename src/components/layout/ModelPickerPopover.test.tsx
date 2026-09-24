// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ModelPickerPopover } from "./ModelPickerPopover";
import { useStore } from "../../lib/store";
import type { EngineDescriptor, EngineModel, RuntimeProfile } from "../../lib/desktop";

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

/** Swaps the bridge to a local-engine install; the runtime stays unreachable. */
function useLocalEngines(models: (engineId: string) => Promise<EngineModel[]>, descriptors = [OLLAMA]) {
  window.memex!.config.getActive = vi.fn().mockResolvedValue(LOCAL_PROFILE);
  window.memex!.engines = { list: async () => descriptors, models };
}

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
    window.memex!.engines = {
      list: async () => [OLLAMA],
      models: async () => [engineRow(OLLAMA, "qwen3:14b")],
    };

    const user = userEvent.setup();
    render(<ModelPickerPopover />);
    await user.click(await screen.findByRole("button", { name: /qwen3 8b/i }));

    await waitFor(() => expect(apiFetch).toHaveBeenCalled());
    expect(screen.queryByTitle("qwen3:14b — on Ollama")).toBeNull();
  });
});
