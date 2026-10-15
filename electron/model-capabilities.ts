/**
 * D4 — model/feature compatibility matrix.
 *
 * Every row of plan-09-24-2026.md §D4 is a claim about a model: "this one can drive
 * the coding workspace", "this one can criticise a Gauntlet run". Before this module
 * those claims were made by the human looking at a name in a dropdown, and the
 * failure class the plan keeps recording is what happens when the claim is wrong —
 * the quality bar parsed and discarded, a completion record implying a critic loop
 * that never ran. So: a feature names the capability it needs, the engine is asked
 * whether the model has it, and the answer is said **before the request**.
 *
 * The engine's answer is authoritative and it exists. Measured on this machine
 * against Ollama (`POST /api/show {name}`, 2026-09-24), the payload carries a
 * `capabilities` array of strings:
 *
 *   qwen3:14b              ["completion","tools","thinking"]      family qwen3
 *   nomic-embed-text:latest ["embedding"]                         family nomic-bert
 *   minicpm-v:latest       ["completion","vision"]                family qwen2
 *   deepseek-r1:32b        ["tools","thinking","completion"]      family qwen2
 *
 * Payload keys: license, modelfile, parameters, template, details, model_info,
 * tensors, capabilities, modified_at (`projector_info` appears on minicpm-v). There
 * is no `tags` key, and — searched for, not assumed — **no field anywhere in the
 * payload reports parseable structured output**: the strings "struct" and "grammar"
 * do not occur in any of the four responses. That is why `collective.critic` below
 * is `unverifiable` rather than gated on `thinking`, which is not the same thing.
 *
 * Two properties this module holds to:
 *
 * 1. **`source` is mandatory on every result.** "reported" means the engine answered
 *    with a capability list. "unknown" means it did not — unreachable, an older build
 *    without the field, a body that did not parse. There is deliberately no third
 *    state, because "guessed" is what produced the transcripts this slice exists to
 *    stop. An unknown row is stated as unknown in the UI, never as a pass.
 * 2. **Nothing here reads a model's name.** No substring of a tag decides anything:
 *    not "embed", not "coder", not "vision". The runtime's
 *    `_model_can_run_on_turing` (a name-marker allowlist in Memex_Core) is the
 *    cautionary precedent — it can only ever be as right as its list of spellings,
 *    and it is silently wrong for every name it has not seen. The only inputs are the
 *    fields the engine actually reported.
 *
 * Electron-free by this repo's convention (health-status.ts, ollama-residency.ts,
 * engine-registry.ts): every function takes a payload or an injectable fetch, so the
 * whole matrix is testable without a main process. The channel that *uses* it is
 * `engines:capabilities` in ipc-handlers.ts.
 */
import type { EngineDescriptor, FetchLike } from "./engine-registry";
import type { EngineConfig } from "./routing-config";
import { resolveStoredEngine } from "./engine-registry";

// ---------------------------------------------------------------------------
// What an engine said
// ---------------------------------------------------------------------------

/** `"reported"`: the engine answered with a capability list. `"unknown"`: it did not.
 * There is no third value, and nothing may add one — see the header. */
export type CapabilitySource = "reported" | "unknown";

/** The pure in-process shape. `capabilities` is a set because every use of it is a
 * membership test, and a set makes "did you check the name?" unanswerable by
 * construction. Crossing IPC it is the string-array `CapabilityReport` below. */
export interface ModelCapabilities {
  capabilities: Set<string>;
  source: CapabilitySource;
  /** Tokens. Read from `model_info["<arch>.context_length"]`, which this build does
   * report (qwen3:14b → 40960, minicpm-v → 32768, nomic-bert → 2048). It is the
   * window the GGUF was trained with, **not** the `num_ctx` the server will serve, so
   * a row that fails a floor on this number is failing on the model, not on the run.
   * Absent when the engine did not report it — never inferred. */
  contextLength?: number;
  /** Why the source is what it is, so the UI can say it rather than paraphrase. */
  detail: string;
  /** A human assertion from `routing.<slot>.capabilities`, present only on a value
   * produced by `resolveCapabilities` and never on one parsed from an engine. It is not
   * a third `source`: `source` keeps reporting what the **engine** did, and an engine
   * that stayed silent is still `unknown` after somebody asserted something. What it
   * carries is the provenance a refusal has to name — "the routing entry asserts
   * vision" and "this model reports vision" are different claims, and only one of them is
   * checkable against `/api/show`. */
  asserted?: string[];
}

