// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SetupWizard } from "./SetupWizard";
import { validateRouting } from "../../../electron/routing-config";
import type {
  EngineDiscovery, LocalLlmInspection, RoutingConfig, RoutingResult, RuntimeProfile,
} from "../../lib/desktop";

/**
 * Step 0 is where D3 lands: discovered engines with their evidence, a run style the
 * user has to answer, and the routing table that answer produces. These tests mount
 * the wizard against a stated machine state — nothing real is probed, and the bridge
 * records exactly what the confirmation tried to write.
 */

const PROFILE: RuntimeProfile = {
  id: "local-llm", name: "Local LLMs", providerType: "internal",
  agentRuntime: "http://[::1]:8008", mempalace: "", ollama: "http://[::1]:11434", defaultModel: "qwen3:14b",
};

const OLLAMA_UP: EngineDiscovery = {
  kind: "ollama", installed: "yes", running: true, baseUrl: "http://[::1]:11434",
  evidence: "GET http://[::1]:11434/api/tags answered 200 with 2 models: qwen3:14b, nomic-embed-text:latest.",
  models: ["qwen3:14b", "nomic-embed-text:latest"],
};

/** The verdict this build must not overstate: a quiet port is a lane to configure. */
const LLAMA_QUIET: EngineDiscovery = {
  kind: "llama.cpp", installed: "unknown", running: false, baseUrl: null,
  evidence: "Nothing answered GET /health at http://127.0.0.1:8080, http://127.0.0.1:8011, so this stays \"not installed but configurable\".",
  models: [],
};

function inspection(over: Partial<LocalLlmInspection> = {}): LocalLlmInspection {
  return {
    systemRamGb: 32,
    gpus: [{ name: "NVIDIA GeForce RTX 5060 Ti", vramGb: 15.9 }, { name: "NVIDIA GeForce RTX 5060 Ti", vramGb: 15.9 }],
    ollama: { url: OLLAMA_UP.baseUrl!, reachable: true, models: OLLAMA_UP.models },
    openWebUi: { url: "http://127.0.0.1:3000", reachable: false },
    comfyUi: { url: "http://127.0.0.1:8188", reachable: false },
    harness: { url: "http://[::1]:8008", reachable: true },
    recommendations: [{ model: "qwen3.8:27b", label: "Best quality", reason: "Full 27B reasoning model for setups with 24 GB+ total VRAM." }],
    engines: [OLLAMA_UP, LLAMA_QUIET],
    ...over,
  };
}

const NO_TABLE: RoutingConfig = { runStyle: "multi", engines: {}, routing: {} };

function mount(options: {
  scanned?: LocalLlmInspection;
  stored?: RoutingConfig | null;
  routeSet?: (next: RoutingConfig) => RoutingResult;
} = {}) {
  const written: RoutingConfig[] = [];
  const activated: Array<Record<string, string>> = [];
  const scanned = options.scanned ?? inspection();
  const stored = options.stored ?? null;
  const routeSet = options.routeSet ?? ((next: RoutingConfig): RoutingResult => {
    written.push(next);
    return { ok: true, routing: next, issues: [] };
  });

  window.memex = {
    isDesktop: true,
    config: {
      getAll: async () => [PROFILE],
      getActive: async () => PROFILE,
      setActive: vi.fn(async () => true),
      onChange: () => () => {},
    },
    identity: { get: async () => "tester", set: vi.fn(async (u: string) => u) },
    routing: {
      get: async () => ({ routing: stored ?? NO_TABLE, errors: [] }),
      set: (next: unknown) => Promise.resolve(routeSet(next as RoutingConfig)),
      validate: async () => [],
    },
    localLlm: {
      inspect: async () => scanned,
      activate: async (payload: Record<string, string>) => { activated.push(payload); return PROFILE; },
      pullModel: async () => ({ ok: true }),
      openOllamaDownload: async () => {},
    },
    health: { check: async () => ({ agentRuntime: "connected", mempalace: "disconnected", ollama: "connected", checkedAt: "" }) },
  } as unknown as typeof window.memex;

  return { written, activated };
}

/** The card that sets the run style, by the title the user reads. Finding it is an
 * await on purpose: the panel only exists once the scan has answered. */
