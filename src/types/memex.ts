export type AppTab = "chat" | "goals" | "art" | "memory" | "tasks" | "dev" | "eval" | "settings";

// ---------------------------------------------------------------------------
// Task board types (mobile Codex loop — mirrors agent_runtime /v1/tasks)
// ---------------------------------------------------------------------------
export type TaskStatus = "running" | "completed" | "failed" | "cancelled" | "needs_input";
export type ApprovalState = "none" | "pending" | "approved" | "denied";

export interface Task {
  coordination_id:   string;
  session_id?:       string;
  title?:            string;
  status:            TaskStatus;
  phase:             number;        // 0..5
  phase_name?:       string;
  workers_total:     number;
  workers_completed: number;
  workers_failed:    number;
  scope?:            string;
  approval_state:    ApprovalState;
  preview_url?:      string;
  started_at:        number;
  updated_at?:       number;
  ended_at?:         number;
  has_diff?:         boolean;
  summary?:          string;        // detail only
  error?:            string;        // detail only
}

export interface TaskWorker {
  worker_id:     string;
  role?:         string;
  task?:         string;
  phase?:        string;
  pioneer_name?: string;
  status:        string;
  output?:       string;
  started_at?:   number;
  completed_at?: number;
}

export type MemexMode =
  | "chat"
  | "swarm"
  | "research"
  | "design"
  | "think"
  | "plan"
  | "workshop";

export const MODE_FLAGS: Record<MemexMode, Record<string, boolean>> = {
  chat:     {},
  swarm:    { swarm_mode: true },
  research: { research_mode: true },
  design:   { design_mode: true },
  think:    { ultrathink_mode: true },
  plan:     { swarm_mode: true, ultraplan_mode: true },
  workshop: { workshop_mode: true },
};

export const MODE_LABELS: Record<MemexMode, string> = {
  chat:     "Chat",
  swarm:    "Swarm",
  research: "Research",
  design:   "Design",
  think:    "Think",
  plan:     "Plan",
  workshop: "Workshop",
};

export type EventType =
  | "message"
  | "status"
  | "thought"
  | "response"
  | "log"
  | "agent_event"
  | "clarification_card"
  | "tool_call_start"
  | "tool_call_result";

export interface StreamDelta {
  content: string;
  type: EventType;
  agent_name?: string;
  pioneer_name?: string;
}

export interface StreamChunk {
  choices: Array<{ delta: StreamDelta; finish_reason: string | null }>;
}

export interface TokenUsage {
  promptTokens:     number;
  completionTokens: number;
  totalTokens:      number;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  events: MessageEvent[];
  timestamp: number;
  mode: MemexMode;
  runId?: string;
  usage?: TokenUsage;
}

// ---------------------------------------------------------------------------
// Run Inspector types (mirrored from electron/run-store.ts)
// ---------------------------------------------------------------------------
export type RunStatus = "running" | "done" | "error" | "cancelled";
export type RunEventType =
  | "message_chunk"
  | "tool_call"
  | "permission"
  | "memory_read"
  | "memory_write"
  | "file_write"
  | "error"
  | "done";

export interface RunRecord {
  id:         string;
  sessionId:  string;
  startedAt:  string;  // ISO-8601
  endedAt?:   string;
  status:     RunStatus;
  mode:       MemexMode;
  model:      string;
  profile:    string;
  message:    string;
  eventCount: number;
}

export interface RunEvent {
  runId:   string;
  seq:     number;
  type:    RunEventType;
  ts:      string;  // ISO-8601
  payload: Record<string, unknown>;
}

export interface MessageEvent {
  type: EventType;
  content: string;
  agent_name?: string;
  pioneer_name?: string;
  /** Structured payload for clarification_card events (rides outside `content`). */
  clarification?: ClarificationCard;
}

export interface Session {
  id: string;
  title: string;
  createdAt: number;
  updatedAt?: number;   // last activity — used for cross-device sync ordering
  messages: ChatMessage[];
}

export interface ConnectionStatus {
  agentRuntime: "connected" | "disconnected" | "checking";
  mempalace:    "connected" | "disconnected" | "checking";
  ollama:       "connected" | "disconnected" | "checking";
}

export interface DirEntry {
  name: string;
  path: string;
  isDir: boolean;
}

export interface ClarificationCard {
  question: string;
  context?: string;
  options?: Array<{ label: string; value: string; description?: string }>;
  allow_freetext?: boolean;
  card_type?: string;
}

// ---------------------------------------------------------------------------
// Eval Bench types (mirrored from electron/eval-store.ts)
// ---------------------------------------------------------------------------
export interface EvalCase {
  id:            string;
  name:          string;
  input:         string;
  mode:          MemexMode;
  model:         string;
  expectedNotes: string;
  rubric:        string;
  workspaceRoot?: string;
  createdAt:     string;
}

export interface EvalResult {
  id:         string;
  caseId:     string;
  runId?:     string;
  startedAt:  string;
  endedAt?:   string;
  latencyMs?: number;
  output:     string;
  score?:     number;
  notes?:     string;
}

// ---------------------------------------------------------------------------
// Skill Registry types
// ---------------------------------------------------------------------------
export interface SkillEntry {
  id:          string;
  name:        string;
  version:     string;
  enabled:     boolean;
  sourcePath:  string;
  description: string;
  modifiedAt:  string;
}
