import { afterEach, describe, expect, it, vi } from "vitest";
import { GauntletHandoffStore } from "../gauntlet-handoff-store";

const files = new Map<string, string>();
vi.mock("node:fs", () => ({
  existsSync: (path: string) => files.has(path),
  readFileSync: (path: string) => files.get(path) ?? "",
  appendFileSync: (path: string, data: string) => files.set(path, `${files.get(path) ?? ""}${data}`),
}));
vi.mock("node:path", () => ({ join: (...parts: string[]) => parts.join("/") }));
let uuid = 0;
vi.mock("node:crypto", () => ({ randomUUID: () => `handoff-${++uuid}` }));

let number = 0;
function store() { return new GauntletHandoffStore(`C:/gauntlet-test-${++number}`); }
const effort = { model: "qwen3:14b", outputDetail: "high" as const, reasoningSummary: "detailed" as const, reasoningEffort: "high" as const };
afterEach(() => { files.clear(); number = 0; uuid = 0; });

describe("GauntletHandoffStore", () => {
  it("persists the immutable goal/bar/effort contract across a re-open", () => {
    const first = store();
    const packet = first.create({ sessionId: "session-1", role: "coordinator", goal: "Ship a reliable feature", qualityBar: "https://example.test/bar", effort });
    expect(first.accept(packet.id, "desktop coordinator")?.status).toBe("accepted");
    const reopened = new GauntletHandoffStore("C:/gauntlet-test-1");
    const recovered = reopened.get(packet.id);
    expect(recovered).toMatchObject({ goal: "Ship a reliable feature", qualityBar: "https://example.test/bar", effort, owner: "desktop coordinator" });
  });

  it("rejects terminal/invalid transitions and does not permit immutable-field injection", () => {
    const handoffs = store();
    const packet = handoffs.create({ sessionId: "session-2", role: "coordinator", goal: "Original", qualityBar: "Reference", effort });
    // Simulates a hostile/untyped IPC payload.
    const changed = handoffs.patch(packet.id, { goal: "Rewritten" } as never);
    expect(changed?.goal).toBe("Original");
    const accepted = handoffs.accept(packet.id, "coordinator")!;
    expect(handoffs.patch(accepted.id, { status: "completed" })?.status).toBe("completed");
    expect(handoffs.patch(accepted.id, { status: "ready" })).toBeNull();
  });
});
