/**
 * D4 — the compatibility matrix, tested against payloads captured from a live Ollama
 * on this machine (2026-09-24, `POST http://127.0.0.1:11434/api/show`).
 *
 * The fixtures are trimmed to the keys the module reads, never edited: each
 * `capabilities` array and each `<arch>.context_length` below is what that daemon
 * answered for that tag. They are kept literal rather than generated so that a future
 * change to a fixture has to be a decision about what the engine said.
 */
import { describe, expect, it, vi } from "vitest";
import {
  ALL_FEATURES, capabilityCacheKey, COORDINATOR_MIN_CONTEXT_TOKENS, enginesCapabilitiesFor, evaluate,
  evaluateFeature, FEATURE_REQUIREMENTS, fromReport, isUnverifiable, parseLlamaCppProps,
  parseOllamaCapabilities, probeModelCapabilities, requirementForRoutingRow, resolveCapabilities, toReport,
  unknownCapabilities, type CapabilityReport, type FeatureRequirement, type FeatureVerdict,
} from "../model-capabilities";
import { CAPABILITY_TOKENS } from "../routing-config";
import type { EngineDescriptor } from "../engine-registry";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

/** A `/api/show` body for one tag. No `name` key: the measured response carries
 * license, modelfile, parameters, template, details, model_info, tensors,
 * capabilities, modified_at — and the tag itself is nowhere in it. */
const show = (family: string, capabilities: string[], contextLength: number) => ({
  license: "<trimmed>",
  modelfile: "<trimmed>",
  parameters: "repeat_penalty 1\ntemperature 0.6",
  template: "<trimmed>",
  details: {
    parent_model: "", format: "gguf", family, families: [family],
    parameter_size: "9.0B", quantization_level: "Q4_K_M",
  },
  model_info: {
    "general.architecture": family,
    [`${family}.context_length`]: contextLength,
    "general.file_type": 2,
  },
  capabilities,
  modified_at: "2026-09-20T10:00:00Z",
});

/** `qwen3:14b` → ["completion","tools","thinking"], qwen3.context_length 40960. */
const QWEN3_14B = show("qwen3", ["completion", "tools", "thinking"], 40960);
/** `nomic-embed-text:latest` → ["embedding"]. **No `completion` at all.** */
const NOMIC = show("nomic-bert", ["embedding"], 2048);
/** `minicpm-v:latest` → ["completion","vision"]. **No `tools`.** */
const MINICPM = show("qwen2", ["completion", "vision"], 32768);
/** `deepseek-r1:32b` → ["tools","thinking","completion"], qwen2.context_length 131072. */
const DEEPSEEK = show("qwen2", ["tools", "thinking", "completion"], 131072);

const OLLAMA_LANE: EngineDescriptor = { id: "ollama", kind: "ollama", baseUrl: "http://127.0.0.1:11434", label: "Ollama" };

const capsOf = (payload: unknown) => parseOllamaCapabilities(payload);

/** Two of the three verdict members carry a `reason`; reading it through here keeps an
 * assertion about wording from having to re-narrow the union each time. */
const reasonOf = (verdict: FeatureVerdict): string => ("reason" in verdict ? verdict.reason : "");

// ---------------------------------------------------------------------------

