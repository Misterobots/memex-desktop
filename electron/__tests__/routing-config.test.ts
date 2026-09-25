import { describe, expect, it } from "vitest";
import {
  DEFAULT_OLLAMA_BASE_URL,
  DEFAULT_SLOT,
  ROUTING_ROWS,
  RUNE_ROLES,
  RUNE_ROLE_ENV,
  UNPRESENTED_ROWS,
  deriveRoutingFromProfile,
  deriveRoutingFromSetup,
  flattenForRunStyle,
  migrateToRouting,
  pinnedTarget,
  proposeRunStyle,
  readRoutingBlock,
  resolveRoute,
  roleTarget,
  runRoleMap,
  validateRouting,
  type RoutingConfig,
  type RoutingRow,
  type RuneRole,
  type EngineConfig,
} from "../routing-config";

/** D2's example table, the shape the user is told to write. */
const D2: RoutingConfig = {
  runStyle: "multi",
  engines: {
    "ollama-local": { kind: "ollama", baseUrl: "http://[::1]:11434" },
    "llama-local":  { kind: "llama.cpp", baseUrl: "http://127.0.0.1:8080", pinnedModel: "qwen3-coder:30b" },
  },
  routing: {
    [DEFAULT_SLOT]:              { engine: "ollama-local", model: "qwen3:14b" },
    "code":                      { engine: "ollama-local", model: "qwen3.8:27b" },
    "collective.coordinator":    { engine: "ollama-local", model: "qwen3.8:27b" },
    "collective.critic":         { engine: "ollama-local", model: "qwen3:14b" },
    "embedding":                 { engine: "ollama-local", model: "nomic-embed-text:latest" },
  },
};

/** The same box, run as one pinned model. */
const SINGLE = (routing: RoutingConfig["routing"]): RoutingConfig => ({
  runStyle: "single",
  engines: { "llama-local": { kind: "llama.cpp", baseUrl: "http://127.0.0.1:8080", pinnedModel: "qwen3-coder:30b" } },
  routing,
});

const paths = (issues: ReturnType<typeof validateRouting>) => issues.map((i) => i.path);

describe("resolving a slot", () => {
  it("answers a slot the table names, and says it did not fall back", () => {
    const route = resolveRoute(D2, "code");
    expect(route).toEqual({ requested: "code", slot: "code", target: D2.routing.code, usedFallback: false });
  });

  it("falls back to routing.default and reports that it did, plus the slot that answered", () => {
    // A box with no critic entry still has to say *which* model the critic gets:
    // the point of the fallback chain being observable is that the UI can name the
    // origin instead of presenting default's model as if it were picked for this.
    const table = { ...D2, routing: { default: D2.routing.default, code: D2.routing.code } };
    const route = resolveRoute(table, "collective.critic");
    expect(route.slot).toBe("default");
    expect(route.usedFallback).toBe(true);
    expect(route.target).toEqual({ engine: "ollama-local", model: "qwen3:14b" });
  });

  it("resolves to nothing when neither the slot nor the fallback exists", () => {
    // D2's own table has a default, so asking it for a slot it never named is the
    // fallback case above. Without a default entry there is no answer at all, and
    // `slot: null` is what lets the UI say so instead of showing a stale model.
    const noDefault = { ...D2, routing: { code: D2.routing.code } };
    expect(resolveRoute(noDefault, "image")).toEqual({
      requested: "image", slot: null, target: null, usedFallback: false,
    });
  });

  it("tolerates a table that is absent altogether", () => {
    expect(resolveRoute(null, DEFAULT_SLOT).target).toBeNull();
    expect(resolveRoute(undefined, "code").usedFallback).toBe(false);
  });
});