/** The wire form of `ModelCapabilities`: the same facts, JSON-safe. */
export interface CapabilityReport {
  capabilities: string[];
  source: CapabilitySource;
  contextLength: number | null;
  detail: string;
}

export function toReport(caps: ModelCapabilities): CapabilityReport {
  return {
    capabilities: [...caps.capabilities].sort(),
    source: caps.source,
    contextLength: caps.contextLength ?? null,
    detail: caps.detail,
  };
}

export function fromReport(report: CapabilityReport | null | undefined): ModelCapabilities {
  if (!report) {
    return unknownCapabilities("this build never asked the engine");
  }
  return {
    capabilities: new Set(Array.isArray(report.capabilities) ? report.capabilities : []),
    source: report.source === "reported" ? "reported" : "unknown",
    ...(typeof report.contextLength === "number" ? { contextLength: report.contextLength } : {}),
    detail: typeof report.detail === "string" ? report.detail : "",
  };
}

export function unknownCapabilities(detail: string): ModelCapabilities {
  return { capabilities: new Set(), source: "unknown", detail };
}

/** Normalise whatever `capabilities` arrived as. An array of strings becomes the set;
 * anything else is not an answer, which is `unknown`, not an empty set wearing
 * `reported` — the difference matters, because "reports nothing" is a factual claim
 * about the model and "did not say" is a claim about the engine. */
function stringList(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null;
  const items = value.filter((entry): entry is string => typeof entry === "string" && entry.trim() !== "");
  return items.length ? items : null;
}

/** `POST /api/show` → the model's own context window, from `model_info`.
 * Keyed by the architecture the file reports (`general.architecture`), which is a
 * lookup into engine-supplied metadata; the same suffix scan `ollama:contextLength`
 * already does at ipc-handlers.ts:654, kept here so the whole payload is read once. */
function contextLengthOf(payload: Record<string, unknown>): number | undefined {
  const info = payload.model_info;
  if (!info || typeof info !== "object" || Array.isArray(info)) return undefined;
  const entries = Object.entries(info as Record<string, unknown>);
  const architecture = entries.find(([key]) => key === "general.architecture")?.[1];
  const wanted = typeof architecture === "string" ? `${architecture}.context_length` : "";
  const direct = wanted ? (info as Record<string, unknown>)[wanted] : undefined;
  if (typeof direct === "number" && Number.isFinite(direct) && direct > 0) return direct;
  const matches = entries.filter(([key, value]) => key.endsWith(".context_length") && typeof value === "number");
  return matches.length === 1 ? (matches[0][1] as number) : undefined;
}

/** A `/api/show` body — the whole `capabilities` array is taken at face value, and
 * nothing else in the payload is allowed to add to it. */
export function parseOllamaCapabilities(showPayload: unknown): ModelCapabilities {
  if (!showPayload || typeof showPayload !== "object" || Array.isArray(showPayload)) {
    return unknownCapabilities("/api/show answered with a body this build cannot read");
  }
  const payload = showPayload as Record<string, unknown>;
  const contextLength = contextLengthOf(payload);
  const reported = stringList(payload.capabilities);
  if (!reported) {
    // An older Ollama, or a proxy that stripped the field. The context number may
    // still be real, so it is kept — it is a separate fact from the capability list.
    return {
      ...unknownCapabilities("/api/show reported no capabilities array (older engine, or a model it cannot describe)"),
      ...(contextLength === undefined ? {} : { contextLength }),
    };
  }
  return {
    capabilities: new Set(reported.map((entry) => entry.trim().toLowerCase())),
    source: "reported",
    ...(contextLength === undefined ? {} : { contextLength }),
    detail: `/api/show reported: ${reported.join(", ")}`,
  };
}

