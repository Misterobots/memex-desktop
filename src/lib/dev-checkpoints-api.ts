/** Owner-scoped DevHarness checkpoint inspection and explicit tool replay. */
import { getAgentRuntime } from "./runtime-urls";
import { apiFetch } from "./api-fetch";

export interface DevCheckpointTool {
  call_id: string;
  name: string;
  args: Record<string, unknown>;
}

export interface DevCheckpoint {
  session_id: string;
  status: string;
  turn: number;
  updated_at: number;
  model?: string;
  permission_mode?: string;
  pending_tools: DevCheckpointTool[];
  error?: string;
}

/** The only tool safe to replay is the oldest still-pending tool. */
export function nextReplayTool(checkpoint: DevCheckpoint): DevCheckpointTool | null {
  return checkpoint.pending_tools[0] ?? null;
}

export async function getDevCheckpoint(sessionId: string): Promise<DevCheckpoint | null> {
  try {
    const response = await apiFetch(
      `${getAgentRuntime()}/api/v1/dev/checkpoints/${encodeURIComponent(sessionId)}`,
      { signal: AbortSignal.timeout(8000) },
    );
    if (!response.ok) return null;
    return await response.json() as DevCheckpoint;
  } catch {
    return null;
  }
}

export async function replayDevTool(
  sessionId: string,
  callId: string,
): Promise<{ ok: boolean; status?: string; next_call_id?: string | null; error?: string }> {
  try {
    const checkpoint = await getDevCheckpoint(sessionId);
    const next = checkpoint && nextReplayTool(checkpoint);
    if (!next) return { ok: false, error: "No replayable pending tool for this session" };
    if (next.call_id !== callId) {
      return { ok: false, error: `Replay must be ordered; expected ${next.call_id}` };
    }
    const response = await apiFetch(
      `${getAgentRuntime()}/api/v1/dev/checkpoints/${encodeURIComponent(sessionId)}/replay`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ call_id: callId, confirm: true }),
      },
    );
    const data = await response.json().catch(() => ({}));
    if (!response.ok) return { ok: false, error: data?.detail ?? `Replay failed (${response.status})` };
    return { ok: true, status: data?.status, next_call_id: data?.next_call_id ?? null };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Replay request failed" };
  }
}

/** Replay exactly the next pending tool, preserving checkpoint order. */
export async function replayNextDevTool(
  sessionId: string,
): Promise<{ ok: boolean; status?: string; next_call_id?: string | null; error?: string }> {
  const checkpoint = await getDevCheckpoint(sessionId);
  const next = checkpoint && nextReplayTool(checkpoint);
  if (!next) return { ok: false, error: "No replayable pending tool for this session" };
  return replayDevTool(sessionId, next.call_id);
}