describe("validating a hand-edited table", () => {
  it("accepts D2's example, dotted slot names and all", () => {
    expect(validateRouting(D2)).toEqual([]);
  });

  it("rejects a slot naming an engine that is not in engines, by path", () => {
    const broken = structuredClone(D2);
    broken.routing.code = { engine: "ollma-loca", model: "qwen3.8:27b" };
    const issues = validateRouting(broken);
    expect(paths(issues)).toEqual(["routing.code.engine"]);
    // Names the offender and the alternatives: the file is open in an editor, and a
    // message that cannot be matched to a line is a second read of the whole thing.
    expect(issues[0].message).toContain('"ollma-loca"');
    expect(issues[0].message).toContain("ollama-local");
    expect(issues[0].message).toContain("llama-local");
  });

  it("rejects a runStyle outside the two values", () => {
    expect(paths(validateRouting({ ...D2, runStyle: "swarm" as RoutingConfig["runStyle"] }))).toEqual(["runStyle"]);
    expect(paths(validateRouting({ engines: D2.engines, routing: D2.routing }))).toEqual(["runStyle"]);
  });

  it("rejects an empty or non-http baseUrl, and a blank one that only looks present", () => {
    const broken = structuredClone(D2);
    broken.engines["ollama-local"].baseUrl = "  ";
    broken.engines["llama-local"].baseUrl = "ftp://router:21/api";
    const issues = validateRouting(broken);
    expect(paths(issues).sort()).toEqual(["engines.llama-local.baseUrl", "engines.ollama-local.baseUrl"]);
    expect(issues.find((i) => i.path === "engines.ollama-local.baseUrl")!.message).toContain("empty");
  });

  it("rejects a slot target with no model", () => {
    const broken = structuredClone(D2);
    broken.routing["collective.critic"] = { engine: "ollama-local", model: "  " };
    expect(paths(validateRouting(broken))).toEqual(["routing.collective.critic.model"]);
  });

  it("rejects a kind this build cannot speak, rather than discovering nothing forever", () => {
    const broken = structuredClone(D2);
    broken.engines["llama-local"].kind = "trt-llm" as EngineConfig["kind"];
    expect(paths(validateRouting(broken))).toEqual(["engines.llama-local.kind"]);
  });

  it("reports every problem at once, one path each", () => {
    // One pass with all the paths, because the alternative — fix, reload, discover
    // the next error — is one restart per typo in a file meant to be edited freely.
    const issues = validateRouting({
      runStyle: "both",
      engines: {
        good:  { kind: "ollama", baseUrl: "http://[::1]:11434" },
        bad:   { kind: "ollama", baseUrl: "localhost:11434" },
      },
      routing: {
        [DEFAULT_SLOT]: { engine: "nope", model: "" },
        code:           "qwen3:14b" as unknown as RoutingConfig["routing"]["code"],
      },
    });
    expect(paths(issues).sort()).toEqual([
      "engines.bad.baseUrl", "routing.code", "routing.default.engine", "routing.default.model", "runStyle",
    ]);
  });

  it("judges the shape it was handed, not the shape it wishes it had", () => {
    expect(paths(validateRouting(null))).toEqual(["(root)"]);
    expect(paths(validateRouting("http://[::1]:11434"))).toEqual(["(root)"]);
    expect(paths(validateRouting([]))).toEqual(["(root)"]);
    expect(paths(validateRouting({ runStyle: "multi", engines: [], routing: {} }))).toEqual(["engines"]);
  });

  it("keeps the usable view from hiding a nonsense table from the validator", () => {
    // `readRoutingBlock` stands in a default for anything it cannot read, so callers
    // always hold a RoutingConfig — which is exactly why the validator must be given
    // the stored keys as written, not that filled-in copy.
    const candidate = { runStyle: "multi", engines: {}, routing: "qwen3:8b" };
    expect(paths(validateRouting(candidate))).toEqual(["routing"]);
    expect(readRoutingBlock(candidate)!.routing).toEqual({});
  });

  it("leaves an unrecognised slot name alone, because the slot set is open", () => {
    // D2's example lists five slots, its prose names more (research, image); a
    // slot this build does not consume yet must not be an error in the user's file.
    expect(validateRouting({ ...D2, routing: { ...D2.routing, image: { engine: "ollama-local", model: "qwen2.5-vl:7b" } } }))
      .toEqual([]);
  });

  it("rejects a single-style box with nothing to pin", () => {
    const unpinnable = {
      runStyle: "single" as const,
      engines: { a: { kind: "ollama" as const, baseUrl: "http://127.0.0.1:11434" }, b: { kind: "ollama" as const, baseUrl: "http://127.0.0.1:11435" } },
      routing: {},
    };
    expect(paths(validateRouting(unpinnable))).toEqual(["runStyle"]);

    // One engine, so the engine is unambiguous — but its model was never declared,
    // and a pin invented here is a model the user did not choose.
    const noPin: RoutingConfig = {
      runStyle: "single",
      engines: { "llama-local": { kind: "llama.cpp", baseUrl: "http://127.0.0.1:8080" } },
      routing: {},
    };
    expect(paths(validateRouting(noPin))).toEqual(["engines.llama-local.pinnedModel"]);
    expect(validateRouting(noPin)[0].message).toContain("single");
  });
});

