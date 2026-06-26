/**
 * Active runtime URL accessors.
 * In Electron, populated from the active RuntimeProfile via window.memex.config.
 * In browser / tests, falls back to the Home LAN defaults.
 *
 * Call initRuntimeUrls() once at app boot before any fetch calls.
 */
import { desktop, AGENT_RUNTIME_DEFAULT, MEMPALACE_DEFAULT } from "./desktop";

let _agentRuntime = AGENT_RUNTIME_DEFAULT;
let _mempalace    = MEMPALACE_DEFAULT;
let _ollama       = "http://192.168.2.101:11434";

export const getAgentRuntime = (): string => _agentRuntime;
export const getMempalace    = (): string => _mempalace;
export const getOllama       = (): string => _ollama;

/** Initialize from active profile; subscribe to profile changes. Call once in App.tsx. */
export async function initRuntimeUrls(): Promise<void> {
  const b = desktop();
  if (!b?.config) return; // browser / no bridge — keep defaults

  try {
    const urls = await b.config.getUrls();
    _agentRuntime = urls.agentRuntime;
    _mempalace    = urls.mempalace;
    _ollama       = urls.ollama;
  } catch {}

  // Live-update when user switches profiles
  b.config.onChange((profile) => {
    _agentRuntime = profile.agentRuntime;
    _mempalace    = profile.mempalace;
    _ollama       = profile.ollama ?? _ollama;
  });
}