describe("parseOllamaCapabilities — what the engine actually reported", () => {
  it("takes the capabilities array at face value, for all four measured models", () => {
    expect(capsOf(QWEN3_14B).capabilities).toEqual(new Set(["completion", "tools", "thinking"]));
    expect(capsOf(NOMIC).capabilities).toEqual(new Set(["embedding"]));
    expect(capsOf(MINICPM).capabilities).toEqual(new Set(["completion", "vision"]));
    expect(capsOf(DEEPSEEK).capabilities).toEqual(new Set(["tools", "thinking", "completion"]));
    for (const payload of [QWEN3_14B, NOMIC, MINICPM, DEEPSEEK]) {
      expect(capsOf(payload).source).toBe("reported");
    }
  });

  it("reads the context window out of model_info, keyed by the architecture the file names", () => {
    expect(capsOf(QWEN3_14B).contextLength).toBe(40960);
    expect(capsOf(DEEPSEEK).contextLength).toBe(131072);
    expect(capsOf(NOMIC).contextLength).toBe(2048);
  });

  it("says unknown, not \"no capabilities\", when the field is absent — an older build is not a verdict on the model", () => {
    const older = { ...QWEN3_14B } as Record<string, unknown>;
    delete older.capabilities;
    const caps = capsOf(older);
    expect(caps.source).toBe("unknown");
    expect(caps.capabilities.size).toBe(0);
    // The context window is a separate fact and survives: it was reported.
    expect(caps.contextLength).toBe(40960);
    expect(caps.detail).toMatch(/no capabilities/);
  });

  it.each([
    ["null", null],
    ["a bare string", "completion"],
    ["an empty array", []],
    ["an array of non-strings", [1, null, true]],
    ["a JSON array spelled as a string", "[\"completion\"]"],
  ])("treats %s as an engine that did not answer", (_label, value) => {
    const caps = capsOf({ capabilities: value });
    expect(caps.source).toBe("unknown");
    expect(caps.capabilities.size).toBe(0);
  });

  it("keeps `source` mandatory: every parse of every fixture carries one of exactly two values", () => {
    const sources = new Set([QWEN3_14B, NOMIC, MINICPM, {}, null, "junk"].map((p) => capsOf(p).source));
    expect([...sources].sort()).toEqual(["reported", "unknown"]);
  });
});

describe("the matrix — a feature's requirement against a model's report", () => {
  it("refuses the embedding-only model for chat, in a sentence that names the capability", () => {
    const verdict = evaluate(FEATURE_REQUIREMENTS.chat, capsOf(NOMIC));
    expect(verdict.ok).toBe(false);
    if (!verdict.ok) {
      expect(verdict.reason).toMatch(/completion/);
      // The engine's own report is quoted, so the sentence can be checked by a human.
      expect(verdict.reason).toMatch(/reports embedding/);
    }
  });

  it("accepts nomic-embed-text for the memory row, which is the one place it is the right answer", () => {
    expect(evaluate(FEATURE_REQUIREMENTS.memory, capsOf(NOMIC))).toEqual({ ok: true });
  });

  it("passes minicpm-v for chat and fails it for the coding workspace, which has no tools to call", () => {
    expect(evaluate(FEATURE_REQUIREMENTS.chat, capsOf(MINICPM))).toEqual({ ok: true });
    const code = evaluate(FEATURE_REQUIREMENTS.code, capsOf(MINICPM));
    expect(code.ok).toBe(false);
    if (!code.ok) expect(code.reason).toMatch(/tools/);
    expect(evaluate(FEATURE_REQUIREMENTS.vision, capsOf(MINICPM))).toEqual({ ok: true });
  });

  it("passes qwen3:14b and deepseek-r1:32b for the coordinator, on tools *and* the context floor", () => {
    for (const payload of [QWEN3_14B, DEEPSEEK]) {
      const caps = capsOf(payload);
      expect(caps.contextLength).toBeGreaterThanOrEqual(COORDINATOR_MIN_CONTEXT_TOKENS);
      expect(evaluate(FEATURE_REQUIREMENTS.coordinator, caps)).toEqual({ ok: true });
    }
  });

  it("refuses a short-context model for the coordinator and quotes the number it measured", () => {
    const small = { capabilities: ["completion", "tools"], model_info: { "qwen3.context_length": 4096 } };
    const verdict = evaluate(FEATURE_REQUIREMENTS.coordinator, parseOllamaCapabilities(small));
    expect(verdict.ok).toBe(false);
    if (!verdict.ok) expect(verdict.reason).toContain("4096");
  });

  it("does not gate a context floor on a number the engine never gave", () => {
    const noCtx = parseOllamaCapabilities({ capabilities: ["completion", "tools"] });
    const verdict = evaluate(FEATURE_REQUIREMENTS.coordinator, noCtx);
    expect(verdict.ok).toBe(true);
    expect(isUnverifiable(verdict)).toBe(true);
    if (isUnverifiable(verdict)) expect(verdict.reason).toMatch(/did not report a context window/);
  });
});