describe("asserting a capability the engine would not confirm", () => {
  /** One slot's entry, rewritten. */
  const withCapabilities = (capabilities: unknown) => ({
    ...D2,
    routing: { ...D2.routing, embedding: { engine: "ollama-local", model: "nomic-embed-text:latest", capabilities } },
  });

  it("accepts the tokens the engine itself uses, so the file can say what /api/show refused to", () => {
    // D2's last sentence: where the engine cannot tell you, the capability is a
    // user-editable field in the routing entry. A well-formed assertion must validate
    // clean, or the wizard's own write would be refused by the module that judges it.
    expect(validateRouting(withCapabilities(["embedding"]))).toEqual([]);
    expect(validateRouting(withCapabilities(["completion", "tools", "vision", "embedding", "thinking"]))).toEqual([]);
    // An explicit empty list is "nobody claimed anything", not a malformed claim.
    expect(validateRouting(withCapabilities([]))).toEqual([]);
  });

  it("reports an unrecognised token by its own path, so the bad one is findable without rereading the file", () => {
    // Index in the path is the point: `routing.embedding.capabilities` would send the
    // user back through the whole list to find the one typo in it.
    const issues = validateRouting(withCapabilities(["completion", "tools", "vision", "struct-output"]));
    expect(paths(issues)).toEqual(["routing.embedding.capabilities[3]"]);
    expect(issues[0].message).toContain("not a recognised capability");
    expect(issues[0].message).toContain("struct-output");
  });

  it("names every bad element in one pass, and keeps the good ones out of it", () => {
    const issues = validateRouting(withCapabilities(["completion", 4096, "tools", true]));
    expect(paths(issues)).toEqual(["routing.embedding.capabilities[1]", "routing.embedding.capabilities[3]"]);
    expect(issues[0].message).toContain("expected a capability token string");
    expect(issues[1].message).toContain("expected a capability token string");
  });

  it("refuses a non-array rather than reading a scalar as one capability, or nothing as zero", () => {
    // `"tools"` is the shape a hand-editor reaches for when they think the field is a
    // label. Accepted as one token it would silently narrow an entry that looked like a
    // list; dropped, it would silently widen it. Both are reports, not repairs.
    expect(paths(validateRouting(withCapabilities("tools")))).toEqual(["routing.embedding.capabilities"]);
    expect(paths(validateRouting(withCapabilities({ any: ["tools"] })))).toEqual(["routing.embedding.capabilities"]);
    expect(paths(validateRouting(withCapabilities(null)))).toEqual(["routing.embedding.capabilities"]);
  });

  it("refuses a whole-entry mistake and the capability mistakes in the same pass", () => {
    const candidate = {
      ...D2,
      routing: {
        ...D2.routing,
        code: { engine: "ollama-local", model: "", capabilities: ["tools", "coding"] },
        embedding: { engine: "ollama-local", model: "nomic-embed-text:latest", capabilities: "embedding" },
      },
    };
    expect(paths(validateRouting(candidate))).toEqual([
      // Inside one entry the field order is the file's own: engine, model, capabilities.
      "routing.code.model", "routing.code.capabilities[1]", "routing.embedding.capabilities",
    ]);
  });

  it("leaves an entry that never mentions capabilities exactly as free of problems as it was", () => {
    // Absent is not empty: the override must not turn a plain entry into a claim.
    expect(validateRouting(D2)).toEqual([]);
    expect(resolveRoute(D2, "embedding").target).not.toHaveProperty("capabilities");
  });

  it("survives re-running guided setup on the same model, which is the only write that replaces this entry", () => {
    // `deriveRoutingFromSetup` carries hand-written slots through untouched and rewrites
    // `default` — so an assertion made about the model setup is about to confirm again
    // would be discarded by the wizard that changed nothing about it.
    const existing: RoutingConfig = {
      ...D2,
      routing: { ...D2.routing, [DEFAULT_SLOT]: { engine: "ollama-local", model: "qwen3:14b", capabilities: ["tools"] } },
    };
    const same = deriveRoutingFromSetup({
      runStyle: "multi",
      engines: { "ollama-local": { kind: "ollama", baseUrl: "http://[::1]:11434" } },
      selection: { engine: "ollama-local", model: "qwen3:14b" },
      existing,
    });
    expect(same.routing[DEFAULT_SLOT]).toEqual({ engine: "ollama-local", model: "qwen3:14b", capabilities: ["tools"] });

    // A different model is a different claim, and the old one does not travel to it.
    const moved = deriveRoutingFromSetup({
      runStyle: "multi",
      engines: { "ollama-local": { kind: "ollama", baseUrl: "http://[::1]:11434" } },
      selection: { engine: "ollama-local", model: "qwen3.8:27b" },
      existing,
    });
    expect(moved.routing[DEFAULT_SLOT]).toEqual({ engine: "ollama-local", model: "qwen3.8:27b" });
  });
});

describe("flattening onto the run style", () => {
  it("multi leaves the table exactly as written — same reference, nothing rewritten", () => {
    const result = flattenForRunStyle(D2);
    expect(result.routing).toBe(D2);
    expect(result.overridden).toEqual([]);
    expect(result.pinned).toBeNull();
  });

  it("single resolves every slot to the pinned model and returns the slots it overrode", () => {
    const perSlot = SINGLE({
      [DEFAULT_SLOT]:           { engine: "llama-local", model: "qwen3-coder:30b" },
      "code":                   { engine: "llama-local", model: "qwen3.8:27b" },
      "collective.coordinator": { engine: "llama-local", model: "qwen3.8:27b" },
      "collective.critic":      { engine: "llama-local", model: "qwen3:14b" },
    });
    const { routing, pinned, overridden } = flattenForRunStyle(perSlot);

    // Exactly the slots that differed — and only those. Reporting the ones that
    // already matched would train the user to ignore the list.
    expect(overridden).toEqual(["code", "collective.coordinator", "collective.critic"]);
    expect(pinned).toEqual({ engine: "llama-local", model: "qwen3-coder:30b" });
    expect(Object.values(routing.routing).every((t) => t.model === "qwen3-coder:30b")).toBe(true);
    expect(routing.runStyle).toBe("single");
  });

  it("prefers the engine's pinnedModel over the default slot, because the pin is what is loaded", () => {
    const result = flattenForRunStyle(SINGLE({ [DEFAULT_SLOT]: { engine: "llama-local", model: "something-else:1b" } }));
    expect(result.pinned).toEqual({ engine: "llama-local", model: "qwen3-coder:30b" });
    expect(result.overridden).toEqual([DEFAULT_SLOT]);
    expect(result.routing.routing[DEFAULT_SLOT].model).toBe("qwen3-coder:30b");
  });

  it("carries an assertion onto the flattened slots when the pin names that same model", () => {
    // The llama.cpp lane is exactly the case where an engine answers nothing, so the
    // file's assertion is the only capability statement that exists. Dropping it here
    // would throw it away on the one style that needs it.
    const asserted = SINGLE({
      [DEFAULT_SLOT]: { engine: "llama-local", model: "qwen3-coder:30b", capabilities: ["tools", "completion"] },
      "code":         { engine: "llama-local", model: "qwen3:14b" },
    });
    const { routing, pinned, overridden } = flattenForRunStyle(asserted);

    expect(overridden).toEqual(["code"]);
    expect(pinned).toEqual({ engine: "llama-local", model: "qwen3-coder:30b", capabilities: ["tools", "completion"] });
    for (const target of Object.values(routing.routing)) {
      expect(target.model).toBe("qwen3-coder:30b");
      expect(target.capabilities).toEqual(["tools", "completion"]);
    }
  });

  it("will not move an assertion onto a different model than the one it describes", () => {
    // `default` names something-else:1b; the lane is pinned to qwen3-coder:30b. The
    // assertion is about the first pair, so the flattened slot gets no claim at all —
    // inventing one by copying it across would say something nobody said.
    const mismatched = SINGLE({
      [DEFAULT_SLOT]: { engine: "llama-local", model: "something-else:1b", capabilities: ["vision"] },
    });
    const { routing, pinned } = flattenForRunStyle(mismatched);

    expect(pinned).toEqual({ engine: "llama-local", model: "qwen3-coder:30b" });
    expect(routing.routing[DEFAULT_SLOT].model).toBe("qwen3-coder:30b");
    expect(routing.routing[DEFAULT_SLOT].capabilities).toBeUndefined();
  });

  it("reports nothing rather than invent a model when single has no pin", () => {
    const noPin = {
      runStyle: "single" as const,
      engines: { one: { kind: "ollama" as const, baseUrl: "http://127.0.0.1:11434" } },
      routing: { code: { engine: "one", model: "a:1" } },
    };
    const result = flattenForRunStyle(noPin);
    expect(result.pinned).toBeNull();
    expect(result.overridden).toEqual([]);
    expect(result.routing.routing.code.model).toBe("a:1"); // unchanged: validation says why, this does not guess
  });
});

