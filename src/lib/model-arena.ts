import type { EvalCase } from "../types/memex";

/**
 * Normalize legacy single-model evals and modern arena tasks into a stable,
 * ordered entrant list. The first entrant remains the case's default model.
 */
export function modelsForArena(evalCase: Pick<EvalCase, "model" | "models">): string[] {
  const candidates = evalCase.models?.length ? evalCase.models : [evalCase.model];
  return [...new Set(candidates.map((model) => model.trim()).filter(Boolean))];
}
