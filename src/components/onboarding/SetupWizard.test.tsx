// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SetupWizard } from "./SetupWizard";
import { ROUTING_ROWS, validateRouting } from "../../../electron/routing-config";
import type {
  CapabilityReport, EngineDiscovery, EngineModel, LocalLlmInspection, RoutingConfig, RoutingResult, RunStyle,
  RuntimeProfile, RuntimeTopology,
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

/** The same lane when it *is* up: a second engine the assignment step must offer. */
const LLAMA_UP: EngineDiscovery = {
  kind: "llama.cpp", installed: "yes", running: true, baseUrl: "http://127.0.0.1:8011",
  evidence: "GET http://127.0.0.1:8011/health answered 200.",
  models: ["qwen3-coder:30b"],
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
  /** What each lane reports when the assignment step asks for candidates. A lane not
   * named here answers empty — the unreachable case, which the rows report differently
   * from "running and has nothing". */
  catalogue?: Record<string, string[]>;
  /** D4's answer for a candidate, keyed by the lane the row resolved to. Deliberately
   * absent by default: no `capabilities` on the bridge is the older-preload case, and
   * every existing test in this file runs that way — a row with no verdict is not a
   * row that passed. */
  capabilities?: (lane: { id: string; model: string }) => Promise<CapabilityReport>;
  /** D5's node report. Absent by default for the same reason `capabilities` is: no
   * `runtime` on the bridge is the older-preload case, and an unread topology must
   * change nothing about what a row is allowed to say or save. */
  runtime?: { nodes: () => Promise<RuntimeTopology> };
} = {}) {
  const written: RoutingConfig[] = [];
  const activated: Array<Record<string, string>> = [];
  /** The ids the step asked main to resolve, in order. Proves `modelsFor` is the
   * lookup channel and that the step never sends an address to probe. */
  const lanesAsked: string[] = [];
  /** How many times the component read the store. It should not grow after a write —
   * `saveRouting` broadcasts no `config:changed`, so a re-read is always stale. */
  let routingGets = 0;
  const scanned = options.scanned ?? inspection();
  const stored = options.stored ?? null;
  const catalogue = options.catalogue ?? {};
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
      get: async () => { routingGets += 1; return { routing: stored ?? NO_TABLE, errors: [] }; },
      set: (next: unknown) => Promise.resolve(routeSet(next as RoutingConfig)),
      validate: async () => [],
    },
    engines: {
      list: async () => [],
      models: async () => [],
      modelsFor: async ({ id }: { id: string }) => {
        lanesAsked.push(id);
        return (catalogue[id] ?? []).map((model): EngineModel => ({
          engineId: id, engineKind: "ollama", engineLabel: id, model,
        }));
      },
      ...(options.capabilities ? { capabilities: options.capabilities } : {}),
    },
    localLlm: {
      inspect: async () => scanned,
      activate: async (payload: Record<string, string>) => { activated.push(payload); return PROFILE; },
      pullModel: async () => ({ ok: true }),
      openOllamaDownload: async () => {},
    },
    health: { check: async () => ({ agentRuntime: "connected", mempalace: "disconnected", ollama: "connected", checkedAt: "" }) },
    ...(options.runtime ? { runtime: options.runtime } : {}),
  } as unknown as typeof window.memex;

  return { written, activated, lanesAsked, storeReads: () => routingGets };
}

/** The card that sets the run style, by the title the user reads. Finding it is an
 * await on purpose: the panel only exists once the scan has answered. */
const styleButton = (title: RegExp) => screen.findByRole("button", { name: title });
const confirm = () => screen.getByRole("button", { name: /Confirm/ }) as HTMLButtonElement;

/** The scan of a box with both lanes up — the shape that gives a row a real choice of
 * engine, and the one `engines:models` used to answer empty for mid-wizard. */
const TWO_LANES = () => inspection({ engines: [OLLAMA_UP, LLAMA_UP] });

/** One row's two controls, by the accessible name the step gives them. */
const modelPick = (row: string) => screen.findByLabelText(`${row} model`) as Promise<HTMLSelectElement>;
const enginePick = (row: string) => screen.findByLabelText(`${row} engine`) as Promise<HTMLSelectElement>;
const optionValues = (select: HTMLSelectElement) => [...select.options].map((option) => option.value);
/** Asks a row for its asserted-capability chips. They are collapsed, so a test that
 * clicks one has to open it first — the same two keystrokes the user spends, and the
 * reason the click is still worth testing: hidden must not mean unreachable. */
const openCapabilities = async (user: ReturnType<typeof userEvent.setup>, row: string) => {
  await user.click(await screen.findByRole("button", { name: `${row} capabilities` }));
};