describe("the critic row — the honest unverifiable", () => {
  it("reports unverifiable rather than passing, on the most capable model in the set", () => {
    const verdict = evaluate(FEATURE_REQUIREMENTS.critic, capsOf(QWEN3_14B));
    // It does have completion, so this is not a refusal — and it is not a pass either.
    expect(verdict.ok).toBe(true);
    expect(isUnverifiable(verdict)).toBe(true);
    if (isUnverifiable(verdict)) expect(verdict.reason).toMatch(/structured output/);
  });

  it("refuses the embedder for the critic too, because \"cannot verify the grammar\" is not \"can complete\"", () => {
    expect(evaluate(FEATURE_REQUIREMENTS.critic, capsOf(NOMIC)).ok).toBe(false);
  });

  it("gates nothing on `thinking`, and no requirement in the table does", () => {
    // `thinking` is what this Ollama reports for qwen3 and deepseek-r1. It is not
    // structured output, and substituting it would be the exact sin: a check that
    // passes and implies something the engine never promised.
    for (const [id, requirement] of Object.entries(FEATURE_REQUIREMENTS)) {
      expect(requirement.requires, `${id} must not require thinking`).not.toContain("thinking");
    }
    expect(FEATURE_REQUIREMENTS.critic.notVerifiable).toContain("structured output");
  });
});

describe("a silent engine — the app may not block, and may not pretend", () => {
  const silent = unknownCapabilities("the daemon was stopped");

  it.each(Object.keys(FEATURE_REQUIREMENTS) as Array<keyof typeof FEATURE_REQUIREMENTS>)(
    "%s answers an unknown source with a stated limitation, never a refusal", (feature) => {
      const verdict = evaluate(FEATURE_REQUIREMENTS[feature], silent);
      expect(verdict.ok).toBe(true);
      expect(isUnverifiable(verdict)).toBe(true);
      if (isUnverifiable(verdict)) {
        expect(verdict.reason).toMatch(/cannot verify/);
        expect(verdict.reason).toContain("the daemon was stopped");
      }
    },
  );

  it("never synthesises a capability from silence", () => {
    expect(silent.source).toBe("unknown");
    expect(silent.capabilities.size).toBe(0);
    expect(toReport(silent)).toEqual({ capabilities: [], source: "unknown", contextLength: null, detail: "the daemon was stopped" });
  });

  it("round-trips through the wire shape without losing the distinction", () => {
    const empty = { capabilities: new Set<string>(), source: "reported", detail: "reported nothing" } as const;
    const back = fromReport(toReport(empty));
    expect(back.source).toBe("reported");
    expect(evaluate(FEATURE_REQUIREMENTS.chat, back).ok).toBe(false);
    expect(fromReport(null).source).toBe("unknown");
    expect(fromReport(undefined as unknown as CapabilityReport).source).toBe("unknown");
  });
});

