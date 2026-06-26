/**
 * Session export — builds a portable JSON bundle from a session.
 * Redacts secrets (API keys, tokens) and absolute paths by default.
 */
import type { Session, ChatMessage } from "../types/memex";
import type { RunRecord, RunEvent, ArtifactRecord } from "./desktop";

export interface ExportOptions {
  session:    Session;
  runs?:      RunRecord[];
  events?:    Record<string, RunEvent[]>;
  artifacts?: ArtifactRecord[];
  profileName?: string;
  redact?:    boolean; // default true
}

export interface SessionBundle {
  version:   1;
  exportedAt: string;
  profile?:  string;
  session: {
    id:       string;
    title?:   string;
    messages: Array<{
      id:        string;
      role:      string;
      content:   string;
      mode?:     string;
      timestamp: number;
      runId?:    string;
    }>;
  };
  runs:      RunRecord[];
  events:    Record<string, RunEvent[]>;
  artifacts: Array<Omit<ArtifactRecord, "content"> & { content?: string }>;
  audit: {
    totalMessages: number;
    totalRuns:     number;
    totalArtifacts: number;
    redacted:      boolean;
  };
}

// Redact absolute paths and anything that looks like an API key/token
const SECRET_RE    = /\b(sk-[A-Za-z0-9]{20,}|eyJ[A-Za-z0-9+/=]{30,}|ghp_[A-Za-z0-9]{36,}|Bearer\s+\S+)\b/g;
const ABS_PATH_WIN = /[A-Za-z]:\\(?:[^\\/:*?"<>|\r\n]+\\)*[^\\/:*?"<>|\r\n]*/g;
const ABS_PATH_NIX = /(?:^|\s)(\/(?:home|Users|root|var|opt|etc|mnt|tmp|private)\/[^\s"',]+)/g;

function redactString(s: string): string {
  return s
    .replace(SECRET_RE, "[REDACTED]")
    .replace(ABS_PATH_WIN, "[PATH]")
    .replace(ABS_PATH_NIX, " [PATH]");
}

function redactMessage(m: ChatMessage, doRedact: boolean): { id: string; role: string; content: string; mode?: string; timestamp: number; runId?: string } {
  return {
    id:        m.id,
    role:      m.role,
    content:   doRedact ? redactString(m.content) : m.content,
    mode:      m.mode,
    timestamp: m.timestamp,
    runId:     m.runId,
  };
}

function redactArtifact(a: ArtifactRecord, doRedact: boolean): SessionBundle["artifacts"][0] {
  return {
    ...a,
    path:    doRedact && a.path    ? "[PATH]"           : a.path,
    content: doRedact && a.content ? redactString(a.content) : a.content,
  };
}

export function buildBundle(opts: ExportOptions): SessionBundle {
  const redact = opts.redact ?? true;
  const { session, runs = [], events = {}, artifacts = [], profileName } = opts;

  return {
    version:    1,
    exportedAt: new Date().toISOString(),
    profile:    profileName,
    session: {
      id:       session.id,
      title:    session.title,
      messages: session.messages.map((m) => redactMessage(m, redact)),
    },
    runs,
    events,
    artifacts: artifacts.map((a) => redactArtifact(a, redact)),
    audit: {
      totalMessages:  session.messages.length,
      totalRuns:      runs.length,
      totalArtifacts: artifacts.length,
      redacted:       redact,
    },
  };
}

export function bundleToBlob(bundle: SessionBundle): Blob {
  return new Blob([JSON.stringify(bundle, null, 2)], { type: "application/json" });
}

export function downloadBundle(bundle: SessionBundle, filename?: string): void {
  const name = filename ?? `memex-session-${bundle.session.id.slice(0, 8)}-${bundle.exportedAt.slice(0, 10)}.json`;
  const url  = URL.createObjectURL(bundleToBlob(bundle));
  const a    = document.createElement("a");
  a.href     = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}