describe("deriving a table from the profile that exists today", () => {
  it("turns ollama + defaultModel into the config that routes the same box", () => {
    expect(deriveRoutingFromProfile({ ollama: "http://[::1]:11434", defaultModel: "qwen3:14b" })).toEqual({
      runStyle: "multi",
      engines: { ollama: { kind: "ollama", baseUrl: "http://[::1]:11434", label: "Ollama" } },
      routing: { [DEFAULT_SLOT]: { engine: "ollama", model: "qwen3:14b" } },
    });
  });

  it("adds the llama.cpp lane only when the profile names one", () => {
    const both = deriveRoutingFromProfile({ ollama: "http://[::1]:11434", llamaCpp: "http://127.0.0.1:8011/" });
    expect(Object.keys(both.engines)).toEqual(["ollama", "llama.cpp"]);
    expect(both.engines["llama.cpp"]).toEqual({ kind: "llama.cpp", baseUrl: "http://127.0.0.1:8011", label: "llama.cpp" });

    expect(Object.keys(deriveRoutingFromProfile({ llamaCpp: "http://127.0.0.1:8011" }).engines))
      .toEqual(["ollama", "llama.cpp"]); // Ollama stays, as it did before the table existed
  });

  it("falls back to the loopback daemon and omits a slot it has no model for", () => {
    const empty = deriveRoutingFromProfile({ ollama: "   " });
    expect(empty.engines.ollama.baseUrl).toBe(DEFAULT_OLLAMA_BASE_URL);
    // An entry with no model would be a validation failure; a profile that never
    // recorded one is not.
    expect(empty.routing).toEqual({});
  });

  it("derives a valid table from every profile shape an install can hold", () => {
    for (const profile of [
      {},
      null,
      { ollama: "http://[::1]:11434" },
      { defaultModel: "qwen3:14b" },
      { ollama: "http://[::1]:11434", llamaCpp: "http://127.0.0.1:8011", defaultModel: "qwen3-coder:30b" },
    ]) {
      expect(validateRouting(deriveRoutingFromProfile(profile))).toEqual([]);
    }
  });
});

describe("migrating a stored config", () => {
  // Typed as the parsed shape it actually arrives as: JSON.parse hands `load()` an
  // `AppConfig` by assertion, and the keys it does not recognise are the point.
  const preD2: Record<string, unknown> = {
    activeProfileId: "home-lan",
    profiles: [
      { id: "localhost", name: "Localhost", ollama: "http://[::1]:11434", defaultModel: "qwen3:8b" },
      { id: "home-lan",  name: "Home LAN",  ollama: "http://192.168.2.101:11434", defaultModel: "qwen3:14b" },
    ],
    allowedExtensionIds: ["abc"],
  };

  it("adds the block and keeps a key it has never heard of", () => {
    const { config, changed } = migrateToRouting(preD2);
    expect(changed).toBe(true);
    expect(config.allowedExtensionIds).toEqual(["abc"]);
    // Derived from the *active* route, not whichever came first in the array.
    expect(config.routing).toEqual({ [DEFAULT_SLOT]: { engine: "ollama", model: "qwen3:14b" } });
    expect(config.engines).toEqual({ ollama: { kind: "ollama", baseUrl: "http://192.168.2.101:11434", label: "Ollama" } });
    expect(config.runStyle).toBe("multi");
  });

  it("is idempotent: the second pass is the same object, and changes nothing", () => {
    const first = migrateToRouting(preD2);
    const second = migrateToRouting(first.config);
    expect(second.changed).toBe(false);
    expect(second.config).toBe(first.config);
    expect(second.config).toEqual(first.config);
  });

  it("leaves an existing engines map alone even when it is nonsense", () => {
    // Repairing here would delete the evidence validation is meant to report: a
    // half-finished edit comes back as the user's own, with paths to fix.
    const half = { ...preD2, runStyle: "multi", engines: { typo: { kind: "ollama", baseUrl: "not-a-url" } }, routing: {} };
    const { config, changed } = migrateToRouting(half);
    expect(changed).toBe(false);
    expect(config).toBe(half);
    expect(paths(validateRouting(readRoutingBlock(config)))).toEqual(["engines.typo.baseUrl"]);
  });

  it("recognises a stored block only through the engines key", () => {
    expect(readRoutingBlock({ runStyle: "single", routing: {} })).toBeNull();
    expect(readRoutingBlock({ engines: {}, runStyle: "multi" })).toEqual({ runStyle: "multi", engines: {}, routing: {} });
  });

  it("derives something usable from a config with no profiles at all", () => {
    const { config } = migrateToRouting({ activeProfileId: "gone", profiles: [], allowedExtensionIds: [] });
    expect(validateRouting(readRoutingBlock(config))).toEqual([]);
    expect(resolveRoute(readRoutingBlock(config), "code").target).toBeNull();
  });
});