describe("no code path may turn a name into a capability", () => {
  it("answers identically for two tags whose names say opposite things, given one payload", () => {
    const payload = { capabilities: ["completion"], model_info: {} };
    const a = parseOllamaCapabilities({ ...payload, name: "everything-tools-vision-embed:latest" });
    const b = parseOllamaCapabilities({ ...payload, name: "qwen3-coder:30b" });
    expect(a).toEqual(b);
    // Both are `reported` with exactly one capability: the name bought nothing.
    expect(a.capabilities).toEqual(new Set(["completion"]));
    expect(evaluate(FEATURE_REQUIREMENTS.code, a).ok).toBe(false);
    expect(evaluate(FEATURE_REQUIREMENTS.code, b).ok).toBe(false);
  });

  it("still refuses a tag that contains the word \"coder\" when the engine reports only embedding", () => {
    // The trap this module exists to avoid: a name that reads as capable.
    const lying = { details: { family: "qwen3" }, capabilities: ["embedding"], model_info: {} };
    const caps = parseOllamaCapabilities(lying);
    expect(caps).toHaveProperty("source", "reported");
    expect(evaluate(FEATURE_REQUIREMENTS.code, caps).ok).toBe(false);
    expect(evaluate(FEATURE_REQUIREMENTS.chat, caps).ok).toBe(false);
  });

  it("does not consult `details.family` or `parent_model` for a capability either", () => {
    // minicpm-v's family really is `qwen2` — the same string deepseek-r1:32b reports,
    // and one of those has tools and the other does not. A family lookup would be
    // wrong on the machine this file was written on, which is the point.
    const stripped = { capabilities: ["completion"], details: { family: "qwen2", parent_model: "deepseek-r1:32b" } };
    const caps = parseOllamaCapabilities(stripped);
    expect(evaluate(FEATURE_REQUIREMENTS.code, caps).ok).toBe(false);
  });

  it("gives one identical set of verdicts for every tag, when the engine's answer is fixed", () => {
    // The shape of the guard a source scan wanted, done behaviourally: the same
    // `capabilities` array wearing twelve different names. A substring check on a tag —
    // `if (name.includes("coder"))` — changes the answer for some of these and fails
    // here, while passing every other test in this file.
    const embeddingsOnly = (name: string) => parseOllamaCapabilities({
      name,
      license: name,
      modelfile: `FROM ${name}`,
      template: name,
      details: { family: name, parent_model: name, parameter_size: "9.0B", quantization_level: "Q4_K_M" },
      model_info: { [name]: 4096 },
      capabilities: ["embedding"],
    });
    const names = [
      "qwen3-coder:30b", "nomic-embed-text:latest", "minicpm-v:latest", "llava:latest", "qwen3:14b",
      "deepseek-r1:32b", "gemma3:vision-12b-it", "everything-tools-vision-embed:latest", "tools-r1:8b",
      "CODER:latest", "x", "phi4-reasoning-plus:latest",
    ];
    const verdictsFor = (name: string) => JSON.stringify(
      ALL_FEATURES.map((feature) => evaluate(FEATURE_REQUIREMENTS[feature], embeddingsOnly(name))),
    );
    for (const name of names) {
      expect(verdictsFor(name), `${name} was read as a capability`).toBe(verdictsFor("x"));
    }
    // And the fixed answer really is the embedding-only one: the names bought nothing.
    expect(embeddingsOnly("qwen3-coder:30b").capabilities).toEqual(new Set(["embedding"]));
    // A `model_info` key that is not `<arch>.context_length` is not a context window
    // either, whatever it is named.
    expect(embeddingsOnly("qwen3-coder:30b").contextLength).toBeUndefined();
  });

  it("is handed no name to substring, by its own signature", () => {
    // `parseOllamaCapabilities` and `evaluate` cannot read a tag: one takes a payload
    // (which the test above proves is not consulted) and the other takes a requirement
    // and a parsed set. The probe takes the name because it must ask for it — and the
    // channel tests show it going into the request body and nowhere else.
    expect(parseOllamaCapabilities.length).toBe(1);
    expect(parseLlamaCppProps.length).toBe(1);
    expect(evaluate.length).toBe(2);
  });
});

describe("requirementForRoutingRow — which row checks what", () => {
  it("maps the wizard's slots onto the features that have real requirements", () => {
    expect(requirementForRoutingRow("embedding")).toBe("memory");
    expect(requirementForRoutingRow("code")).toBe("code");
    expect(requirementForRoutingRow("collective.coordinator")).toBe("coordinator");
    expect(requirementForRoutingRow("collective.critic")).toBe("critic");
    expect(requirementForRoutingRow("researcher")).toBe("research");
  });

  it("defaults an unknown slot to the chat claim rather than to no claim at all", () => {
    for (const key of ["default", "architect", "devops", "analyst", "verifier", "coordinator", "anything-else"]) {
      expect(requirementForRoutingRow(key)).toBe("chat");
    }
  });
});