/** A llama.cpp `GET /props` body.
 *
 * **Unverified on this machine.** No llama-server was reachable when this was written
 * (probed 8080/8081/8000/1234 — 8081 is cAdvisor, 8008 a FastAPI app), so unlike the
 * Ollama keys above, which are transcribed from live responses, no `/props` key has
 * been observed here. `engine-registry.ts` reads exactly one field from it,
 * `model_alias`, and that is the only `/props` fact in this repo's evidence.
 *
 * So this reads a `capabilities` array of strings **if** a build happens to report
 * one, and nothing else — no `n_ctx` → chat, no `model_type` → vision, no fallback
 * inference from the fields a llama.cpp row does carry. Everything else about a
 * llama.cpp lane is therefore `unknown`, and the UI says "cannot verify" rather than
 * assuming parity with Ollama. When a server is reachable, the correction is one
 * measured field name, not a restructure. */
export function parseLlamaCppProps(propsPayload: unknown): ModelCapabilities {
  const reported = stringList(propsPayload && typeof propsPayload === "object" && !Array.isArray(propsPayload)
    ? (propsPayload as Record<string, unknown>).capabilities
    : null);
  if (!reported) {
    return unknownCapabilities("/props reports no capability list this build recognises (unverified against a live llama.cpp server)");
  }
  return {
    capabilities: new Set(reported.map((entry) => entry.trim().toLowerCase())),
    source: "reported",
    detail: `/props reported: ${reported.join(", ")}`,
  };
}

// ---------------------------------------------------------------------------
// What a feature needs — plan §D4, one entry per row of that table
// ---------------------------------------------------------------------------

export interface FeatureRequirement {
  /** What the user reads when this row names itself. */
  label: string;
  /** Every one of these must be in the engine's reported set. `"completion"`,
   * `"tools"`, `"embedding"`, `"vision"`, `"thinking"` are the values this Ollama
   * build emits; a capability the engine has never named simply fails. */
  requires: readonly string[];
  /** The floor `contextLength` must reach. Undefined means this row is not
   * context-gated. */
  minContextTokens?: number;
  /** What this row needs that **no field of either engine's answer measures**. Such a
   * row can never be a pass: it is reported `unverifiable` with `whyNotVerifiable` as
   * the sentence, so the app says the thing it cannot promise instead of quietly
   * assuming it. The critic row is the reason this exists. */
  notVerifiable?: readonly string[];
  whyNotVerifiable?: string;
  /** Said when `requires`/`minContextTokens` is not met. The engine's own report is
   * appended by `evaluate`, so this stays the human half of the sentence. */
  refusal: string;
  /** Where the app degrades instead of refusing — kept on the row so the table is the
   * single source the plan asks for, not per-feature `if`s. */
  degrade: string;
}

/** 16 384 tokens. A judgement call, stated as one: the plan's words are "long context
 * (the perspective matrix plus its transcripts)" with no number, and inventing a
 * threshold is exactly the guess this module refuses elsewhere. This figure is chosen
 * so that it separates the trivially-small windows from the rest without excluding any
 * model measured on this machine — all four sit at 2 048…40 960, and only the 2 048
 * one (nomic-bert, which fails on capability anyway) is below it. Lower it or raise it
 * in one place if the coordinator's real transcript budget says otherwise. */
export const COORDINATOR_MIN_CONTEXT_TOKENS = 16384;