describe("the pin a single-style box serves", () => {
  it("is the default slot's engine when the table names several", () => {
    const table: RoutingConfig = {
      ...D2,
      runStyle: "single",
      routing: { [DEFAULT_SLOT]: { engine: "llama-local", model: "qwen3:14b" } },
    };
    expect(pinnedTarget(table)).toEqual({ engineId: "llama-local", target: { engine: "llama-local", model: "qwen3-coder:30b" } });
  });

  it("needs exactly one engine when there is no default to point at one", () => {
    expect(pinnedTarget(SINGLE({}))).toEqual({ engineId: "llama-local", target: { engine: "llama-local", model: "qwen3-coder:30b" } });
    expect(pinnedTarget({ ...D2, runStyle: "single", routing: {} })).toBeNull();
  });
});

// D3's two halves: propose a style from the hardware, then write the table the
// confirmed answer implies. The proposal is never applied on its own — the wizard has
// to put it in front of the user first (plan C1).
describe("proposing a run style", () => {
  const card = (name: string, vramGb: number) => ({ name, vramGb });
  const engine = (kind: string, over: Partial<{ running: boolean; installed: "yes" | "inferred" | "unknown"; models: string[] }> = {}) => ({
    kind, running: true, installed: "yes" as const, models: [] as string[], ...over,
  });

  it("proposes nothing when no VRAM could be measured, and says that is why", () => {
    // An unmeasured card is not a small card: `AdapterRAM` used to read every card of
    // 4 GB or more as 4 GB, which is how a 24 GB box landed in the entry-level tier.
    // Nor is it a big one — a CPU-only laptop lands here too, and the two want opposite
    // styles, so the only honest answer is no answer (plan D3a).
    const unmeasured = proposeRunStyle([card("RTX 4090", 0)], [engine("ollama", { models: ["a:1", "b:2"] })]);
    expect(unmeasured.runStyle).toBeNull();
    expect(unmeasured.why).toContain("could not be measured");
    expect(unmeasured.why).toContain("claims nothing");
    expect(unmeasured.why).toContain("no run style is proposed");

    const headless = proposeRunStyle([], []);
    expect(headless.runStyle).toBeNull();
    expect(headless.why).toContain("No graphics card was found");
    expect(headless.why).toContain("could not be measured");
  });

  it("proposes one pinned model for a card too small to hold two, quoting the memory it used", () => {
    const proposal = proposeRunStyle([card("GTX 1650", 8)], [engine("ollama", { models: ["qwen3:8b", "qwen2.5:7b"] })]);

    expect(proposal.runStyle).toBe("single");
    expect(proposal.why).toContain("8 GB");
    expect(proposal.why).toContain("pins one model");
    // Nothing in the reason cites a figure that decided no rule.
    expect(proposal.why).not.toContain("system RAM");
  });

  it("proposes multi for 24 GB+ of measured memory with more than one thing to run", () => {
    const twoCards = proposeRunStyle([card("5060 Ti A", 15.9), card("5060 Ti B", 15.9)], [
      engine("ollama", { models: ["qwen3:14b", "qwen3.8:27b", "nomic-embed-text:latest"] }),
      engine("llama.cpp", { models: ["qwen3-coder:30b"] }),
    ]);

    expect(twoCards.runStyle).toBe("multi");
    expect(twoCards.why).toContain("2 cards totalling 31.8 GB");
    expect(twoCards.why).toContain("models");
    expect(twoCards.why).toContain("engines");
    expect(twoCards.why).not.toContain("system RAM");

    // One big card qualifies on the total alone, if the inventory says there is
    // something to swap between.
    const oneBigCard = proposeRunStyle([card("RTX 4090", 24)], [engine("ollama", { models: ["a:1", "b:2"] })]);
    expect(oneBigCard.runStyle).toBe("multi");
    expect(oneBigCard.why).toContain("24 GB on one card");
  });

  it("counts an engine it could only infer as a lane, but never its unseeable models", () => {
    // A stopped Ollama with a 24 GB card: two things exist (a lane and a pin) but
    // nothing known to swap, so multi would be a promise about a model list nobody
    // saw. The rule reads the evidence, not the optimism.
    const stopped = proposeRunStyle([card("RTX 4090", 24)], [
      { kind: "ollama", installed: "inferred", running: false, models: [] },
    ]);
    expect(stopped.runStyle).toBe("single");
    expect(stopped.why).toContain("1 thing");
  });

  it("falls back to single when the box is large but nothing was found to swap", () => {
    const empty = proposeRunStyle([card("A100", 40)], [
      engine("ollama", { running: false, installed: "unknown", models: [] }),
      engine("llama.cpp", { running: false, installed: "unknown", models: [] }),
    ]);

    expect(empty.runStyle).toBe("single");
    expect(empty.why).toContain("40 GB");
    expect(empty.why).toContain("0 things");
    expect(empty.why).toContain("pinned");
  });

  it("gives every rule a reason a user can read", () => {
    const cases = [
      proposeRunStyle([], []),
      proposeRunStyle([card("x", 0)], []),
      proposeRunStyle([card("x", 6)], []),
      proposeRunStyle([card("x", 24)], [engine("ollama", { models: ["a:1", "b:2"] })]),
      proposeRunStyle([card("x", 16), card("y", 16)], []),
    ].filter((proposal) => proposal.runStyle !== null);

    expect(cases.length).toBeGreaterThan(0);
    for (const proposal of cases) {
      expect(proposal.why.trim().length).toBeGreaterThan(30);
      expect(["single", "multi"]).toContain(proposal.runStyle);
    }
  });
});