describe("a human assertion about a model the engine would not describe", () => {
  const reported = (payload: unknown) => toReport(capsOf(payload));
  /** An older Ollama, a never-observed llama.cpp, a lane that is down: the same shape
   * every one of them answers with, and the case D2 says the file may settle. */
  const SILENT: CapabilityReport = {
    capabilities: [], source: "unknown", contextLength: null,
    detail: "/api/show reported no capabilities array (older engine, or a model it cannot describe)",
  };

  it("is used where the engine stayed silent, and the verdict arrives labelled as an assertion", () => {
    const verdict = evaluateFeature("chat", SILENT, ["completion"]);
    expect(verdict.ok).toBe(true);
    expect(isUnverifiable(verdict)).toBe(false);   // the row is no longer a dead end
    expect(verdict.origin).toBe("asserted");
    // Nothing to contradict: the engine never answered, so this is the case the field
    // exists for, and the UI has to say "the file says it can" rather than "it can".
    expect(verdict.disagreement).toBeNull();
  });

  it("does not clear the row when the assertion falls short of the requirement, and names itself in the refusal", () => {
    const verdict = evaluateFeature("code", SILENT, ["completion"]);
    expect(verdict.ok).toBe(false);
    // The refusal is where the provenance matters most: read as an engine answer, "this
    // model reports completion" would be a statement about `/api/show` that was never made.
    expect(reasonOf(verdict)).toContain("needs tools");
    expect(reasonOf(verdict)).toContain("the routing entry asserts completion");
    expect(reasonOf(verdict)).not.toContain("this model reports");
  });

  it("is outranked by the engine's own answer, so an assertion cannot promote an embedder to a chat model", () => {
    // nomic-embed-text really is `["embedding"]` with no `completion` (measured, above).
    // Asserting `completion` on it is allowed and kept; using it is not.
    const verdict = evaluateFeature("chat", reported(NOMIC), ["completion"]);
    expect(verdict.ok).toBe(false);
    expect(verdict.origin).toBe("reported");
    expect(reasonOf(verdict)).toContain("needs completion");
    expect(reasonOf(verdict)).toContain("this model reports embedding");
  });

  it("never lets a refusal disappear silently: the override stands and the engine's report is named", () => {
    const verdict = evaluateFeature("chat", reported(NOMIC), ["completion"]);
    expect(verdict.disagreement).not.toBeNull();
    expect(verdict.disagreement).toContain("completion");
    // The engine's own words, not a paraphrase of them — this is the sentence a user has
    // to be able to check against the daemon.
    expect(verdict.disagreement).toContain("/api/show reported: embedding");
    expect(verdict.ok).toBe(false);   // …and the refusal is still there beside it
  });

  it("says nothing about a contradiction that is not one, including a token merely spelled differently", () => {
    expect(evaluateFeature("chat", reported(QWEN3_14B), ["thinking"]).disagreement).toBeNull();
    expect(evaluateFeature("code", reported(QWEN3_14B), ["Tools", " tools "]).disagreement).toBeNull();
    expect(evaluateFeature("code", reported(QWEN3_14B), ["Tools"]).origin).toBe("reported");
  });

  it("cannot assert a context window into existence, because nothing in the field carries one", () => {
    // The coordinator's floor is a second, separate fact. An assertion that clears the
    // capability half must not be read as having settled the window as well.
    const verdict = evaluateFeature("coordinator", SILENT, ["tools"]);
    expect(verdict.ok).toBe(true);
    expect(isUnverifiable(verdict)).toBe(true);
    expect(reasonOf(verdict)).toContain(String(COORDINATOR_MIN_CONTEXT_TOKENS));
    expect(reasonOf(verdict)).toContain("cannot verify");
  });

  it("leaves the verdict exactly where it was when nobody asserted anything", () => {
    for (const asserted of [null, undefined, [], [""]]) {
      const verdict = evaluateFeature("chat", SILENT, asserted);
      expect(verdict.origin).toBe("none");
      expect(isUnverifiable(verdict)).toBe(true);
      expect(reasonOf(verdict)).toContain("cannot verify");
    }
  });

  it("keeps `source` a statement about the engine after an override, and puts the assertion in its own field", () => {
    // The temptation this guards against is the one that would make everything else
    // unreadable: rewriting `source` to "reported" because a human said so.
    const resolved = resolveCapabilities(SILENT, ["vision"]);
    expect(resolved.capabilities.source).toBe("unknown");
    expect([...resolved.capabilities.capabilities]).toEqual(["vision"]);
    expect(resolved.capabilities.asserted).toEqual(["vision"]);
    expect(resolved.origin).toBe("asserted");
    // And the engine's own report, when there is one, is passed through untouched.
    expect(resolveCapabilities(reported(NOMIC), ["completion"]).capabilities.capabilities).toEqual(new Set(["embedding"]));
  });

  it("reads an assertion the way it reads an engine list, so a hand-typed token still lands", () => {
    const resolved = resolveCapabilities(SILENT, [" Tools ", "tools", "", "VISION"]);
    expect([...resolved.capabilities.capabilities!].sort()).toEqual(["tools", "vision"]);
  });
});