export const FEATURE_REQUIREMENTS = {
  chat: {
    label: "Chat",
    requires: ["completion"],
    refusal: "needs a model that can complete instructions",
    degrade: "no conversation from this model",
  },
  code: {
    label: "Code / DevHarness",
    requires: ["tools"],
    refusal: "needs tool calling for its read/write/edit/exec round-trips",
    degrade: "the workspace stays shut for this model",
  },
  coordinator: {
    label: "Collective coordinator",
    requires: ["tools"],
    minContextTokens: COORDINATOR_MIN_CONTEXT_TOKENS,
    refusal: "needs tool calling and a long context window for the matrix plus its transcripts",
    degrade: "warn before the run — a short-context model truncates silently",
  },
  critic: {
    label: "Collective critic / Gauntlet verdict",
    requires: ["completion"],
    notVerifiable: ["structured output"],
    whyNotVerifiable:
      "no field of /api/show or /props reports parseable structured output, so this build cannot verify that a model emits the verdict grammar (VERDICT: PASS) — and it will not stand in `thinking` for it",
    refusal: "needs a model that can complete at all, before the verdict grammar is even asked about",
    degrade: "refuse the Gauntlet rather than run a critic that can emit unparsable verdicts",
  },
  research: {
    label: "Research / Perspectives",
    requires: ["completion"],
    notVerifiable: ["concurrent lanes"],
    whyNotVerifiable:
      "how many lanes answer at once is a property of the machine's run style, not of a model, so no capability list can settle it",
    refusal: "needs a completion model for each perspective",
    degrade: "single style collapses the matrix to serial",
  },
  memory: {
    label: "Memory (MemPalace)",
    requires: ["embedding"],
    refusal: "needs an embedding model, which is a different slot from the chat model",
    degrade: "memory writes queue instead of failing the turn",
  },
  vision: {
    label: "Image grounding / Design",
    requires: ["vision"],
    refusal: "needs vision input",
    degrade: "hide the attach control for this model rather than 400 at send time",
  },
  cad: {
    label: "CAD / OpenSCAD, Unreal lanes",
    requires: ["tools"],
    minContextTokens: COORDINATOR_MIN_CONTEXT_TOKENS,
    refusal: "needs tool execution and a long context window",
    degrade: "the lane does not open for this model",
  },
} as const satisfies Record<string, FeatureRequirement>;

export type FeatureId = keyof typeof FEATURE_REQUIREMENTS;

export const ALL_FEATURES = Object.keys(FEATURE_REQUIREMENTS) as FeatureId[];

/** Which row of the matrix a wizard assignment row is checking against.
 *
 * `embedding` is the memory slot and `code` the DevHarness slot, so those two rows
 * genuinely need what they name. The coordinator keeps its floor. `collective.critic`
 * has no row in the editor (routing-config's `UNPRESENTED_ROWS`) and is mapped here
 * anyway, so a table that does carry one is evaluated rather than ignored. Every
 * other row — `default` and the five unslootted roles — is completion-class: the
 * runtime will be carrying on a conversation with that model.
 *
 * Anything unrecognised maps to `chat` because that is the claim every model is being
 * asked to meet; an unknown slot name must not become an unchecked row. */
const FEATURE_BY_ROUTING_ROW: Record<string, FeatureId> = {
  embedding: "memory",
  code: "code",
  "collective.coordinator": "coordinator",
  "collective.critic": "critic",
  researcher: "research",
};

export function requirementForRoutingRow(rowKey: string): FeatureId {
  return FEATURE_BY_ROUTING_ROW[rowKey] ?? "chat";
}

// ---------------------------------------------------------------------------
// The check
// ---------------------------------------------------------------------------

export type Evaluation =
  | { ok: true }
  | { ok: true; unverifiable: true; reason: string }
  | { ok: false; reason: string };

/** A pass the app cannot stand behind. Both other members carry `ok: true`, so
 * `"unverifiable" in verdict` alone is not a narrowing this union supports — and a
 * component that got this wrong would render a limitation as a clean row, which is the
 * exact defect class. One predicate, tested, so neither call site re-derives it. */
export function isUnverifiable(verdict: Evaluation): verdict is { ok: true; unverifiable: true; reason: string } {
  return "unverifiable" in verdict && verdict.unverifiable === true;
}

/** What the engine said, phrased for a sentence. An empty set is "nothing", which is
 * different from the engine not having answered at all — that case is handled above it
 * by `source === "unknown"` and never reaches here. */
function reported(caps: ModelCapabilities): string {
  return caps.capabilities.size ? [...caps.capabilities].sort().join(", ") : "no capabilities at all";
}

/** The subject of the clause that names a capability set in a refusal. Two kinds of
 * claim, and the sentence has to carry which one it is: an engine answer can be checked
 * by re-asking the engine, a human assertion can only be checked by looking at the
 * routing file. `reported()` above is the verb half; this is the noun half. */
const ENGINE_SUBJECT = "this model reports";
const ASSERTION_SUBJECT = "the routing entry asserts";