describe("SetupWizard step 0", () => {
  beforeEach(() => {
    localStorage.clear();
  });
  afterEach(cleanup);

  it("shows what it found and how it knows, including the lane it will not claim", async () => {
    const user = userEvent.setup();
    mount();
    render(<SetupWizard onComplete={vi.fn()} />);

    // An engine row is one line, so the proof has to be asked for. It is opened here
    // rather than assumed: a claim nobody can reach is not checkable.
    await user.click(await screen.findByRole("button", { name: "Ollama evidence" }));
    await user.click(screen.getByRole("button", { name: "llama.cpp evidence" }));

    expect(await screen.findByText(OLLAMA_UP.evidence)).toBeTruthy();
    expect(screen.getByText(LLAMA_QUIET.evidence)).toBeTruthy();
    expect(screen.getByText("running")).toBeTruthy();
    // The asymmetry, said in the user's words rather than hidden in a footnote — and in
    // the verdict word, which is why it is asserted outside the disclosure.
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
    // And the wizard moved on — to the assignment step, which is the other half of
    // what this wizard produces (decision 5: topology *plus* assignments).
    expect(await screen.findByRole("heading", { name: "Assign models to roles" })).toBeTruthy();
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

// ---------------------------------------------------------------------------
// Step 1 — the assignment set (D3a-2)
// ---------------------------------------------------------------------------

/** Reaches step 1 with the run style answered, so the step is read in the placement
 * the user chose rather than in the fixture's defaults. */
async function assign(style: RunStyle, model = "qwen3:14b") {
  const user = userEvent.setup();
  await user.click(await styleButton(style === "multi" ? /Multi-model/ : /One pinned model/));
  await user.selectOptions(screen.getByRole("combobox"), model);
  await user.click(confirm());
  await waitFor(() => expect(screen.getByRole("heading", { name: "Assign models to roles" })).toBeTruthy());
  return user;
}

describe("SetupWizard step 1 — assignments", () => {
  beforeEach(() => {
    localStorage.clear();
  });
  afterEach(cleanup);

  it("lists the roles in multi, in the runtime's spelling, and no critic row", async () => {
    mount({ scanned: TWO_LANES(), catalogue: { ollama: ["qwen3:14b"], "llama.cpp": ["qwen3-coder:30b"] } });
    render(<SetupWizard onComplete={vi.fn()} />);
    await assign("multi");

    // `default`, the five roles that had no desktop slot, the two slots that are roles
    // under another name, and `embedding`.
    expect(await screen.findByText("Everything else")).toBeTruthy();
    for (const role of ["architect", "devops", "researcher", "analyst", "verifier"]) {
      expect(screen.getByText(role)).toBeTruthy();
    }
    expect(screen.getByText("Coder")).toBeTruthy();
    expect(screen.getByText("Coordinator")).toBeTruthy();
    // The critic loop is not a Pioneer role, so it gets no row and no implied binding.
    expect(screen.queryByText("Critic")).toBeNull();

    // Today's names, not the proposed rename: CODER_MODEL/DEVOPS_MODEL are unsuffixed
    // until Memex_Core says otherwise, and the separate live ARCHITECT_MODEL must not
    // be shown as architect's binding.
    const envs = screen.getAllByText(/MODEL$/).map((node) => node.textContent);
    expect(envs).toContain("SWARM_ARCHITECT_MODEL");
    expect(envs).toContain("CODER_MODEL");
    expect(envs).toContain("DEVOPS_MODEL");
    expect(envs).not.toContain("SWARM_CODER_MODEL");
    expect(envs).not.toContain("ARCHITECT_MODEL");

    // The two collisions stated where the user is about to act, not in a footnote.
    expect(screen.getByText(/CODER_MODEL for the DevHarness primary too/)).toBeTruthy();
    expect(screen.getByText(/same role as `coordinator`, listed once/)).toBeTruthy();
    // And embedding and `default` say they bind no role.
    expect(screen.getAllByText("not a role binding")).toHaveLength(2);
  });

  it("names the host whose environment still decides an unassigned role", async () => {
    mount({ scanned: TWO_LANES(), catalogue: { ollama: ["qwen3:14b"] } });
    render(<SetupWizard onComplete={vi.fn()} />);
    await assign("multi");

    const host = await screen.findByText(/Unassigned roles stay on/);
    expect(host.textContent).toContain("[::1]:8008");   // the active profile's runtime, not this app
    expect(screen.getByText(/this desktop cannot override them/)).toBeTruthy();
    // D1c invalidated the sentence this test used to assert ("Not on the wire yet: the
    // runtime does not accept a client-supplied role map") and the check stayed green,
    // because it matched only the leading words. Now an assigned role *does* travel as
    // `role_models`, an unassigned one still keeps the host's own defaults, and which
    // host loads a model is still the runtime's choice — asserted together so a stale
    // claim cannot come back disguised as a passing test.
    // Matched on the paragraph itself: the sentence contains an inline
    // <span class="font-mono">role_models</span>, which splits its text across nodes,
    // and the default matcher skips elements that have element children.
    const wire = await screen.findByText(
      (_content, element) => element?.tagName === "P"
        && (element.textContent ?? "").includes("travels to the runtime as"),
    );
    expect(wire.textContent).toContain("stays the runtime's choice");
    expect(wire.textContent).toContain("does not send a lane");
    expect(screen.queryByText(/Not on the wire yet/)).toBeNull();
  });

  it("asks candidates of the id lookup, never of an address", async () => {
    const { lanesAsked, written } = mount({ scanned: TWO_LANES(), catalogue: { ollama: ["qwen3:14b"], "llama.cpp": ["qwen3-coder:30b"] } });
    render(<SetupWizard onComplete={vi.fn()} />);
    const user = await assign("multi");

    await waitFor(() => expect(lanesAsked).toEqual(expect.arrayContaining(["ollama", "llama.cpp"])));
    // Ids, not URLs: that is the whole surface this step has for naming somewhere to
    // fetch, and it is why `engines:modelsFor` resolves against the file.
    expect(lanesAsked.every((lane) => !lane.includes(":") && !lane.includes("/"))).toBe(true);

    // Moving a row to the other lane carries its model with it rather than inventing
    // one — and that lane does not report the model, so the row warns while keeping
    // exactly what it saved.
    await user.selectOptions(await enginePick("researcher"), "llama.cpp");
    await waitFor(() => expect(written[written.length - 1].routing.researcher)
      .toEqual({ engine: "llama.cpp", model: "qwen3:14b" }));
    expect(await screen.findByText(/researcher names qwen3:14b, which llama\.cpp does not report/)).toBeTruthy();
  });

  it("shows no role rows in single, and says assignment is unavailable there", async () => {
    mount({ scanned: TWO_LANES(), catalogue: { ollama: ["qwen3:14b"] } });
    render(<SetupWizard onComplete={vi.fn()} />);
    await assign("single");

    expect(await screen.findByText("Pinned model")).toBeTruthy();
    expect(screen.queryByText("Coder")).toBeNull();
    expect(screen.queryByText("Coordinator")).toBeNull();
    expect(screen.queryByText("Everything else")).toBeNull();
    expect(screen.getByText(/Per-feature assignment is unavailable/)).toBeTruthy();
    // The pin itself is live, not a label standing in for a control.
    expect(screen.getByLabelText("Pinned model")).toBeTruthy();
  });

  it("shows nothing at all when no run style was chosen, and says why that is", async () => {
    const user = userEvent.setup();
    // A table that *could* fill nine rows: one lane and a default, so the only thing
    // keeping this step empty is the placement gate itself.
    const stored: RoutingConfig = {
      runStyle: "multi",
      engines: { ollama: { kind: "ollama", baseUrl: "http://[::1]:11434", label: "Ollama" } },
      routing: { default: { engine: "ollama", model: "qwen3:14b" } },
    };
    mount({ scanned: TWO_LANES(), stored, catalogue: { ollama: ["qwen3:14b"] } });
    render(<SetupWizard onComplete={vi.fn()} />);

    // The Advanced branch reaches step 2 having measured nothing.
    await user.click(await screen.findByRole("button", { name: /Advanced routing profiles/ }));
    await user.click(screen.getByRole("button", { name: "Continue" }));
    await waitFor(() => expect(screen.getByRole("heading", { name: "Assign models to roles" })).toBeTruthy());

    expect(screen.getByText("Choose a run style first.")).toBeTruthy();
    expect(screen.getByText(/reads as/)).toBeTruthy();   // "an empty list would read as no models"
    expect(screen.queryByText("Everything else")).toBeNull();
    expect(screen.queryByText("Coder")).toBeNull();
    expect(screen.queryByText("Pinned model")).toBeNull();
    expect(screen.queryAllByRole("combobox")).toHaveLength(0);   // no dead inputs
  });

  it("warns that a slot names an unreported model, and keeps the value it saved", async () => {
    const stored: RoutingConfig = {
      runStyle: "multi",
      engines: { ollama: { kind: "ollama", baseUrl: "http://[::1]:11434", label: "Ollama" } },
      routing: {
        default: { engine: "ollama", model: "qwen3:14b" },
        researcher: { engine: "ollama", model: "llama-experimental:7b" },
      },
    };
    mount({ scanned: TWO_LANES(), stored, catalogue: { ollama: ["qwen3:14b"] } });
    render(<SetupWizard onComplete={vi.fn()} />);
    const user = await assign("multi");

    // It was saved — the file holds it — and the row says the lane does not report it.
    const pick = await modelPick("researcher");
    expect(pick.value).toBe("llama-experimental:7b");
    expect(screen.getByText(/does not report/)).toBeTruthy();
    // With no node report read, the row keeps only the claim this app can support — the
    // lane does not have it — and says nothing about hosts it never asked.
    expect(screen.getByText(/will fail until that model exists on the lane/)).toBeTruthy();
    expect(pick.disabled).toBe(false);

    // Choosing a reported model clears the reason, because the row is derived from the
    // table the write returned.
    await user.selectOptions(pick, "qwen3:14b");
    await waitFor(() => expect(screen.queryByText(/does not report/)).toBeNull());
    expect((await modelPick("researcher")).value).toBe("qwen3:14b");
  });

  /** D5 — a node report in the shape the orchestrator actually answers, with the
   * `vram_mb: null` it really returns today. */
  function topology(modelsByHost: Record<string, string[]>): RuntimeTopology {
    return {
      checkedAt: "2026-09-26T00:00:00.000Z",
      reason: null,
      nodes: Object.entries(modelsByHost).map(([name, availableModels]) => ({
        name, host: `http://${name.toLowerCase()}:11434`, healthy: true, vramMb: null,
        vramSource: "unknown", loadedModels: [], availableModels,
      })),
    };
  }

  const UNREPORTED_ROW: RoutingConfig = {
    runStyle: "multi",
    engines: { ollama: { kind: "ollama", baseUrl: "http://[::1]:11434", label: "Ollama" } },
    routing: {
      default: { engine: "ollama", model: "qwen3:14b" },
      researcher: { engine: "ollama", model: "llama-experimental:7b" },
    },
  };

  it("stops predicting failure for a model a reported host actually holds", async () => {
    mount({
      scanned: TWO_LANES(), stored: UNREPORTED_ROW, catalogue: { ollama: ["qwen3:14b"] },
      runtime: { nodes: async () => topology({ Lovelace: ["llama-experimental:7b", "qwen3:14b"], Turing: ["phi4-mini:latest"] }) },
    });
    render(<SetupWizard onComplete={vi.fn()} />);
    await assign("multi");

    // The lane still does not report it — that stays said — but "will fail" was this
    // app overreaching: the runtime resolves a host from the model, so a lane that
    // lacks it is not where it necessarily loads.
    expect(await screen.findByText(/which ollama does not report/)).toBeTruthy();
    const line = await screen.findByText(/the runtime reports it on Lovelace/);
    expect(line.textContent).toContain("not necessarily where it loads");
    expect(screen.queryByText(/will fail until that model exists on the lane/)).toBeNull();
  });

  it("says plainly when every reported host was asked and none holds it", async () => {
    mount({
      scanned: TWO_LANES(), stored: UNREPORTED_ROW, catalogue: { ollama: ["qwen3:14b"] },
      runtime: { nodes: async () => topology({ Lovelace: ["qwen3:14b"], Turing: ["phi4-mini:latest"] }) },
    });
    render(<SetupWizard onComplete={vi.fn()} />);
    await assign("multi");

    const line = await screen.findByText(/no host the runtime reports holds it either/);
    expect(line.textContent).toContain("does not report");
    // Stated, not gated: D3a-2's rule outranks my own acceptance criterion — an
    // unlisted tag is frequently one the user is about to pull.
    expect((await modelPick("researcher")).disabled).toBe(false);
    expect((await modelPick("researcher")).value).toBe("llama-experimental:7b");
  });

  it("treats an unread node report as unknown, keeping the lane-only sentence", async () => {
    mount({
      scanned: TWO_LANES(), stored: UNREPORTED_ROW, catalogue: { ollama: ["qwen3:14b"] },
      runtime: { nodes: async () => ({ checkedAt: "", reason: "Could not read the runtime's node report.", nodes: [] }) },
    });
    render(<SetupWizard onComplete={vi.fn()} />);
    await assign("multi");

    expect(await screen.findByText(/does not report/)).toBeTruthy();
    expect(screen.getByText(/will fail until that model exists on the lane/)).toBeTruthy();
    expect(screen.queryByText(/no host the runtime reports/)).toBeNull();
    expect(screen.queryByText(/the runtime reports it on/)).toBeNull();
  });

  it("accumulates role writes and carries a hand-written slot through them, with no row for it", async () => {
    const stored: RoutingConfig = {
      runStyle: "multi",
      engines: { "ollama-local": { kind: "ollama", baseUrl: "http://192.168.1.9:11434", label: "Studio box" } },
      routing: {
        default: { engine: "ollama-local", model: "qwen3:14b" },
        "collective.critic": { engine: "ollama-local", model: "deepseek-r1:32b" },
      },
    };
    const { written } = mount({
      scanned: inspection(), stored,
      catalogue: { "ollama-local": ["qwen3:14b", "qwen3.8:27b", "deepseek-r1:32b"] },
    });
    render(<SetupWizard onComplete={vi.fn()} />);
    const user = await assign("multi");

    expect(screen.queryByText("Critic")).toBeNull();      // no row offered for it
    await user.selectOptions(await modelPick("researcher"), "qwen3.8:27b");
    await user.selectOptions(await modelPick("verifier"), "deepseek-r1:32b");

    // The second write has to land on top of the first, not instead of it.
    await waitFor(() => expect(written.length).toBe(3));
    expect(written[2]).toEqual({
      runStyle: "multi",
      engines: { "ollama-local": { kind: "ollama", baseUrl: "http://[::1]:11434", label: "Ollama" } },
      routing: {
        default: { engine: "ollama-local", model: "qwen3:14b" },
        "collective.critic": { engine: "ollama-local", model: "deepseek-r1:32b" },
        researcher: { engine: "ollama-local", model: "qwen3.8:27b" },
        verifier: { engine: "ollama-local", model: "deepseek-r1:32b" },
      },
    });
    expect(validateRouting(written[2])).toEqual([]);
    // And the rows read back what the file now holds, not what they fell back to.
    expect((await modelPick("verifier")).value).toBe("deepseek-r1:32b");
    expect(screen.getByText("Set in routing.verifier.")).toBeTruthy();
  });

  it("reads the table back from the write, because saveRouting broadcasts nothing", async () => {
    const { written, storeReads } = mount({ scanned: TWO_LANES(), catalogue: { ollama: ["qwen3:14b", "qwen3.8:27b"] } });
    render(<SetupWizard onComplete={vi.fn()} />);
    const user = await assign("multi");

    const readsAfterSetup = storeReads();
    await user.selectOptions(await modelPick("devops"), "qwen3.8:27b");
    await waitFor(() => expect(written.length).toBe(2));
    expect(storeReads()).toBe(readsAfterSetup);            // no re-read of the store

    // The row shows what the write returned, not what routing:get still answers.
    await waitFor(async () => expect((await modelPick("devops")).value).toBe("qwen3.8:27b"));
    // Candidates came from the lane, and the unassigned rows say they are falling back.
    expect(optionValues(await modelPick("verifier"))).toContain("qwen3:14b");
    expect(screen.getByText("Falling back to routing.default — nothing sets verifier yet.")).toBeTruthy();
  });

  it("surfaces a refused role write by its path instead of reporting a change", async () => {
    const { storeReads } = mount({
      scanned: TWO_LANES(),
      catalogue: { ollama: ["qwen3:14b", "ghost:1b"] },
      routeSet: (next): RoutingResult => (
        next.routing.devops
          ? { ok: false, routing: next, issues: [{ path: "routing.devops.model", message: "ghost:1b is not a tag this build can resolve" }] }
          : { ok: true, routing: next, issues: [] }
      ),
    });
    render(<SetupWizard onComplete={vi.fn()} />);
    const user = await assign("multi");

    const reads = storeReads();
    await user.selectOptions(await modelPick("devops"), "ghost:1b");
    expect(await screen.findByText(/routing\.devops\.model: ghost:1b/)).toBeTruthy();
    // Refused, so the row keeps answering from the table the file holds — and the step
    // did not go and re-read the store to find that out.
    await waitFor(async () => expect((await modelPick("devops")).value).toBe("qwen3:14b"));
    expect(storeReads()).toBe(reads);
  });

  // D4 — a role row must say what its model cannot do, in the row itself, and must
  // still accept the assignment. The capability arrays are the ones measured from
  // `POST /api/show` on this machine (electron/model-capabilities.ts, header).
  const MEASURED: Record<string, string[]> = {
    "qwen3:14b": ["completion", "tools", "thinking"],
    "nomic-embed-text:latest": ["embedding"],
    "minicpm-v:latest": ["completion", "vision"],
  };
  const MEASURED_CTX: Record<string, number> = {
    "qwen3:14b": 40960, "nomic-embed-text:latest": 2048, "minicpm-v:latest": 32768,
  };
  const measured = async ({ model }: { id: string; model: string }): Promise<CapabilityReport> => ({
    capabilities: MEASURED[model] ?? [],
    source: MEASURED[model] ? "reported" : "unknown",
    contextLength: MEASURED_CTX[model] ?? null,
    detail: MEASURED[model] ? `/api/show reported: ${MEASURED[model].join(", ")}` : "fixture: /api/show did not answer",
  });
  const THREE_MODELS = ["qwen3:14b", "nomic-embed-text:latest", "minicpm-v:latest"];

  it("names the missing capability on the embedding row, and says nothing on a row the model does satisfy", async () => {
    mount({ scanned: TWO_LANES(), catalogue: { ollama: THREE_MODELS, "llama.cpp": [] }, capabilities: measured });
    render(<SetupWizard onComplete={vi.fn()} />);
    await assign("multi");   // routing.default = qwen3:14b, which every unfilled row falls back to

    // qwen3:14b reports completion/tools/thinking — never `embedding`. EMBED_MODEL is
    // what this row writes, so the row has to say so rather than look satisfied. One
    // paragraph in the whole step, and it is that row's.
    const paragraph = await waitFor(() => {
      const nodes = document.querySelectorAll("p[data-capability='missing']");
      expect(nodes.length).toBe(1);
      return nodes[0] as HTMLElement;
    });
    expect(paragraph.textContent).toMatch(/needs embedding/);
    expect(paragraph.textContent).toMatch(/reports completion, thinking, tools/);
    // The Coder row stays quiet — this model does report tools. The only other mark in
    // the step is the researcher row's, and it is an admission, not a verdict: how many
    // perspectives answer at once is a property of the machine, not of a model.
    expect(document.querySelectorAll("p[data-capability='missing']")).toHaveLength(1);
    const unknowns = document.querySelectorAll("p[data-capability='unknown']");
    expect(unknowns).toHaveLength(1);
    expect(unknowns[0].textContent).toMatch(/Research \/ Perspectives/);
    expect(unknowns[0].textContent).toMatch(/lanes/);
    expect(unknowns[0].textContent).toMatch(/Not assumed either way/);

    // The dropdown marks each candidate too, so the limit shows before the choice
    // rather than after it. `option.value` stays the bare tag; only the label carries it.
    const coder = await modelPick("Coder");
    const labels = [...coder.options].map((option) => option.text);
    expect(labels).toContain("minicpm-v:latest — needs tools");
    expect(labels).toContain("nomic-embed-text:latest — needs tools");
    // The hint is the row's own requirement, so the same model reads differently on a
    // different row — the embedder lacks `tools` here and `completion` on `default`.
    expect(labels.some((text) => text.startsWith("qwen3:14b —"))).toBe(false);
    const embeddings = await modelPick("Embeddings");
    expect([...embeddings.options].map((option) => option.text)).toContain("qwen3:14b — needs embedding");
  });

  it("states that an assigned vision model has no tools, and still writes the row", async () => {
    const { written } = mount({
      scanned: TWO_LANES(), catalogue: { ollama: THREE_MODELS, "llama.cpp": [] }, capabilities: measured,
    });
    render(<SetupWizard onComplete={vi.fn()} />);
    const user = await assign("multi");

    const coder = await modelPick("Coder");
    await user.selectOptions(coder, "minicpm-v:latest");

    // minicpm-v really is a completion model — and it really does not report tools, so
    // it cannot drive the DevHarness round-trips this row is for.
    const marked = await waitFor(() => {
      const node = document.querySelector("p[data-capability='missing']");
      expect(node).not.toBeNull();
      return node as HTMLElement;
    });
    expect(marked.textContent).toMatch(/Code \/ DevHarness/);
    expect(marked.textContent).toMatch(/needs tools; this model reports completion, vision/);
    // Stated, not blocked: the assignment landed, and the control is not disabled.
    await waitFor(() => expect(written.length).toBe(2));
    expect(written[1].routing.code).toEqual({ engine: "ollama", model: "minicpm-v:latest" });
    expect((await modelPick("Coder")).disabled).toBe(false);
  });

  it("says it cannot verify when the lane reports nothing about a model", async () => {
    mount({
      scanned: TWO_LANES(),
      catalogue: { ollama: THREE_MODELS, "llama.cpp": [] },
      capabilities: async () => ({ capabilities: [], source: "unknown", contextLength: null, detail: "/props reports no capability list" }),
    });
    render(<SetupWizard onComplete={vi.fn()} />);
    await assign("multi");

    const unknowns = await waitFor(() => {
      const nodes = document.querySelectorAll("[data-capability='unknown']");
      expect(nodes.length).toBeGreaterThan(0);
      return nodes;
    });
    expect(unknowns[0].textContent).toMatch(/cannot verify/);
    expect(unknowns[0].textContent).toMatch(/Not assumed either way/);
    // An engine that stayed silent is never rendered as a model that fails a check.
    expect(document.querySelectorAll("[data-capability='missing']").length).toBe(0);
  });

  it("carries no verdict at all on a preload older than the matrix — which is not a pass either", async () => {
    mount({ scanned: TWO_LANES(), catalogue: { ollama: THREE_MODELS, "llama.cpp": [] } });
    render(<SetupWizard onComplete={vi.fn()} />);
    await assign("multi");
    await modelPick("Coder");   // the step is up and its rows are filled
    expect(document.querySelectorAll("[data-capability]").length).toBe(0);
  });

  // D2's last sentence, landed: where the engine cannot say, the capability is a
  // user-editable field on the routing entry. These three are the whole contract that
  // makes the field safe — it is used only in the engine's absence, it never outranks an
  // answer, and a contradiction is shown rather than swallowed.
  /** One lane, and the Coder row written by hand. `code` rather than `default`, because
   * setup replaces `default` and carries hand-written slots through untouched. */
  const storedWithCoder = (model: string, capabilities?: string[]): RoutingConfig => ({
    runStyle: "multi",
    engines: { ollama: { kind: "ollama", baseUrl: "http://[::1]:11434", label: "Ollama" } },
    routing: {
      default: { engine: "ollama", model: "qwen3:14b" },
      code: { engine: "ollama", model, ...(capabilities ? { capabilities } : {}) },
    },
  });
  const SILENT_ANYWAY = async (): Promise<CapabilityReport> => ({
    capabilities: [], source: "unknown", contextLength: null,
    detail: "/api/show reported no capabilities array (older engine, or a model it cannot describe)",
  });

  it("writes an asserted capability into the routing entry, so a silent engine stops being the last word", async () => {
    // No `capabilities` on the bridge at all: nothing can be asked, and every row reads
    // "cannot verify" with nothing the user can do about it. That is the state this
    // control exists to end.
    const { written } = mount({ scanned: TWO_LANES(), catalogue: { ollama: THREE_MODELS, "llama.cpp": [] } });
    render(<SetupWizard onComplete={vi.fn()} />);
    const user = await assign("multi");

    await openCapabilities(user, "Embeddings");
    const toggle = await screen.findByRole("button", { name: "Embeddings capability embedding" });
    expect(toggle.getAttribute("aria-pressed")).toBe("false");
    await user.click(toggle);

    await waitFor(() => expect(written.length).toBe(2));
    expect(written[1].routing.embedding).toEqual({ engine: "ollama", model: "qwen3:14b", capabilities: ["embedding"] });
    // It is a valid write: the assertion goes through the same validator as every other
    // field, so config.json holds exactly what the click means.
    expect(validateRouting(written[1])).toEqual([]);
    expect((await modelPick("Embeddings")).value).toBe("qwen3:14b");   // the row kept its model
    // The row reads back what the write returned, so the control is on the file's state
    // rather than on a click it just handled.
    expect((await screen.findByRole("button", { name: "Embeddings capability embedding" })).getAttribute("aria-pressed")).toBe("true");
  });

  it("says a check came from the routing file when the engine never answered, not from the engine", async () => {
    mount({
      scanned: TWO_LANES(),
      stored: storedWithCoder("qwen3:14b", ["tools"]),
      catalogue: { ollama: THREE_MODELS, "llama.cpp": [] },
      capabilities: SILENT_ANYWAY,
    });
    render(<SetupWizard onComplete={vi.fn()} />);
    const user = await assign("multi");
    await openCapabilities(user, "Coder");

    const node = await waitFor(() => {
      const found = document.querySelector("p[data-capability='asserted']");
      expect(found).not.toBeNull();
      return found as HTMLElement;
    });
    // "The file says it can" and "the engine says it can" are different claims, so the
    // row says which one it is standing on, names the field, and quotes the engine's
    // silence as the reason.
    expect(node.textContent).toContain("routing.code.capabilities");
    expect(node.textContent).toContain("your assertion, not the engine's answer");
    expect(node.textContent).toContain("/api/show reported no capabilities array");
    // The assertion cleared the dead end on its own row and nowhere else: a row it does
    // not reach still says it cannot verify, rather than inheriting someone else's claim.
    expect(node.textContent).not.toContain("cannot verify — the engine did not answer");
    expect(screen.getAllByText(/cannot verify/).length).toBeGreaterThan(1);
    expect((await screen.findByRole("button", { name: "Coder capability tools" })).getAttribute("aria-pressed")).toBe("true");
  });

  it("keeps the engine's refusal standing beside a contradicting assertion, and names the engine's report", async () => {
    mount({
      scanned: TWO_LANES(),
      // nomic-embed-text is `["embedding"]` with no `tools`, measured. Asserting `tools`
      // on it is allowed and stays written; believing it is not.
      stored: storedWithCoder("nomic-embed-text:latest", ["tools"]),
      catalogue: { ollama: THREE_MODELS, "llama.cpp": [] },
      capabilities: measured,
    });
    render(<SetupWizard onComplete={vi.fn()} />);
    const user = await assign("multi");
    await openCapabilities(user, "Coder");

    // The refusal is still there — the override did not make it disappear.
    const refusal = await waitFor(() => {
      const found = [...document.querySelectorAll("p[data-capability='missing']")]
        .find((node) => node.textContent?.includes("Code / DevHarness"));
      expect(found).not.toBeUndefined();
      return found as HTMLElement;
    });
    expect(refusal.textContent).toContain("needs tools");
    expect(refusal.textContent).toContain("this model reports embedding");

    // …and beside it, the contradiction, in the engine's own words, with the user's entry
    // left as they wrote it.
    const notice = screen.getByText(/the engine's own answer is different/);
    expect(notice.textContent).toContain("the routing entry asserts tools");
    expect(notice.textContent).toContain("/api/show reported: embedding");
    expect(notice.getAttribute("data-capability")).toBe("disagreement");
    expect((await screen.findByRole("button", { name: "Coder capability tools" })).getAttribute("aria-pressed")).toBe("true");
  });
});

// ---------------------------------------------------------------------------
// Disclosures — the collapsed state is the design, so it gets asserted as such.
// ---------------------------------------------------------------------------

/** The line a collapsed engine row is meant to be: one flex row, verdict, count and
 * address sharing it. jsdom cannot measure pixels, but it can prove the parts were not
 * stacked into separate blocks, which is what made the step a scroll. */
const expectOneLine = (label: string, ...tokens: string[]) => {
  const line = screen.getByText(label).parentElement as HTMLElement;
  expect(line.className).toContain("flex");
  for (const token of tokens) expect(screen.getByText(token).parentElement).toBe(line);
};

/** The step's one required input, counted rather than admired: a disclosure that
 * collapsed a control into the page instead of hiding text would break the tests that
 * do `getByRole("combobox")`, and this says which it did. */
const expectOneSelect = () => {
  expect(screen.getAllByRole("combobox")).toHaveLength(1);
};

describe("SetupWizard disclosures", () => {
  beforeEach(() => {
    localStorage.clear();
  });
  afterEach(cleanup);

  it("shows step 1 with the proof collapsed, and everything needed to answer present", async () => {
    const user = userEvent.setup();
    mount();
    render(<SetupWizard onComplete={vi.fn()} />);

    // Two engine lines, each carrying its own verdict, model count and address.
    expect(await screen.findByText("running")).toBeTruthy();
    expectOneLine("Ollama", "running", "2 models", "http://[::1]:11434");
    expectOneLine("llama.cpp", "not installed · configurable");

    // What is behind a disclosure: the evidence, both trade-off paragraphs, the service
    // addresses and the service probes. All four were most of one scroll.
    expect(screen.queryByText(OLLAMA_UP.evidence)).toBeNull();
    expect(screen.queryByText(LLAMA_QUIET.evidence)).toBeNull();
    expect(screen.queryByText(/loads and evicts a model per role/)).toBeNull();
    expect(screen.queryByText(/One model pinned to one GPU/)).toBeNull();
    expect(screen.queryByLabelText("Memory service (no default)")).toBeNull();
    expect(screen.queryByLabelText("ComfyUI (optional)")).toBeNull();
    expect(screen.queryByText("Local Memex harness")).toBeNull();
    expect(screen.queryByText("ComfyUI")).toBeNull();
    for (const name of ["Ollama evidence", "llama.cpp evidence", "Show what this costs",
      "Show what this locks in", "Advanced: edit service addresses"]) {
      expect(screen.getByRole("button", { name }).getAttribute("aria-expanded")).toBe("false");
    }

    // What stays visible unconditionally: the proposal and the reason for it, the file's
    // own answer, the fact that nothing is selected yet, and the one input the step
    // requires. The unset memory service is visible too — a missing service changes what
    // the features do, so it belongs behind no toggle.
    expect(screen.getByText("Run style · proposed: multi-model")).toBeTruthy();
    expect(screen.getByText(/2 cards totalling 31.8 GB/)).toBeTruthy();
    expect(screen.getByText(/config\.json already holds runStyle "multi"/)).toBeTruthy();
    expect(screen.getByText("Nothing is selected until you choose — this app will not pick a mode for you.")).toBeTruthy();
    expect(screen.getByText(/No memory service is configured/)).toBeTruthy();
    expectOneSelect();

    // …and the preview, as soon as an answer is given, without opening anything.
    await user.click(await styleButton(/Multi-model/));
    expect(await screen.findByText(/"runStyle": "multi"/)).toBeTruthy();
    expectOneSelect();
  });

  it("opens each disclosure to the words themselves, not to a shorter version of them", async () => {
    const user = userEvent.setup();
    mount();
    render(<SetupWizard onComplete={vi.fn()} />);
    await screen.findByText("running");

    await user.click(screen.getByRole("button", { name: "Ollama evidence" }));
    expect(await screen.findByText(OLLAMA_UP.evidence)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Ollama evidence" }).getAttribute("aria-expanded")).toBe("true");
    // The quiet lane keeps its own shut disclosure: opening one row does not speak for
    // the other, and "not installed · configurable" is still the visible claim.
    expect(screen.queryByText(LLAMA_QUIET.evidence)).toBeNull();
    expect(screen.getByRole("button", { name: "llama.cpp evidence" }).getAttribute("aria-expanded")).toBe("false");

    await user.click(screen.getByRole("button", { name: "Show what this costs" }));
    const costs = await screen.findByText(/loads and evicts a model per role/);
    // Pinned at both ends: the paragraph is quoted, not summarised.
    expect(costs.textContent).toMatch(/^Ollama loads and evicts a model per role/);
    expect(costs.textContent).toMatch(/per-role variety needs\.$/);

    await user.click(screen.getByRole("button", { name: "Show what this locks in" }));
    const locks = await screen.findByText(/One model pinned to one GPU/);
    expect(locks.textContent).toMatch(/^One model pinned to one GPU/);
    expect(locks.textContent).toMatch(/without room for two\.$/);

    await user.click(screen.getByRole("button", { name: "Advanced: edit service addresses" }));
    for (const label of ["Memex harness", "Memory service (no default)", "Ollama",
      "llama.cpp / llama-server (optional)", "Open WebUI (optional)", "ComfyUI (optional)"]) {
      expect(screen.getByLabelText(label)).toBeTruthy();
    }
    expect(screen.getByText("Local Memex harness")).toBeTruthy();
    expect(screen.getByText("Open WebUI")).toBeTruthy();
    expect(screen.getByText("ComfyUI")).toBeTruthy();
    expect(screen.getByText(/Ollama supplies models/)).toBeTruthy();
  });

  it("keeps a role row a select until its capabilities are asked for, and the click writes what it always wrote", async () => {
    // A lane that will not answer about a model: the row states that, and the chips are
    // what the user can do about it — so the verdict is visible while the control is not.
    const silent = async (): Promise<CapabilityReport> => ({
      capabilities: [], source: "unknown", contextLength: null,
      detail: "/api/show reported no capabilities array (older engine, or a model it cannot describe)",
    });
    const { written } = mount({
      scanned: TWO_LANES(), catalogue: { ollama: ["qwen3:14b"], "llama.cpp": [] }, capabilities: silent,
    });
    render(<SetupWizard onComplete={vi.fn()} />);
    const user = await assign("multi");
    await modelPick("Embeddings");   // the row is up and filled

    // A row is its two picks and nothing more: the disclosure hides controls, so an
    // uncounted one would let a fifth select in unnoticed.
    expect(screen.getAllByRole("combobox")).toHaveLength(ROUTING_ROWS.length * 2);
    expect(document.querySelectorAll("[data-capability='unknown']").length).toBeGreaterThan(0);
    // Collapsed: no chips, no field name, and the toggle says so.
    expect(screen.queryByRole("button", { name: "Embeddings capability embedding" })).toBeNull();
    expect(screen.queryByText("routing.embedding.capabilities")).toBeNull();
    expect(screen.getByRole("button", { name: "Embeddings capabilities" }).getAttribute("aria-expanded")).toBe("false");

    await openCapabilities(user, "Embeddings");
    expect(screen.getByText("routing.embedding.capabilities")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Embeddings capabilities" }).getAttribute("aria-expanded")).toBe("true");
    const chip = await screen.findByRole("button", { name: "Embeddings capability embedding" });
    expect(chip.getAttribute("aria-pressed")).toBe("false");
    await user.click(chip);

    await waitFor(() => expect(written.length).toBe(2));
    expect(written[1].routing.embedding).toEqual({ engine: "ollama", model: "qwen3:14b", capabilities: ["embedding"] });
    expect(validateRouting(written[1])).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// The lockout. Setup is `fixed inset-0 z-50`: while it is open there is nothing else to
// reach, so a control below the fold is not an inconvenience — it is the app being
// unenterable. jsdom has no viewport, so these assert presence, enabled-ness and which
// layer owns the scroll. Geometry is untested here and needs the packaged app.
// ---------------------------------------------------------------------------

describe("SetupWizard — nothing out of reach", () => {
  beforeEach(() => {
    localStorage.clear();
  });
  afterEach(cleanup);

  it("puts the scroll on the modal layer and keeps the card out of a height contest", () => {
    mount();
    render(<SetupWizard onComplete={vi.fn()} />);

    const layer = document.querySelector("div.fixed.inset-0") as HTMLElement;
    expect(layer.className).toContain("overflow-y-auto");   // the backstop
    expect(layer.className).toContain("items-start");       // so a tall card starts at the top
    expect(layer.className).not.toContain("items-center");  // centring overflow is what hid the bottom

    const card = layer.querySelector("div.no-drag") as HTMLElement;
    expect(card.className).toContain("my-auto");            // …and it still centres when there is room
    // CSS resolves min-height before max-height, so the old 520px floor beat the card's
    // own viewport ceiling and it grew past the thing meant to bound it. Neither a floor
    // nor a ceiling belongs on the card now — the outer scroller is what stops the trap.
    expect(card.className).not.toMatch(/min-h-/);
    expect(card.className).not.toMatch(/max-h-/);

    // The invariant, stated as ancestry rather than arithmetic: the control the user has
    // to press is inside the layer that can scroll to it.
    expect(layer.contains(confirm())).toBe(true);
  });

  it("has the Confirm control in the DOM at every content length, and unlocks it only on the answer", async () => {
    const { written } = mount();
    const user = userEvent.setup();
    render(<SetupWizard onComplete={vi.fn()} />);

    // Longest content the step holds before anything is chosen. The control is present,
    // and it is disabled because the run style is the user's to give — not because it is
    // out of sight.
    expect(await screen.findByText("running")).toBeTruthy();
    expect(confirm()).toBeTruthy();
    expect(confirm().disabled).toBe(true);

    await user.click(await styleButton(/Multi-model/));
    expect(confirm().disabled).toBe(false);
    await user.click(confirm());

    // The assignment step is the long one — nine rows — and its control is in the DOM the
    // moment it is the step on screen.
    await waitFor(() => expect(written).toHaveLength(1));
    expect(await screen.findByRole("heading", { name: "Assign models to roles" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Continue" })).toBeTruthy();
    expect(document.querySelector("div.fixed.inset-0")!.contains(screen.getByRole("button", { name: "Continue" }))).toBe(true);
  });
});
