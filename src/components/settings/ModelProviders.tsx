import { useCallback, useEffect, useState } from "react";
import { desktop, type ProviderInfo, type ProviderModel } from "../../lib/desktop";

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

/** What the row says about how many of a provider's models this user is offered.
 *
 * Only a connected live provider has a selection to summarise. For one that is
 * connected with nothing chosen, the sentence is the point of D7 — a key alone offers
 * zero rows — so it is stated rather than left for the user to infer from an empty
 * picker. */
function offeredSummary(provider: ProviderInfo, chosen: string[]): string | null {
  if (!provider.connected || !provider.live) return null;
  const total = provider.models.length;
  if (chosen.length === 0) return `0 of ${total} offered — select the models to use`;
  return `${chosen.length} of ${total} offered`;
}

const sameSet = (a: string[], b: string[]): boolean =>
  a.length === b.length && [...a].sort().every((v, i) => v === [...b].sort()[i]);

/** An id the runtime will not route through this provider, because another provider
 * owns the binding. `routesHere === false` is the runtime saying so; `undefined` is it
 * not having said anything, which is not the same claim and never disables a row. */
const notRoutable = (model: ProviderModel): boolean => model.routesHere === false;

/**
 * Which model providers the harness supports, which of them this user has connected
 * (plan D6), and — for a gateway whose catalogue is fetched rather than declared — which
 * of its models this user is actually offered (plan D7).
 *
 * Read-only about the runtime, write-only about the secret: the catalogue and the
 * connected state come back from main with no key in them, and the one field that
 * carries a key sends it to main and never reads it back. Storage is the runtime's
 * job — it keeps keys Fernet-encrypted in its own database, per user — so this screen
 * is a door to that, not a place keys live.
 *
 * The selection editor exists because a gateway lists 460 models and a picker showing
 * all of them is a firehose, not a menu. It is deliberately *not* applied to a curated
 * provider: three to eight models is already a menu, and making those users opt in
 * would be a behaviour change smuggled in beside a new control.
 *
 * The wording is deliberately not a gate. A model whose id another provider already
 * owns (every `openai/*` spelling on OpenRouter belongs to GitHub Models here) is
 * listed and labelled, not hidden: the app's authority is the sentence, per D3a-2. Its
 * checkbox is disabled rather than absent, because selecting it would be a choice that
 * cannot take effect — the runtime routes that id to its other owner regardless.
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
  /** D7 — unsaved choices, keyed by provider. Absent means "whatever the runtime last
   * reported", so opening the screen never shows a selection nobody made. */
  const [draft, setDraft] = useState<Record<string, string[]>>({});
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [savingSelection, setSavingSelection] = useState<string | null>(null);

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
      // The runtime's answer replaces any half-edited list: every path that re-reads
      // is one where a write just landed or a key changed, and keeping a draft over a
      // fresh selection would show a choice the server does not have.
      setDraft({});
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

  /** The selection to render: an unsaved edit if this row has one, else what the
   * runtime reported. */
  const chosenFor = (provider: ProviderInfo): string[] =>
    draft[provider.id] ?? provider.selectedModels ?? [];

  const toggleModel = (provider: ProviderInfo, model: ProviderModel, on: boolean) => {
    // The row is already disabled for this case, but the invariant lives here rather
    // than in the control: a selection holding an id the runtime routes elsewhere would
    // be offered to the user as a choice that cannot take effect.
    if (notRoutable(model)) return;
    const current = chosenFor(provider);
    const next = on
      ? [...new Set([...current, model.id])]
      : current.filter((m) => m !== model.id);
    setDraft((d) => ({ ...d, [provider.id]: next }));
  };

  const saveSelection = async (provider: ProviderInfo) => {
    if (!bridge?.providers?.setSelection) return;
    setSavingSelection(provider.id);
    setResult(null);
    try {
      const outcome = await bridge.providers.setSelection(provider.id, chosenFor(provider));
      setResult({ ok: outcome.ok, detail: outcome.detail });
      if (outcome.ok) await read();
      // On a refusal the draft stays: the checkboxes keep showing what the user asked
      // for, because losing it would make a failed write look like an abandoned edit.
    } finally {
      setSavingSelection(null);
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
            const chosenList = chosenFor(provider);
            const chosen = new Set(chosenList);
            const dirty = !sameSet(chosenList, provider.selectedModels ?? []);
            const canEdit = provider.connected === true && provider.live && provider.models.length > 0;
            const needle = (filters[provider.id] ?? "").trim().toLowerCase();
            // Chosen first, then by label: on a 460-row gateway catalogue, a list sorted
            // only by name cannot show what is already picked without scrolling for it.
            const rows = provider.models
              .filter((m) => !needle
                || m.label.toLowerCase().includes(needle)
                || m.id.toLowerCase().includes(needle))
              .sort((a, b) => (chosen.has(b.id) ? 1 : 0) - (chosen.has(a.id) ? 1 : 0)
                || a.label.localeCompare(b.label));
            return (
              <li key={provider.id} className="px-3 py-2 rounded-lg border border-border/40 bg-surface2/40">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-text">{provider.label}</span>
                  <span
                    className={`text-[9px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded-full border ${
                      conn.tone === "ok" ? "border-accent/40 text-accent" : "border-border/50 text-muted"
                    }`}
                  >{conn.text}</span>
                  <span className="text-xs text-muted ml-auto">
                    {offeredSummary(provider, chosenList) ?? modelSummary(provider)}
                  </span>
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

                {canEdit && (
                  <div className="mt-2 space-y-1">
                    <div className="flex items-center gap-2">
                      <input
                        value={filters[provider.id] ?? ""}
                        onChange={(e) => setFilters((f) => ({ ...f, [provider.id]: e.target.value }))}
                        placeholder="Filter models…"
                        aria-label={`Filter ${provider.label} models`}
                        className="flex-1 min-w-0 px-2 py-1 text-xs rounded border border-border/50 bg-surface text-text"
                      />
                      <span className="text-[10px] text-muted shrink-0" data-selected-count>
                        {chosenList.length} selected
                      </span>
                    </div>

                    <ul className="max-h-56 overflow-y-auto pr-1 space-y-0.5 text-xs" aria-label={`${provider.label} models`}>
                      {rows.map((model) => {
                        const elsewhere = notRoutable(model);
                        return (
                          <li key={model.id}>
                            <label className={`flex items-start gap-2 ${elsewhere ? "opacity-60" : "cursor-pointer"}`}>
                              <input
                                type="checkbox"
                                checked={chosen.has(model.id)}
                                disabled={elsewhere}
                                onChange={(e) => toggleModel(provider, model, e.target.checked)}
                                aria-label={model.id}
                                title={elsewhere
                                  ? `Another provider already answers ${model.id} on your runtime, so selecting it here does not route it through ${provider.label}.`
                                  : undefined}
                              />
                              <span className="min-w-0">
                                <span className="block truncate">{model.label}</span>
                                <code className="block text-[10px] text-muted truncate">{model.id}</code>
                                {elsewhere && (
                                  <span className="text-[9px] uppercase tracking-wide text-yellow">
                                    answered elsewhere
                                  </span>
                                )}
                              </span>
                            </label>
                          </li>
                        );
                      })}
                      {rows.length === 0 && (
                        <li className="px-1 py-2 text-xs text-muted">
                          No {provider.label} model matches “{filters[provider.id] ?? ""}”.
                        </li>
                      )}
                    </ul>

                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => void saveSelection(provider)}
                        disabled={!dirty || savingSelection === provider.id || !bridge?.providers?.setSelection}
                        className="px-3 py-1 text-xs rounded bg-accent text-surface disabled:opacity-50"
                      >
                        {savingSelection === provider.id ? "Saving…" : dirty ? "Save selection" : "No changes"}
                      </button>
                      {dirty && (
                        <button
                          onClick={() => setDraft((d) => {
                            const next = { ...d };
                            delete next[provider.id];
                            return next;
                          })}
                          disabled={savingSelection === provider.id}
                          className="text-xs text-muted hover:text-text disabled:opacity-50"
                        >Discard</button>
                      )}
                      {!bridge?.providers?.setSelection && (
                        <span className="text-[10px] text-muted">
                          This build of the app cannot save a selection.
                        </span>
                      )}
                    </div>
                  </div>
                )}

                {provider.connected === true && !provider.live && provider.models.length > 0 && (
                  <div className="text-xs text-muted">
                    All of these are offered while the key is connected — a provider this
                    short does not need a selection.
                  </div>
                )}

                {(!canEdit) && provider.models.length > 0 && (
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