describe("the assertion vocabulary matches the engine's", () => {
  it("lets a user assert exactly the capabilities a requirement can ask for", () => {
    // The two lists are in different modules to keep `electron/routing-config.ts` free of
    // a runtime import (see the note on CAPABILITY_TOKENS), so drift is possible and this
    // is what catches it: a `requires` token outside the assertion vocabulary would be a
    // capability the app demands and no user could ever declare.
    for (const requirement of Object.values(FEATURE_REQUIREMENTS)) {
      for (const capability of requirement.requires) {
        expect(CAPABILITY_TOKENS, `requires "${capability}" is not assertable`).toContain(capability);
      }
    }
  });

  it("asserts only tokens measured on a live engine, the same list the matrix is held to", () => {
    expect([...CAPABILITY_TOKENS].sort()).toEqual(["completion", "embedding", "thinking", "tools", "vision"]);
  });
});

describe("enginesCapabilitiesFor — the id-only channel, in main", () => {
  const stored = { ollama: { kind: "ollama" as const, baseUrl: "http://127.0.0.1:11434", label: "Ollama" } };

  const showFetch = (payload: unknown) => vi.fn(async (_url: string, _init?: RequestInit) =>
    new Response(JSON.stringify(payload), { status: 200, headers: { "Content-Type": "application/json" } }));

  it("POSTs /api/show to the address the *file* holds, with only the model name in the body", async () => {
    const fetchFn = showFetch(QWEN3_14B);
    const report = await enginesCapabilitiesFor(stored, { id: "ollama", model: "qwen3:14b" }, fetchFn);
    expect(report.capabilities).toEqual(["completion", "thinking", "tools"]);
    expect(report.source).toBe("reported");
    const [url, init] = fetchFn.mock.calls[0];
    expect(url).toBe("http://127.0.0.1:11434/api/show");
    expect(init?.method).toBe("POST");
    expect(JSON.parse(String(init?.body))).toEqual({ name: "qwen3:14b" });
  });

  it("fetches nothing for an id that is not one stored lane, and says it cannot verify", async () => {
    const fetchFn = showFetch(QWEN3_14B);
    const report = await enginesCapabilitiesFor(stored, { id: "not-in-the-file", model: "qwen3:14b" }, fetchFn);
    expect(fetchFn).not.toHaveBeenCalled();
    expect(report.source).toBe("unknown");
    expect(evaluateFeature("chat", report).ok).toBe(true);
    expect(isUnverifiable(evaluateFeature("chat", report))).toBe(true);
  });

  it("ignores a caller-supplied baseUrl, so the channel cannot be aimed at another host", async () => {
    const fetchFn = showFetch(QWEN3_14B);
    await enginesCapabilitiesFor(
      stored,
      { id: "ollama", model: "qwen3:14b", baseUrl: "http://attacker.example:9999", url: "http://attacker.example:9999" },
      fetchFn,
    );
    expect(fetchFn.mock.calls[0][0]).toBe("http://127.0.0.1:11434/api/show");
  });

  it("answers nothing when two stored lanes share a kind, rather than guessing which was meant", async () => {
    const two = {
      "ollama-a": { kind: "ollama" as const, baseUrl: "http://127.0.0.1:11434" },
      "ollama-b": { kind: "ollama" as const, baseUrl: "http://127.0.0.1:11435" },
    };
    const fetchFn = showFetch(QWEN3_14B);
    const report = await enginesCapabilitiesFor(two, { id: "ollama", model: "qwen3:14b" }, fetchFn);
    expect(fetchFn).not.toHaveBeenCalled();
    expect(report.source).toBe("unknown");
  });

  it("caches per engineId:model, so a picker re-open asks once", async () => {
    const fetchFn = showFetch(QWEN3_14B);
    const cache = new Map<string, CapabilityReport>();
    const arg = { id: "ollama", model: "qwen3:14b" };
    await enginesCapabilitiesFor(stored, arg, fetchFn, cache);
    await enginesCapabilitiesFor(stored, arg, fetchFn, cache);
    await enginesCapabilitiesFor(stored, arg, fetchFn, cache);
    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect([...cache.keys()]).toEqual([capabilityCacheKey("ollama", "qwen3:14b")]);
  });

  it("keeps two models of one lane apart, and does not pin a not-answer for the session", async () => {
    const fetchFn = showFetch(QWEN3_14B);
    const cache = new Map<string, CapabilityReport>();
    await enginesCapabilitiesFor(stored, { id: "ollama", model: "qwen3:14b" }, fetchFn, cache);
    await enginesCapabilitiesFor(stored, { id: "ollama", model: "nomic-embed-text:latest" }, fetchFn, cache);
    expect(fetchFn).toHaveBeenCalledTimes(2);
    expect(cache.size).toBe(2);

    // A dead daemon is re-asked on the next open: a momentary silence must not become
    // a permanent "cannot verify" for a model that is fine.
    const down = vi.fn(async () => { throw new Error("ECONNREFUSED"); });
    const downCache = new Map<string, CapabilityReport>();
    const first = await enginesCapabilitiesFor(stored, { id: "ollama", model: "qwen3:14b" }, down, downCache);
    const second = await enginesCapabilitiesFor(stored, { id: "ollama", model: "qwen3:14b" }, down, downCache);
    expect(first.source).toBe("unknown");
    expect(second.source).toBe("unknown");
    expect(down).toHaveBeenCalledTimes(2);
    expect(downCache.size).toBe(0);
  });

  it("refuses an empty model name without probing", async () => {
    const fetchFn = showFetch(QWEN3_14B);
    const report = await enginesCapabilitiesFor(stored, { id: "ollama", model: "   " }, fetchFn);
    expect(fetchFn).not.toHaveBeenCalled();
    expect(report.source).toBe("unknown");
  });
});