function subjectOf(caps: ModelCapabilities): string {
  return caps.source === "reported" || !caps.asserted?.length ? ENGINE_SUBJECT : ASSERTION_SUBJECT;
}

/** Which of the two possible inputs a verdict was computed from.
 *
 * `"reported"` — the engine answered, so this row's claim is checkable by asking again.
 * `"asserted"` — the engine did not answer and a human did; the claim is in the file.
 * `"none"` — neither, which is the "cannot verify" row D4 established and the case the
 * override exists to get out of. */
export type CapabilityOrigin = "reported" | "asserted" | "none";

export interface ResolvedCapabilities {
  /** The one set every check is computed from. */
  capabilities: ModelCapabilities;
  origin: CapabilityOrigin;
  /** A human asserted what the engine's own answer contradicts. Non-null only in that
   * case, and always naming the engine's report, because "the file says it can" and "the
   * engine says it can" are different claims and the reader has to be able to tell them
   * apart. The assertion is *not* voided by this — see `evaluateFeature`. */
  disagreement: string | null;
}

/** Weigh an engine answer against a routing assertion.
 *
 * The rule is one line and it is the whole point: **an engine answer outranks a human
 * assertion**, so `capabilities` is the engine's whenever the engine answered, and the
 * asserted list is used only where the engine is silent. That ordering is what keeps the
 * override from becoming a guess dressed as a fact — a user who asserts `completion`
 * about an embedding-only model does not get to make the model a chat model, they get a
 * notice that says the engine disagrees, in the engine's own words, and their entry is
 * left exactly as they wrote it. People are allowed to be right about their own hardware;
 * they are not allowed to be quietly wrong.
 *
 * `asserted` is normalised the same way an engine's list is (trimmed, lower-cased) so a
 * hand-typed `"Tools"` matches a reported `tools` instead of looking like a contradiction.
 * A context window is deliberately not overridable: nothing in `RouteTarget` claims one,
 * so a context floor still answers "cannot verify" whatever the user asserted.
 */
export function resolveCapabilities(
  report: CapabilityReport | null | undefined,
  asserted?: readonly string[] | null,
): ResolvedCapabilities {
  const tokens = [...new Set((Array.isArray(asserted) ? asserted : [])
    .filter((token): token is string => typeof token === "string")
    .map((token) => token.trim().toLowerCase())
    .filter(Boolean))];
  const fromEngine = report?.source === "reported" ? fromReport(report) : null;

  if (fromEngine) {
    const contradicted = tokens.filter((token) => !fromEngine.capabilities.has(token));
    return {
      capabilities: fromEngine,
      origin: "reported",
      disagreement: contradicted.length
        ? `${ASSERTION_SUBJECT} ${contradicted.join(", ")}; the engine's own answer is different — ${report?.detail || "no capability list"}`
        : null,
    };
  }

  if (tokens.length) {
    // `source` stays `unknown` — the engine really did not answer, and that is a fact
    // worth keeping after the override. What changes is that there is now something to
    // check a requirement against, and `asserted` is what makes `evaluate` say so.
    const silent = fromReport(report);
    return {
      capabilities: { ...silent, capabilities: new Set(tokens), asserted: tokens },
      origin: "asserted",
      disagreement: null,
    };
  }

  return { capabilities: fromReport(report), origin: "none", disagreement: null };
}

/** The one place a limitation becomes a sentence. Returns a pass, a refusal, or a
 * pass-that-says-it-is-unverified; it never invents the third. */
