import { useCallback, useEffect, useState } from "react";
import { desktop, type ProviderInfo } from "../../lib/desktop";

type ReadState = "idle" | "loading" | "loaded" | "failed";

/** Loopback is the only place a cleartext POST of a secret is nothing to say out
 * loud. Anything else — a LAN address, a hostname — is a different sentence, and the
 * component says it rather than assuming the profile is local. */
function isLoopback(url: string): boolean {
  try {
    const host = new URL(url).hostname.replace(/^\[|\]$/g, "");
    return host === "localhost" || host === "::1" || host === "127.0.0.1" || host.startsWith("127.");
  } catch {
    return false;
  }
}

function connectionLine(provider: ProviderInfo): { text: string; tone: "ok" | "warn" | "muted" } {
  if (provider.connected === true) return { text: "Connected", tone: "ok" };
  // `null` is the runtime refusing to answer, which is not the same claim as `false`.
  if (provider.connected === null) return { text: "connection unknown", tone: "muted" };
  return { text: "Not connected", tone: "muted" };
}

function modelSummary(provider: ProviderInfo): string {
  const count = provider.models.length;
  const base = `${count} model${count === 1 ? "" : "s"}`;
  const shadowed = provider.models.filter((m) => m.routesHere === false).length;
  return shadowed > 0 ? `${base} · ${shadowed} answered elsewhere` : base;
}

/**
 * Which model providers the harness supports, and which of them this user has
 * connected (plan D6).
 *
 * Read-only about the runtime, write-only about the secret: the catalogue and the
 * connected state come back from main with no key in them, and the one field that
 * carries a key sends it to main and never reads it back. Storage is the runtime's
 * job — it keeps keys Fernet-encrypted in its own database, per user — so this screen
 * is a door to that, not a place keys live.
 *
 * The wording is deliberately not a gate. A model whose id another provider already
 * owns (every `openai/*` spelling on OpenRouter belongs to GitHub Models here) is
 * listed and labelled, not hidden: the app's authority is the sentence, per D3a-2.
 */