describe("writing the table guided setup confirmed", () => {
  const ollama = { kind: "ollama" as const, baseUrl: "http://[::1]:11434", label: "Ollama" };

  it("multi records the choice in routing.default and nothing else", () => {
    const table = deriveRoutingFromSetup({
      runStyle: "multi",
      engines: { ollama },
      selection: { engine: "ollama", model: "qwen3:14b" },
    });

    expect(table).toEqual({
      runStyle: "multi",
      engines: { ollama: { kind: "ollama", baseUrl: "http://[::1]:11434", label: "Ollama" } },
      routing: { [DEFAULT_SLOT]: { engine: "ollama", model: "qwen3:14b" } },
    });
    // A pin in multi would be a second source of truth for the same model.
    expect(table.engines.ollama.pinnedModel).toBeUndefined();
    expect(validateRouting(table)).toEqual([]);
  });

  it("single moves the engine's pinnedModel with the choice, because every slot resolves onto it", () => {
    const table = deriveRoutingFromSetup({
      runStyle: "single",
      engines: { ollama, "llama.cpp": { kind: "llama.cpp", baseUrl: "http://127.0.0.1:8011", label: "llama.cpp" } },
      selection: { engine: "ollama", model: "qwen3:14b" },
      existing: { runStyle: "single", engines: { ollama }, routing: { [DEFAULT_SLOT]: { engine: "ollama", model: "old:1b" } } },
    });

    expect(table.engines.ollama.pinnedModel).toBe("qwen3:14b");
    expect(table.routing[DEFAULT_SLOT]).toEqual({ engine: "ollama", model: "qwen3:14b" });
    // The reason the pin is required: without it, the flatten step would resolve every
    // slot onto a model this step never confirmed.
    const flattened = flattenForRunStyle(table);
    expect(flattened.pinned).toEqual({ engine: "ollama", model: "qwen3:14b" });
    expect(validateRouting(table)).toEqual([]);
  });

  it("keeps hand-written slots and the ids they name the engine by", () => {
    // The wizard can be re-opened from Settings on a box whose file was edited by
    // hand. Renaming the user's engine would strand every slot that refers to it.
    const existing: RoutingConfig = {
      runStyle: "multi",
      engines: { "ollama-local": { kind: "ollama", baseUrl: "http://192.168.1.9:11434", label: "Studio box" } },
      routing: {
        [DEFAULT_SLOT]:            { engine: "ollama-local", model: "qwen3:8b" },
        "collective.critic":       { engine: "ollama-local", model: "qwen3:14b" },
        "collective.coordinator":  { engine: "ollama-local", model: "qwen3.8:27b" },
      },
    };
    const table = deriveRoutingFromSetup({
      runStyle: "multi",
      engines: { ollama: { kind: "ollama", baseUrl: "http://[::1]:11434" } },
      selection: { engine: "ollama", model: "qwen3:14b" },
      existing,
    });

    expect(Object.keys(table.engines)).toEqual(["ollama-local"]);
    expect(table.engines["ollama-local"]).toEqual({ kind: "ollama", baseUrl: "http://[::1]:11434", label: "Studio box" });
    expect(table.routing[DEFAULT_SLOT]).toEqual({ engine: "ollama-local", model: "qwen3:14b" });
    expect(table.routing["collective.critic"]).toEqual(existing.routing["collective.critic"]);
    expect(table.routing["collective.coordinator"]).toEqual(existing.routing["collective.coordinator"]);
    expect(validateRouting(table)).toEqual([]);
  });

  it("leaves a kind it cannot disambiguate under its own id, and drops an engine with no address", () => {
    const twoOfAKind: RoutingConfig = {
      runStyle: "multi",
      engines: {
        "ollama-a": { kind: "ollama", baseUrl: "http://127.0.0.1:11434" },
        "ollama-b": { kind: "ollama", baseUrl: "http://127.0.0.1:11435" },
      },
      routing: {},
    };
    const renamed = deriveRoutingFromSetup({ runStyle: "multi", engines: { ollama }, existing: twoOfAKind });
    expect(Object.keys(renamed.engines).sort()).toEqual(["ollama", "ollama-a", "ollama-b"]);

    // A cleared Advanced field is not an engine: `validateRouting` would refuse the
    // whole table for it, and the user would be told their setup is invalid for a
    // lane they never asked for.
    const blank = deriveRoutingFromSetup({
      runStyle: "multi",
      engines: { ollama, "llama.cpp": { kind: "llama.cpp", baseUrl: "   " } },
      selection: { engine: "llama.cpp", model: "qwen3-coder:30b" },
    });
    expect(Object.keys(blank.engines)).toEqual(["ollama"]);
    // The selection named an engine that is not in the table, so no default is invented.
    expect(blank.routing[DEFAULT_SLOT]).toBeUndefined();
    expect(validateRouting(blank)).toEqual([]);
  });

  it("writes nothing it was not told: a selection with no model leaves the slot alone", () => {
    const existing: RoutingConfig = {
      runStyle: "single",
      engines: { ollama: { kind: "ollama", baseUrl: "http://[::1]:11434", pinnedModel: "kept:7b" } },
      routing: { [DEFAULT_SLOT]: { engine: "ollama", model: "kept:7b" } },
    };
    const table = deriveRoutingFromSetup({ runStyle: "single", engines: { ollama }, selection: { model: "  " }, existing });

    expect(table.routing[DEFAULT_SLOT]).toEqual({ engine: "ollama", model: "kept:7b" });
    expect(table.engines.ollama.pinnedModel).toBe("kept:7b");
    expect(table.runStyle).toBe("single");
  });

  it("clears a pin left by a previous single-style run once the style is multi", () => {
    // Observed in a real config: setup run twice, first as single then as multi,
    // left `pinnedModel` in the file naming a model the box no longer pins. Nothing
    // in multi style reads it, so it was a second, authoritative-looking answer.
    const existing: RoutingConfig = {
      runStyle: "single",
      engines: { ollama: { kind: "ollama", baseUrl: "http://[::1]:11434", pinnedModel: "qwen3.8:27b" } },
      routing: { [DEFAULT_SLOT]: { engine: "ollama", model: "qwen3.8:27b" } },
    };
    const table = deriveRoutingFromSetup({
      runStyle: "multi", engines: { ollama },
      selection: { engine: "ollama", model: "qwen3:14b" }, existing,
    });

    expect(table.runStyle).toBe("multi");
    expect(table.engines.ollama.pinnedModel).toBeUndefined();
    expect(table.routing[DEFAULT_SLOT]).toEqual({ engine: "ollama", model: "qwen3:14b" });
  });
});