const styleButton = (title: RegExp) => screen.findByRole("button", { name: title });
const confirm = () => screen.getByRole("button", { name: /Confirm/ }) as HTMLButtonElement;

describe("SetupWizard step 0", () => {
  beforeEach(() => {
    localStorage.clear();
  });
  afterEach(cleanup);

  it("shows what it found and how it knows, including the lane it will not claim", async () => {
    mount();
    render(<SetupWizard onComplete={vi.fn()} />);

    expect(await screen.findByText(OLLAMA_UP.evidence)).toBeTruthy();
    expect(screen.getByText(LLAMA_QUIET.evidence)).toBeTruthy();
    expect(screen.getByText("running")).toBeTruthy();
    // The asymmetry, said in the user's words rather than hidden in a footnote.
    expect(screen.getByText("not installed · configurable")).toBeTruthy();
  });

  it("proposes a run style from the hardware and refuses to confirm until the user answers", async () => {
    mount();
    render(<SetupWizard onComplete={vi.fn()} />);

    // The proposal states the numbers it used, next to the buttons that answer it.
    expect(await screen.findByText(/2 cards totalling 31.8 GB/)).toBeTruthy();
    expect(screen.getByText("Run style · proposed: multi-model")).toBeTruthy();
    expect(screen.getByText("proposed for this box")).toBeTruthy();
    expect(screen.getByText("Choose a run style above to see the table.")).toBeTruthy();
    expect(confirm().disabled).toBe(true);

    // Nothing in config.json selected it. The derived value is stated as a fact about
    // the file, and the confirm stays locked until the user answers for it.
    expect(screen.getByText(/config\.json already holds runStyle "multi"/)).toBeTruthy();
  });

  it("shows the exact JSON it will write, once a style is chosen", async () => {
    const user = userEvent.setup();
    mount();
    render(<SetupWizard onComplete={vi.fn()} />);

    await user.click(await styleButton(/Multi-model/));
    const preview = await screen.findByText(/"runStyle": "multi"/);
    expect(preview.textContent).toContain('"engine": "ollama"');
    expect(confirm().disabled).toBe(false);
    expect(confirm().textContent).toBe("Confirm multi setup");
  });

  it("writes a multi table whose run style and routing.default agree, with no pin", async () => {
    const { written, activated } = mount();
    const user = userEvent.setup();
    render(<SetupWizard onComplete={vi.fn()} />);

    await user.click(await styleButton(/Multi-model/));
    await user.selectOptions(screen.getByRole("combobox"), "qwen3:14b");
    await user.click(confirm());

    await waitFor(() => expect(written).toHaveLength(1));
    const table = written[0];
    expect(table.runStyle).toBe("multi");
    expect(table.routing.default).toEqual({ engine: "ollama", model: "qwen3:14b" });
    expect(table.engines.ollama).toEqual({ kind: "ollama", baseUrl: "http://[::1]:11434", label: "Ollama" });
    // A pin in multi would be a second answer to the same question.
    expect(table.engines.ollama.pinnedModel).toBeUndefined();
    expect(validateRouting(table)).toEqual([]);

    // The old contract still runs: the profile is written from the same panel.
    expect(activated[0]).toMatchObject({ ollamaUrl: "http://[::1]:11434", model: "qwen3:14b" });
    // And the wizard moved on.
    expect(await screen.findByRole("heading", { name: "Test connection" })).toBeTruthy();
  });

  it("moves the pinnedModel with the choice in single, so the flatten cannot override it", async () => {
    const { written } = mount();
    const user = userEvent.setup();
    render(<SetupWizard onComplete={vi.fn()} />);

    await user.click(await styleButton(/One pinned model/));
    await user.selectOptions(screen.getByRole("combobox"), "qwen3:14b");
    await user.click(confirm());

    await waitFor(() => expect(written).toHaveLength(1));
    expect(written[0].runStyle).toBe("single");
    expect(written[0].routing.default).toEqual({ engine: "ollama", model: "qwen3:14b" });
    expect(written[0].engines.ollama.pinnedModel).toBe("qwen3:14b");
    expect(validateRouting(written[0])).toEqual([]);
  });

  it("routes at the address discovery reached, not the one this build ships with", async () => {
    const onAnotherPort = inspection({
      engines: [{ ...OLLAMA_UP, baseUrl: "http://127.0.0.1:11500", evidence: "GET http://127.0.0.1:11500/api/tags answered 200 with 2 models (from OLLAMA_HOST).", models: OLLAMA_UP.models }],
      ollama: { url: "http://127.0.0.1:11500", reachable: true, models: OLLAMA_UP.models },
    });
    const { written } = mount({ scanned: onAnotherPort });
    const user = userEvent.setup();
    render(<SetupWizard onComplete={vi.fn()} />);

    await user.click(await styleButton(/Multi-model/));
    await user.click(confirm());

    await waitFor(() => expect(written).toHaveLength(1));
    expect(written[0].engines.ollama.baseUrl).toBe("http://127.0.0.1:11500");
  });

  it("keeps a hand-written slot, and the engine id it names the lane by", async () => {
    const stored: RoutingConfig = {
      runStyle: "multi",
      engines: { "ollama-local": { kind: "ollama", baseUrl: "http://192.168.1.9:11434", label: "Studio box" } },
      routing: {
        default: { engine: "ollama-local", model: "old:1b" },
        "collective.critic": { engine: "ollama-local", model: "qwen3:14b" },
      },
    };
    const { written } = mount({ stored });
    const user = userEvent.setup();
    render(<SetupWizard onComplete={vi.fn()} />);

    // The file's own answer, labelled as a fact about the file rather than a choice.
    expect(await screen.findByText(/config\.json already holds runStyle "multi"/)).toBeTruthy();
    await user.click(await styleButton(/Multi-model/));
    await user.selectOptions(screen.getByRole("combobox"), "qwen3:14b");
    await user.click(confirm());

    await waitFor(() => expect(written).toHaveLength(1));
    expect(Object.keys(written[0].engines)).toEqual(["ollama-local"]);
    expect(written[0].engines["ollama-local"].baseUrl).toBe("http://[::1]:11434"); // re-addressed, not renamed
    expect(written[0].routing["collective.critic"]).toEqual({ engine: "ollama-local", model: "qwen3:14b" });
    expect(written[0].routing.default).toEqual({ engine: "ollama-local", model: "qwen3:14b" });
    expect(validateRouting(written[0])).toEqual([]);
  });

  it("shows the paths config.json refused, instead of reporting a success", async () => {
    const { written } = mount({
      routeSet: (next) => ({
        ok: false, routing: next,
        issues: [{ path: "routing.default.engine", message: `"ollma" is not in engines — configured: ollama` }],
      }),
    });
    const onComplete = vi.fn();
    const user = userEvent.setup();
    render(<SetupWizard onComplete={onComplete} />);

    await user.click(await styleButton(/Multi-model/));
    await user.click(confirm());

    expect(await screen.findByText(/routing\.default\.engine: "ollma" is not in engines/)).toBeTruthy();
    expect(screen.getByText(/config.json refused this routing table/)).toBeTruthy();
    expect(written).toHaveLength(0);          // nothing was persisted
    expect(screen.queryByRole("heading", { name: "Test connection" })).toBeNull(); // and the step did not advance
    expect(onComplete).not.toHaveBeenCalled();
  });

  it("leaves an unconfigured memory service unconfigured, and says what that costs", async () => {
    const { activated } = mount();
    const user = userEvent.setup();
    render(<SetupWizard onComplete={vi.fn()} />);

    expect(await screen.findByText(/No memory service is configured/)).toBeTruthy();
    await user.click(screen.getByRole("button", { name: /Advanced: edit service addresses/ }));
    const memory = screen.getByLabelText("Memory service (no default)") as HTMLInputElement;
    expect(memory.value).toBe("");            // no inherited address from anyone's house
    expect(screen.getByLabelText("llama.cpp / llama-server (optional)")).toBeTruthy();

    await user.click(await styleButton(/Multi-model/));
    await user.click(confirm());
    await waitFor(() => expect(activated).toHaveLength(1));
    expect(activated[0].mempalaceUrl).toBe("");
  });
});
