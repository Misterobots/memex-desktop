export type AppTab = "chat" | "goals" | "art" | "dev";

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
