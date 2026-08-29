import type { HeroWorkState } from "../types/hero";

/** Normalize backend worker/task status into the badge animation contract. */
export function heroStateForWorker(status: unknown, phase?: unknown): HeroWorkState {
  const normalized = typeof status === "string" ? status.toLowerCase() : "";
  if (normalized === "failed" || normalized === "error") return "failed";
  if (normalized === "completed" || normalized === "complete" || normalized === "done") return "complete";
  if (normalized === "waiting" || normalized === "needs_input" || normalized === "pending" || normalized === "paused") return "waiting";
  if (normalized === "review" || normalized === "reviewing" || normalized === "verifying") return "review";
  if (normalized === "created" || normalized === "queued" || normalized === "starting") return "created";
  if (typeof phase === "string" && /review|verif/i.test(phase)) return "review";
  return "working";
}