export function evaluate(requirement: FeatureRequirement, caps: ModelCapabilities): Evaluation {
  if (caps.source === "unknown" && !caps.asserted?.length) {
    return {
      ok: true,
      unverifiable: true,
      reason: `${requirement.label}: cannot verify — the engine did not answer (${caps.detail || "no capability report"})`,
    };
  }

  const missing = requirement.requires.filter((capability) => !caps.capabilities.has(capability));
  if (missing.length) {
    return {
      ok: false,
      // The capability token is quoted, not paraphrased: "needs a model that can
      // complete instructions" is prose a reader cannot check against the engine, while
      // `needs completion` is the exact field that was absent. Both halves, always.
      reason: `${requirement.label} ${requirement.refusal} — needs ${missing.join(", ")}; ${subjectOf(caps)} ${reported(caps)}`,
    };
  }

  if (requirement.minContextTokens !== undefined) {
    if (caps.contextLength === undefined) {
      return {
        ok: true,
        unverifiable: true,
        reason: `${requirement.label} wants ${requirement.minContextTokens} tokens of context and this engine did not report a context window — cannot verify`,
      };
    }
    if (caps.contextLength < requirement.minContextTokens) {
      return {
        ok: false,
        reason: `${requirement.label} ${requirement.refusal} — needs at least ${requirement.minContextTokens} tokens of context; this model reports ${caps.contextLength}`,
      };
    }
  }

  if (requirement.notVerifiable?.length) {
    return {
      ok: true,
      unverifiable: true,
      reason: `${requirement.label}: ${requirement.whyNotVerifiable ?? `this build cannot verify ${requirement.notVerifiable.join(", ")}`} — not checked, only stated`,
    };
  }

  return { ok: true };
}

/** A verdict plus the two things the UI has to say about it that `evaluate` cannot:
 * which input produced it, and whether a human is currently contradicting an engine.
 *
 * Spelled as three members rather than `Evaluation & {…}` so that narrowing keeps
 * working at the call sites — `isUnverifiable` and `!verdict.ok` both rely on the
 * discriminant, and an intersection of a union would leave `reason` unresolvable. */
export type FeatureVerdict =
  | { ok: true; origin: CapabilityOrigin; disagreement: string | null }
  | { ok: true; unverifiable: true; reason: string; origin: CapabilityOrigin; disagreement: string | null }
  | { ok: false; reason: string; origin: CapabilityOrigin; disagreement: string | null };

/** Renderer-facing convenience: requirement id + wire report (+ the routing entry's
 * assertion) → verdict.
 *
 * `asserted` is `RouteTarget.capabilities` — what a human wrote in config.json because
 * the engine would not say. It reaches the check through `resolveCapabilities`, so the
 * ordering is not a caller's choice: the engine's answer is used when there is one, and
 * then `origin` is `"reported"` and the assertion is only ever a `disagreement` to be
 * shown. **An override never makes a refusal disappear silently** — it clears a
 * "cannot verify" on its own, and where the engine contradicts it, the refusal stands and
 * the sentence names the engine's report. */
export function evaluateFeature(
  feature: FeatureId,
  report: CapabilityReport | null | undefined,
  asserted?: readonly string[] | null,
): FeatureVerdict {
  const resolved = resolveCapabilities(report, asserted);
  const caps = resolved.capabilities;
  const extra = { origin: resolved.origin, disagreement: resolved.disagreement };
  const verdict = evaluate(FEATURE_REQUIREMENTS[feature], caps);
  // Each member rebuilt on its own rather than one spread of a union: TS will not
  // distribute a spread over `Evaluation`, and the union above is what the call sites
  // narrow on.
  if (!verdict.ok) return { ok: false, reason: verdict.reason, ...extra };
  return "unverifiable" in verdict
    ? { ok: true, unverifiable: true, reason: verdict.reason, ...extra }
    : { ok: true, ...extra };
}

// ---------------------------------------------------------------------------
// Asking the engine, and remembering the answer
// ---------------------------------------------------------------------------

const PROBE_TIMEOUT_MS = 4000;

/** `POST {base}/api/show {name}` — the only way to get a capability list on Ollama,
 * and the reason this lives in the main process: a renderer fetch is confined to the
 * active profile's URLs by `prepareApiRequest`, and this is a POST to a path the
 * profile does not name. */
export async function probeOllamaCapabilities(
  engine: EngineDescriptor,
  model: string,
  fetchFn: FetchLike = fetch,
): Promise<ModelCapabilities> {
  let res: Response;
  try {
    res = await fetchFn(`${engine.baseUrl}/api/show`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: model }),
      signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
    });
  } catch {
    return unknownCapabilities(`${engine.baseUrl} did not answer /api/show`);
  }
  if (!res.ok) {
    // 404 is the engine answering about this model ("model 'x' not found" on this
    // build). It says nothing about capabilities, so it is unknown, not a refusal.
    return unknownCapabilities(`/api/show answered ${res.status} for ${model}`);
  }
  let body: unknown;
  try {
    body = await res.json();
  } catch {
    return unknownCapabilities("/api/show answered 200 with a body that did not parse");
  }
  return parseOllamaCapabilities(body);
}