describe("probing by engine kind", () => {
  it("issues a POST to /api/show for an ollama lane", async () => {
    const fetchFn = vi.fn(async (_url: string, _init?: RequestInit) => new Response(JSON.stringify(MINICPM), { status: 200 }));
    const caps = await probeModelCapabilities(OLLAMA_LANE, "minicpm-v:latest", fetchFn);
    expect(caps.capabilities).toEqual(new Set(["completion", "vision"]));
    expect(String(fetchFn.mock.calls[0][0])).toBe("http://127.0.0.1:11434/api/show");
  });

  it("reports unknown when /api/show answers 404 — \"model not found\" says nothing about capabilities", async () => {
    const fetchFn = vi.fn(async () =>
      new Response(JSON.stringify({ error: "model 'x:zz' not found" }), { status: 404 }));
    const caps = await probeModelCapabilities(OLLAMA_LANE, "x:zz", fetchFn);
    expect(caps.source).toBe("unknown");
    expect(caps.detail).toMatch(/404/);
  });

  it("reports unknown when a 200 body will not parse", async () => {
    const fetchFn = vi.fn(async () => new Response("<html>not json</html>", { status: 200 }));
    expect((await probeModelCapabilities(OLLAMA_LANE, "qwen3:14b", fetchFn)).source).toBe("unknown");
  });
});