// ---------------------------------------------------------------------------
// The runtime's roles, and the rows that assign them (owner decision 4)
// ---------------------------------------------------------------------------

/** A row the editor is expected to render. Missing is a failure, not a `find` that
 * quietly returns undefined for the assertion below it. */
function presented(key: string): RoutingRow {
  const row = ROUTING_ROWS.find((candidate) => candidate.key === key);
  if (!row) throw new Error(`no presented row for ${key}`);
  return row;
}

describe("the role vocabulary the editor is built on", () => {
  it("carries the runtime's seven roles, in the runtime's own order", () => {
    expect(RUNE_ROLES).toEqual([
      "coordinator", "architect", "coder", "devops", "researcher", "analyst", "verifier",
    ]);
  });

  it("names each role's variable as the runtime spells it today", () => {
    expect(RUNE_ROLE_ENV).toEqual({
      coordinator: "SWARM_COORDINATOR_MODEL",
      architect: "SWARM_ARCHITECT_MODEL",
      coder: "CODER_MODEL",
      devops: "DEVOPS_MODEL",
      researcher: "RESEARCHER_MODEL",
      analyst: "ANALYST_MODEL",
      verifier: "VERIFIER_MODEL",
    });
  });

  it("does not adopt the proposed rename, and does not borrow the other architect variable", () => {
    const envs = Object.values(RUNE_ROLE_ENV);
    // SWARM_CODER_MODEL / SWARM_DEVOPS_MODEL are a proposal that has not landed in
    // Memex_Core; showing them would name variables nothing reads.
    expect(envs).not.toContain("SWARM_CODER_MODEL");
    expect(envs).not.toContain("SWARM_DEVOPS_MODEL");
    // The unsuffixed ARCHITECT_MODEL is a separate live variable on a different code
    // path. Treating it as architect's binding would report an assignment the
    // architect worker never receives.
    expect(envs).not.toContain("ARCHITECT_MODEL");
  });
});

