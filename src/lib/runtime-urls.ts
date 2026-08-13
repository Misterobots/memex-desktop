/**
 * Active runtime URL accessors.
 * In Electron, populated from the active RuntimeProfile via window.memex.config.
 * In browser / tests, falls back to the Home LAN defaults.
 *
 * Call initRuntimeUrls() once at app boot before any fetch calls.
 */
import { desktop, isDesktop, AGENT_RUNTIME_DEFAULT, MEMPALACE_DEFAULT } from "./desktop";

// When served as a web app (no Electron bridge), the app sits behind a reverse
// proxy that forwards these prefixes to the backends same-origin — this avoids
// browser CORS and lets Authentik gate every request. In Electron we keep the
// absolute LAN URLs from the active RuntimeProfile.
const WEB = !isDesktop();

let _agentRuntime = WEB ? ""        : AGENT_RUNTIME_DEFAULT; // "" => same-origin (/v1/…)
let _mempalace    = WEB ? "/mp"     : MEMPALACE_DEFAULT;
let _ollama       = WEB ? "/ollama" : "http://192.168.2.101:11434";
const REMOTE_API_BASE = "https://memex.shivelymedia.com/api/backend";
let fetchConfigured = false;

/**
 * The desktop renderer is loaded from file://, while Authentik's session lives
 * at memex.shivelymedia.com. Requests to the public proxy must explicitly opt
 * into that session cookie; LAN profiles remain unchanged. Keeping this in one
 * scoped wrapper avoids duplicating credentials:"include" across every API
 * client and never sends public cookies to arbitrary custom endpoints.
 */
function configurePublicSessionFetch(): void {
  if (fetchConfigured || typeof window === "undefined") return;
  const nativeFetch = window.fetch.bind(window);
  window.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    if (url.startsWith(REMOTE_API_BASE)) {
      return nativeFetch(input, { ...init, credentials: "include" });
    }
    return nativeFetch(input, init);
  }) as typeof window.fetch;
  fetchConfigured = true;
}

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
    configurePublicSessionFetch();
  } catch {}

  // Live-update when user switches profiles
  b.config.onChange((profile) => {
    _agentRuntime = profile.agentRuntime;
    _mempalace    = profile.mempalace;
    _ollama       = profile.ollama ?? _ollama;
    configurePublicSessionFetch();
  });
}