/** `GET {base}/props`. Unreachable and unanswered both arrive as `unknown`. */
export async function probeLlamaCppCapabilities(
  engine: EngineDescriptor,
  fetchFn: FetchLike = fetch,
): Promise<ModelCapabilities> {
  let res: Response;
  try {
    res = await fetchFn(`${engine.baseUrl}/props`, { signal: AbortSignal.timeout(PROBE_TIMEOUT_MS) });
  } catch {
    return unknownCapabilities(`${engine.baseUrl} did not answer /props`);
  }
  if (!res.ok) return unknownCapabilities(`/props answered ${res.status}`);
  let body: unknown;
  try {
    body = await res.json();
  } catch {
    return unknownCapabilities("/props answered 200 with a body that did not parse");
  }
  return parseLlamaCppProps(body);
}

export async function probeModelCapabilities(
  engine: EngineDescriptor,
  model: string,
  fetchFn: FetchLike = fetch,
): Promise<ModelCapabilities> {
  if (!model.trim()) return unknownCapabilities("no model was named");
  switch (engine.kind) {
    case "ollama":
      return probeOllamaCapabilities(engine, model.trim(), fetchFn);
    case "llama.cpp":
      return probeLlamaCppCapabilities(engine, fetchFn);
    default:
      // A kind this build does not speak cannot be asked, which is unknown — not a
      // pass, and not a refusal either.
      return unknownCapabilities(`no capability probe exists for engine kind "${engine.kind}"`);
  }
}

/** Keyed the way the brief names it: one answer per engine lane and model. */
export function capabilityCacheKey(engineId: string, model: string): string {
  return `${engineId}:${model}`;
}

/**
 * `engines:capabilities` — the whole main-side operation, id-only.
 *
 * `arg` is an `unknown` renderer payload and the fields read from it are `id` and
 * `model`, nothing else: the address probed is the one `resolveStoredEngine` finds in
 * the **stored** `engines` map, so `{ id, baseUrl: "http://attacker:9999" }` fetches
 * nothing. That is the boundary the previous slice established for `engines:modelsFor`
 * and it is carried over unchanged, including "two stored lanes of one kind answer
 * nothing".
 *
 * `cache` is passed in by the caller (main holds one for the process lifetime). Only
 * `reported` answers are stored: an `unknown` from an engine that was momentarily down
 * must not be pinned for the session, and a model the user pulls five minutes later
 * should become checkable on the next open. `/api/show` is local and cheap; re-asking
 * it on a miss is the cheaper half of that trade, and is why nothing caches per row on
 * every picker open.
 */
export async function enginesCapabilitiesFor(
  stored: Record<string, EngineConfig> | null | undefined,
  arg: unknown,
  fetchFn: FetchLike = fetch,
  cache: Map<string, CapabilityReport> = new Map(),
): Promise<CapabilityReport> {
  const payload = arg && typeof arg === "object" && !Array.isArray(arg) ? (arg as Record<string, unknown>) : {};
  const model = typeof payload.model === "string" ? payload.model.trim() : "";
  const engine = resolveStoredEngine(stored, payload);
  if (!engine) {
    return toReport(unknownCapabilities(model
      ? `${text(payload.id)} is not a single stored engine lane, so nothing was probed`
      : "no stored engine lane and no model were named"));
  }
  if (!model) {
    return toReport(unknownCapabilities(`${engine.id} was asked about an empty model name`));
  }

  const key = capabilityCacheKey(engine.id, model);
  const cached = cache.get(key);
  if (cached) return cached;

  const caps = await probeModelCapabilities(engine, model, fetchFn);
  const report = toReport(caps);
  if (caps.source === "reported") cache.set(key, report);
  return report;
}

function text(value: unknown): string {
  return typeof value === "string" && value.trim() ? value.trim() : "(no id)";
}