describe("the assignment editor's rows", () => {
  it("is default, then the five roles with no desktop slot, then the two slots that are roles, then embedding", () => {
    expect(ROUTING_ROWS.map((row) => row.key)).toEqual([
      "default",
      "architect", "devops", "researcher", "analyst", "verifier",
      "code", "collective.coordinator", "embedding",
    ]);
  });

  it("gives the critic no row, and says why where the reason is recorded", () => {
    // Not a row, because a row implies an assignment: the critic loop is not one of the
    // seven Pioneer roles and no per-role map carries it.
    expect(ROUTING_ROWS.map((row) => row.key)).not.toContain("collective.critic");
    expect(UNPRESENTED_ROWS.map((row) => row.key)).toEqual(["collective.critic"]);
    expect(UNPRESENTED_ROWS[0]).toMatchObject({
      env: "SWARM_EVALUATOR_MODEL", role: null, perRoleBindable: false,
    });
    expect(UNPRESENTED_ROWS[0]!.note).toMatch(/not a Team Builder role/);
  });

  it("covers every role exactly once, through the row that means it", () => {
    const roles = ROUTING_ROWS.map((row) => row.role).filter((role): role is RuneRole => !!role);
    expect([...roles].sort()).toEqual([...RUNE_ROLES].sort());
    // The collisions must not double up into two answers for one role.
    expect(ROUTING_ROWS.filter((row) => row.role === "coordinator").map((row) => row.key)).toEqual(["collective.coordinator"]);
    expect(ROUTING_ROWS.filter((row) => row.role === "coder").map((row) => row.key)).toEqual(["code"]);
  });

  it("keeps both name collisions visible in the row, not resolved by renaming", () => {
    // coordinator -> collective.coordinator: same role, one row, under the slot name the
    // file already uses.
    expect(presented("collective.coordinator")).toMatchObject({
      key: "collective.coordinator", role: "coordinator", env: "SWARM_COORDINATOR_MODEL",
    });
    // coder -> code: the runtime reads CODER_MODEL for the DevHarness primary as well,
    // so this row genuinely changes two things at once and says so.
    const coder = presented("code");
    expect(coder.key).toBe("code");
    expect(coder.role).toBe("coder");
    expect(coder.env).toBe("CODER_MODEL");
    expect(coder.note).toMatch(/DevHarness primary/);
  });

  it("marks the rows that bind no role, including embedding's own variable", () => {
    expect(presented("embedding")).toMatchObject({ role: null, env: "EMBED_MODEL", perRoleBindable: false });
    expect(presented("default")).toMatchObject({ role: null, env: null, perRoleBindable: false });
    for (const row of ROUTING_ROWS) {
      expect(row.perRoleBindable).toBe(row.role !== null);
      if (row.role) expect(row.env).toBe(RUNE_ROLE_ENV[row.role]);
    }
  });
});

describe("roleTarget", () => {
  const withResearcher: RoutingConfig = {
    ...D2,
    routing: { ...D2.routing, researcher: { engine: "llama-local", model: "qwen3-coder:30b" } },
  };

  it("answers from the row's own slot and names that slot as the one that answered", () => {
    expect(roleTarget(withResearcher, "researcher")).toEqual({
      engine: "llama-local", model: "qwen3-coder:30b", via: "researcher", usedFallback: false,
    });
  });

  it("reports a fallback as a fallback, with the slot that is actually answering", () => {
    // The row is `analyst`; nothing sets it, so `default` answers. A UI that showed the
    // model without `via` would present another lane's choice as an assignment.
    expect(roleTarget(D2, "analyst")).toEqual({
      engine: "ollama-local", model: "qwen3:14b", via: DEFAULT_SLOT, usedFallback: true,
    });
  });

  it("says unassigned rather than falling back, when there is nothing to fall back to", () => {
    const noDefault: RoutingConfig = { ...D2, routing: { code: D2.routing.code } };
    expect(roleTarget(noDefault, "verifier")).toEqual({ engine: null, model: null, via: null, usedFallback: false });
    expect(roleTarget(null, "verifier")).toEqual({ engine: null, model: null, via: null, usedFallback: false });
  });

  it("reads default itself as a slot, not as a fallback of itself", () => {
    expect(roleTarget(D2, DEFAULT_SLOT)).toEqual({
      engine: "ollama-local", model: "qwen3:14b", via: DEFAULT_SLOT, usedFallback: false,
    });
  });
});

describe("runRoleMap", () => {
  it("carries only the roles assigned in their own row", () => {
    expect(runRoleMap(D2)).toEqual({
      coder: "qwen3.8:27b",
      coordinator: "qwen3.8:27b",
    });
  });

  it("sends nothing when every role resolves through the default slot", () => {
    const onlyDefault: RoutingConfig = { ...D2, routing: { [DEFAULT_SLOT]: D2.routing[DEFAULT_SLOT] } };
    expect(runRoleMap(onlyDefault)).toEqual({});
  });

  it("adds a role the moment its own row is assigned, leaving the rest out", () => {
    const partial: RoutingConfig = {
      ...D2,
      routing: { ...D2.routing, architect: { engine: "ollama-local", model: "qwen3.6:27b" } },
    };
    expect(runRoleMap(partial)).toEqual({
      architect: "qwen3.6:27b",
      coder: "qwen3.8:27b",
      coordinator: "qwen3.8:27b",
    });
  });

  it("answers an absent table with an empty map", () => {
    expect(runRoleMap(undefined)).toEqual({});
    expect(runRoleMap(null)).toEqual({});
  });

  it("keys the map by the runtime role name, never the desktop slot", () => {
    const map = runRoleMap(D2);
    expect(Object.keys(map).every((key) => (RUNE_ROLES as readonly string[]).includes(key))).toBe(true);
    expect(map).not.toHaveProperty("code");
    expect(map).not.toHaveProperty("collective.coordinator");
    expect(map).not.toHaveProperty("embedding");
  });
});
