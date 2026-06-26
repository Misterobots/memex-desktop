export type AppTab = "chat" | "goals" | "art" | "dev" | "eval" | "settings";

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

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  events: MessageEvent[];
  timestamp: number;
  mode: MemexMode;
  runId?: string;
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
}

export interface Session {
  id: string;
  title: string;
  createdAt: number;
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