describe("the llama.cpp lane, unverified on this machine", () => {
  it("says it cannot verify rather than assuming parity with Ollama", () => {
    // A real /props body as engine-registry.ts reads it: one alias and a handful of
    // server settings, no capability list. `capabilities` has never been observed here.
    const props = {
      model_alias: "qwen3-coder:30b", n_ctx: 8192, n_threads: 12,
      chat_format: "chatml", use_jinja: true, vocab_size: 151936,
    };
    const caps = parseLlamaCppProps(props);
    expect(caps.source).toBe("unknown");
    expect(caps.capabilities.size).toBe(0);
    expect(caps.detail).toMatch(/unverified/);
    // n_ctx is *not* read as a context floor, and the alias is not read as a capability.
    expect(caps.contextLength).toBeUndefined();
    expect(evaluate(FEATURE_REQUIREMENTS.code, caps).ok).toBe(true);
    expect(isUnverifiable(evaluate(FEATURE_REQUIREMENTS.code, caps))).toBe(true);
  });

  it("takes a capabilities array at face value if a build ever reports one", () => {
    const caps = parseLlamaCppProps({ model_alias: "x", capabilities: ["completion", "tools"] });
    expect(caps.source).toBe("reported");
    expect(caps.capabilities).toEqual(new Set(["completion", "tools"]));
    // ...and still nothing about a context window, because that field is unmeasured.
    expect(caps.contextLength).toBeUndefined();
    expect(isUnverifiable(evaluate(FEATURE_REQUIREMENTS.coordinator, caps))).toBe(true);
  });

  it("probes /props with a GET and never a POST", async () => {
    const fetchFn = vi.fn(async (_url: string, _init?: RequestInit) => new Response(JSON.stringify({ model_alias: "x" }), { status: 200 }));
    const lane: EngineDescriptor = { id: "coding", kind: "llama.cpp", baseUrl: "http://127.0.0.1:8011" };
    await probeModelCapabilities(lane, "qwen3-coder:30b", fetchFn);
    expect(String(fetchFn.mock.calls[0][0])).toBe("http://127.0.0.1:8011/props");
    expect(fetchFn.mock.calls[0][1]?.method).toBeUndefined();
  });
});

describe("the table is the single source", () => {
  it("covers every row of plan §D4", () => {
    expect(Object.keys(FEATURE_REQUIREMENTS).sort()).toEqual([
      "cad", "chat", "code", "coordinator", "critic", "memory", "research", "vision",
    ]);
  });

  it("gives every row the sentences the UI reads out, so no feature can gate without a reason", () => {
    const requirements = Object.values(FEATURE_REQUIREMENTS) as FeatureRequirement[];
    for (const requirement of requirements) {
      expect(requirement.label.length).toBeGreaterThan(0);
      expect(requirement.refusal.length).toBeGreaterThan(0);
      expect(requirement.degrade.length).toBeGreaterThan(0);
      expect(requirement.requires.length).toBeGreaterThanOrEqual(0);
      if (requirement.notVerifiable?.length) expect(requirement.whyNotVerifiable?.length).toBeGreaterThan(0);
    }
  });

  it("names only capabilities this Ollama build has been observed emitting, or says it cannot verify", () => {
    // Measured vocabulary: completion, tools, thinking, embedding, vision. A requirement
    // on some other string could only ever be unverifiable, so it must not be in
    // `requires` — it belongs in `notVerifiable` where the UI admits it.
    const observed = new Set(["completion", "tools", "thinking", "embedding", "vision"]);
    for (const [id, requirement] of Object.entries(FEATURE_REQUIREMENTS)) {
      for (const capability of requirement.requires) {
        expect(observed.has(capability), `${id} requires unmeasured capability "${capability}"`).toBe(true);
      }
    }
  });
});