export function ModelProviders() {
  const bridge = desktop();
  const [providers, setProviders] = useState<ProviderInfo[] | null>(null);
  const [reason, setReason] = useState<string | null>(null);
  const [state, setState] = useState<ReadState>("idle");
  const [runtimeIsLocal, setRuntimeIsLocal] = useState(true);
  const [target, setTarget] = useState<string>("");
  const [key, setKey] = useState("");
  const [label, setLabel] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; detail: string } | null>(null);

  const read = useCallback(async () => {
    if (!bridge?.providers?.catalog) {
      // An older preload without the channel is a failed read, not an empty one.
      setState("failed");
      setProviders(null);
      setReason("This build of the app cannot ask the runtime about providers.");
      return;
    }
    setState("loading");
    try {
      const catalog = await bridge.providers.catalog();
      setProviders(catalog.providers);
      setReason(catalog.reason);
      setState(catalog.providers.length > 0 ? "loaded" : "failed");
    } catch {
      setProviders(null);
      setReason("The runtime could not be asked.");
      setState("failed");
    }
  }, [bridge]);

  useEffect(() => { void read(); }, [read]);

  // The transport caveat depends on where the active profile points, so it is read
  // rather than assumed. Failure here is silence about a caveat, not a blocked screen.
  useEffect(() => {
    let live = true;
    void (async () => {
      try {
        const urls = await bridge?.config?.getUrls?.();
        if (live && urls?.agentRuntime) setRuntimeIsLocal(isLoopback(urls.agentRuntime));
      } catch { /* leave the local assumption in place */ }
    })();
    return () => { live = false; };
  }, [bridge]);

  // Drop the typed key whenever the form changes target, so a half-typed secret does
  // not sit in component state under a provider the user no longer means.
  useEffect(() => { setKey(""); }, [target]);

  const submit = async () => {
    if (!bridge?.providers?.connect || !target || !key.trim()) return;
    setBusy(true);
    setResult(null);
    try {
      const outcome = await bridge.providers.connect(target, key.trim(), label.trim());
      setResult(outcome);
      if (outcome.ok) {
        setKey("");
        setLabel("");
        await read();
      }
    } finally {
      setBusy(false);
    }
  };

  const disconnect = async (provider: string) => {
    if (!bridge?.providers?.disconnect) return;
    setBusy(true);
    setResult(null);
    try {
      setResult(await bridge.providers.disconnect(provider));
      await read();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-2">
      <p className="text-xs text-muted">
        Keys are stored by the runtime, encrypted and per user — not in this app. A model answered by one of
        these providers runs on that provider&rsquo;s hardware, not on your GPU.
      </p>

      {!runtimeIsLocal && (
        <p className="text-xs text-yellow">
          The active runtime is not on this machine, so a key typed here crosses the network in cleartext.
          Connect one only on a network you trust, or switch to a loopback profile first.
        </p>
      )}

      {state === "failed" && (
        <p className="px-3 py-2 rounded-lg border border-yellow/30 bg-yellow/5 text-xs text-yellow">
          {reason ?? "The runtime could not be asked."} Provider assignment is unaffected — this list is a
          disclosure, not a requirement.
        </p>
      )}

      {state === "loading" && !providers && (
        <p className="text-xs text-muted">Asking the runtime…</p>
      )}

      {providers ? (
        <ul className="space-y-1">
          {providers.map((provider) => {
            const conn = connectionLine(provider);
            const isTarget = target === provider.id;
            return (
              <li key={provider.id} className="px-3 py-2 rounded-lg border border-border/40 bg-surface2/40">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-text">{provider.label}</span>
                  <span
                    className={`text-[9px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded-full border ${
                      conn.tone === "ok" ? "border-accent/40 text-accent" : "border-border/50 text-muted"
                    }`}
                  >{conn.text}</span>
                  <span className="text-xs text-muted ml-auto">{modelSummary(provider)}</span>
                </div>

                {provider.live && (
                  <div className="text-xs text-muted">
                    Model list fetched from the provider
                    {provider.catalog?.stale ? " — still loading the full list" : ""}
                    {provider.catalog && provider.catalog.known > provider.models.length
                      ? ` (${provider.catalog.known} known)` : ""}
                    .
                  </div>
                )}

                {provider.models.length > 0 && (
                  <details className="text-xs text-muted">
                    <summary className="cursor-pointer select-none">Models</summary>
                    <ul className="mt-1 space-y-0.5 max-h-48 overflow-y-auto pr-1">
                      {provider.models.map((model) => (
                        <li key={model.id} className="flex gap-2">
                          <span className="truncate">{model.label}</span>
                          <code className="text-[10px] text-muted truncate">{model.id}</code>
                          {model.routesHere === false && (
                            <span className="text-[9px] uppercase tracking-wide text-yellow shrink-0">
                              answered elsewhere
                            </span>
                          )}
                        </li>
                      ))}
                    </ul>
                  </details>
                )}

                <div className="mt-1 flex gap-2">
                  {provider.connected === true ? (
                    <button
                      onClick={() => void disconnect(provider.id)}
                      disabled={busy}
                      className="text-xs text-muted hover:text-text disabled:opacity-50"
                    >Disconnect</button>
                  ) : (
                    <button
                      onClick={() => setTarget(isTarget ? "" : provider.id)}
                      disabled={busy}
                      className="text-xs text-accent hover:text-accent/80 disabled:opacity-50"
                    >{isTarget ? "Cancel" : "Connect"}</button>
                  )}
                </div>

                {isTarget && provider.connected !== true && (
                  <div className="mt-2 space-y-1">
                    <input
                      type="password"
                      value={key}
                      onChange={(e) => setKey(e.target.value)}
                      placeholder={`${provider.label} API key`}
                      aria-label={`${provider.label} API key`}
                      autoComplete="off"
                      spellCheck={false}
                      className="w-full px-2 py-1 text-xs rounded border border-border/50 bg-surface text-text"
                    />
                    <div className="flex gap-2">
                      <input
                        value={label}
                        onChange={(e) => setLabel(e.target.value)}
                        placeholder="Label (optional)"
                        aria-label="Label"
                        className="flex-1 min-w-0 px-2 py-1 text-xs rounded border border-border/50 bg-surface text-text"
                      />
                      <button
                        onClick={() => void submit()}
                        disabled={busy || !key.trim()}
                        className="px-3 py-1 text-xs rounded bg-accent text-surface disabled:opacity-50"
                      >{busy ? "Sending…" : "Save key"}</button>
                    </div>
                    <p className="text-[10px] text-muted">
                      Sent to the runtime and stored there. This app keeps no copy and cannot show it back.
                    </p>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      ) : null}

      {result && (
        <p
          className={`px-3 py-2 rounded-lg border text-xs ${
            result.ok
              ? "border-accent/30 bg-accent/5 text-accent"
              : "border-yellow/30 bg-yellow/5 text-yellow"
          }`}
        >{result.detail}</p>
      )}
    </div>
  );
}
