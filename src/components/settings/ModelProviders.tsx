import { useCallback, useEffect, useState } from "react";
import { desktop, type ProviderInfo, type ProviderModel } from "../../lib/desktop";
import { splitModelIds } from "../../../electron/provider-keys";

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
 * picker.
 *
 * No denominator here. An id can be offered that the fetched catalogue does not carry,
 * and "4 of 3 offered" is the sentence that produces; the total lives on the browse
 * control, where it describes the list being browsed. */
function offeredSummary(provider: ProviderInfo, chosen: string[]): string | null {
  if (!provider.connected || !provider.live) return null;
  if (chosen.length === 0) return "nothing offered yet";
  const known = new Set(provider.models.map((m) => m.id));
  const unknown = chosen.filter((id) => !known.has(id)).length;
  return `${chosen.length} offered${unknown > 0 ? ` · ${unknown} not in the fetched list` : ""}`;
}

const sameSet = (a: string[], b: string[]): boolean =>
  a.length === b.length && [...a].sort().every((v, i) => v === [...b].sort()[i]);

/** An id the runtime will not route through this provider, because another provider
 * owns the binding. `routesHere === false` is the runtime saying so; `undefined` — an id
 * the fetched catalogue does not carry at all — is not the same claim and never blocks
 * an add, because a model added upstream can be perfectly real. */
const notRoutable = (model: ProviderModel | undefined): boolean => model?.routesHere === false;

/** How many unfiltered model rows a provider renders before it asks. */
const SHOW_CAP = 60;

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
 * The selection editor exists because a gateway lists 464 models and a picker showing
 * all of them is a firehose, not a menu. It is typed-entry first rather than a list to
 * tick: someone who knows the three models they want should type three ids, and browsing
 * is only for finding an id they have not memorised. It is deliberately *not* applied to
 * a curated provider — three to eight models is already a menu, and making those users
 * opt in would be a behaviour change smuggled in beside a new control.
 *
 * Two refusals and one warning, because a stored id that cannot route is worse than no
 * id at all. An id another provider owns (every `openai/*` spelling on OpenRouter belongs
 * to GitHub Models here) is refused with the reason: the runtime resolves that binding
 * whatever the selection says, so accepting it would be offering a choice that cannot
 * take effect. An id the fetched catalogue does not carry is *accepted* — the list is
 * fetched and can be behind upstream — and the chip says so, because the runtime stores
 * anything, then refuses it at send time with a message naming neither the provider nor
 * the selection. Silence there is the failure this screen exists to prevent.
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
  const [expandedRows, setExpandedRows] = useState<Record<string, boolean>>({});
  /** The typed-add box, per provider, before it is committed to the draft selection. */
  const [typed, setTyped] = useState<Record<string, string>>({});
  /** Why an add did not happen. Stated beside the control that caused it, because a
   * model silently missing from the list is the failure this screen exists to avoid. */
  const [notices, setNotices] = useState<Record<string, string>>({});
  /** Models named while connecting, so a key and its menu are one action. */
  const [connectModels, setConnectModels] = useState("");
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
  // not sit in component state under a provider the user no longer means. The model
  // list goes with it: it names models for whichever provider was meant.
  useEffect(() => { setKey(""); setConnectModels(""); }, [target]);

  const submit = async () => {
    if (!bridge?.providers?.connect || !target || !key.trim()) return;
    setBusy(true);
    setResult(null);
    try {
      const outcome = await bridge.providers.connect(target, key.trim(), label.trim());
      if (!outcome.ok) {
        setResult(outcome);
        return;
      }
      // A key and its menu in one action, but two calls: the runtime's `connect` route
      // takes a credential only, and inventing a combined route would need a container
      // restart to do what two requests already do correctly.
      const wanted = splitModelIds(connectModels);
      const provider = providers?.find((p) => p.id === target);
      if (wanted.length > 0 && provider?.live && bridge.providers.setSelection) {
        const saved = await bridge.providers.setSelection(target, wanted);
        setResult(saved.ok
          ? { ok: true, detail: `${target} connected with ${saved.selected.length} model${saved.selected.length === 1 ? "" : "s"} offered.` }
          // The credential did land. Saying so is the difference between a retry that
          // re-sends a key and one that only fixes the selection.
          : { ok: true, detail: `${target} is connected, but its selection was not saved: ${saved.detail}` });
      } else {
        setResult(outcome);
      }
      setKey("");
      setLabel("");
      setConnectModels("");
      await read();
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

  /**
   * Add one id or a pasted batch, in a single pass over the draft.
   *
   * One function rather than a loop over `addModel`, because each call would read the
   * draft before React had written the previous addition and all but the last id in a
   * pasted list would vanish.
   *
   * Two refusals, both stated rather than swallowed: an id another provider owns cannot
   * be routed here whatever the selection says (the runtime resolves that binding, not
   * this screen), and a duplicate is not a second addition. An id the catalogue does not
   * know is *accepted* — the list is fetched and can be behind upstream — and the chip
   * says so, because the alternative is a model that silently never appears in the
   * picker.
   */
  const applyAdds = (provider: ProviderInfo, ids: string[]) => {
    const next = [...chosenFor(provider)];
    const refused: string[] = [];
    let duplicates = 0;
    for (const raw of ids) {
      const id = raw.trim();
      if (!id) continue;
      if (notRoutable(provider.models.find((m) => m.id === id))) {
        refused.push(`${id} is answered by another provider on your runtime`);
        continue;
      }
      if (next.includes(id)) { duplicates += 1; continue; }
      next.push(id);
    }
    const parts = [...refused];
    if (duplicates > 0) parts.push(`${duplicates} already offered`);
    setNotices((n) => ({ ...n, [provider.id]: parts.join(" · ") }));
    setDraft((d) => ({ ...d, [provider.id]: next }));
  };

  const removeModel = (provider: ProviderInfo, id: string) => {
    setNotices((n) => ({ ...n, [provider.id]: "" }));
    setDraft((d) => ({ ...d, [provider.id]: chosenFor(provider).filter((m) => m !== id) }));
  };

  /** Commit whatever is in the typed box — one id or a pasted list of them. */
  const commitTyped = (provider: ProviderInfo) => {
    const ids = splitModelIds(typed[provider.id] ?? "");
    if (ids.length === 0) return;
    applyAdds(provider, ids);
    setTyped((t) => ({ ...t, [provider.id]: "" }));
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
            const matching = provider.models
              .filter((m) => !needle
                || m.label.toLowerCase().includes(needle)
                || m.id.toLowerCase().includes(needle))
              .sort((a, b) => (chosen.has(b.id) ? 1 : 0) - (chosen.has(a.id) ? 1 : 0)
                || a.label.localeCompare(b.label));
            // The browse list is rendered a screenful at a time. Browsing is for
            // finding an id you have not memorised, and 464 rows to scroll through to
            // reach one is a pane that stutters on open — the filter is the way in.
            const expanded = expandedRows[provider.id] === true;
            const rows = !needle && !expanded ? matching.slice(0, SHOW_CAP) : matching;
            // Suggestions are a convenience, not a gate: an id that matches nothing is
            // still addable, and the chip says the catalogue does not carry it.
            const typedText = (typed[provider.id] ?? "").trim().toLowerCase();
            const suggestions = typedText.length === 0 ? [] : provider.models
              .filter((m) => !chosen.has(m.id) && !notRoutable(m))
              .filter((m) => m.id.toLowerCase().includes(typedText) || m.label.toLowerCase().includes(typedText))
              .slice(0, 8);
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
                  <div className="mt-2 space-y-2">
                    {/* What is offered now. A chip rather than a ticked row, because the
                        chosen set is the thing worth reading and it survives a search. */}
                    <div className="flex flex-wrap gap-1">
                      {chosenList.length === 0 && (
                        <span className="text-xs text-muted">
                          Nothing is offered yet — type the models you want below.
                        </span>
                      )}
                      {chosenList.map((id) => {
                        const model = provider.models.find((m) => m.id === id);
                        return (
                          <span
                            key={id}
                            data-chip={model ? "known" : "unknown"}
                            className="flex items-start gap-1.5 max-w-full px-2 py-1 rounded border border-border/50 bg-surface text-xs"
                          >
                            <span className="min-w-0">
                              <span className="block truncate">{model?.label ?? id}</span>
                              {model && <code className="block text-[10px] text-muted truncate">{id}</code>}
                              {!model && (
                                // Loud here rather than quiet later: an id the fetched
                                // catalogue does not carry is stored by the runtime and
                                // then refused at send time by a message that names
                                // neither the provider nor the selection.
                                <span className="block text-[10px] text-yellow">
                                  not in the fetched list — the runtime will refuse it until it appears there
                                </span>
                              )}
                            </span>
                            <button
                              onClick={() => removeModel(provider, id)}
                              aria-label={`Stop offering ${id}`}
                              className="text-muted hover:text-text shrink-0"
                            >×</button>
                          </span>
                        );
                      })}
                    </div>

                    <div className="space-y-1">
                      <input
                        value={typed[provider.id] ?? ""}
                        onChange={(e) => setTyped((t) => ({ ...t, [provider.id]: e.target.value }))}
                        onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); commitTyped(provider); } }}
                        placeholder={`Add ${provider.label} models — one id, or several separated by commas`}
                        aria-label={`Add ${provider.label} models by id`}
                        spellCheck={false}
                        autoComplete="off"
                        className="w-full px-2 py-1 text-xs rounded border border-border/50 bg-surface text-text"
                      />
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => commitTyped(provider)}
                          disabled={splitModelIds(typed[provider.id] ?? "").length === 0}
                          className="px-3 py-1 text-xs rounded bg-accent text-surface disabled:opacity-50"
                        >Add</button>
                        <span className="text-[10px] text-muted ml-auto">Enter adds; commas separate a pasted list</span>
                      </div>

                      {notices[provider.id] && (
                        <p className="text-[10px] text-yellow" data-add-notice>{notices[provider.id]}</p>
                      )}

                      {suggestions.length > 0 && (
                        <ul className="space-y-0.5" aria-label="Matching models">
                          {suggestions.map((m) => (
                            <li key={m.id}>
                              <button
                                onClick={() => applyAdds(provider, [m.id])}
                                className="w-full text-left flex items-center gap-2 px-2 py-1 rounded border border-border/40 bg-surface/50 hover:bg-surface2 text-xs"
                              >
                                <span className="truncate">{m.label}</span>
                                <code className="text-[10px] text-muted truncate">{m.id}</code>
                                <span className="ml-auto text-accent shrink-0">+ add</span>
                              </button>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>

                    {/* Discovery, for an id you have not memorised. Clicking adds; nothing
                        here is a checkbox, because choosing five models should not require
                        scrolling through four hundred and sixty. */}
                    <details className="text-xs text-muted">
                      <summary className="cursor-pointer select-none">
                        Browse all {provider.models.length} to find an id
                      </summary>
                      <input
                        value={filters[provider.id] ?? ""}
                        onChange={(e) => setFilters((f) => ({ ...f, [provider.id]: e.target.value }))}
                        placeholder="Filter…"
                        aria-label={`Filter ${provider.label} models`}
                        className="mt-1 w-full px-2 py-1 text-xs rounded border border-border/50 bg-surface text-text"
                      />
                      <ul className="mt-1 max-h-56 overflow-y-auto pr-1 space-y-0.5" aria-label={`${provider.label} models`}>
                        {rows.map((model) => {
                          const elsewhere = notRoutable(model);
                          const isChosen = chosen.has(model.id);
                          return (
                            <li key={model.id} className="flex items-center gap-2">
                              <span className="min-w-0">
                                <span className="block truncate">{model.label}</span>
                                <code className="block text-[10px] text-muted truncate">{model.id}</code>
                              </span>
                              <span className="ml-auto shrink-0">
                                {isChosen ? (
                                  <span className="text-[10px] text-accent">offered</span>
                                ) : elsewhere ? (
                                  <span
                                    className="text-[9px] uppercase tracking-wide text-yellow"
                                    title={`Another provider already answers ${model.id} on your runtime, so it cannot be offered through ${provider.label}.`}
                                  >answered elsewhere</span>
                                ) : (
                                  <button
                                    onClick={() => applyAdds(provider, [model.id])}
                                    className="text-[10px] text-accent hover:text-accent/80"
                                  >+ add</button>
                                )}
                              </span>
                            </li>
                          );
                        })}
                        {rows.length === 0 && (
                          <li className="px-1 py-2 text-xs text-muted">
                            No {provider.label} model matches “{filters[provider.id] ?? ""}”.
                          </li>
                        )}
                      </ul>

                      {!needle && matching.length > rows.length && (
                        <button
                          onClick={() => setExpandedRows((e) => ({ ...e, [provider.id]: true }))}
                          className="text-xs text-accent hover:text-accent/80"
                        >Show all {matching.length} models</button>
                      )}
                      {!needle && expanded && matching.length > SHOW_CAP && (
                        <button
                          onClick={() => setExpandedRows((e) => ({ ...e, [provider.id]: false }))}
                          className="text-xs text-muted hover:text-text"
                        >Collapse to {SHOW_CAP}</button>
                      )}
                    </details>

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

                    {provider.live && (
                      <input
                        value={connectModels}
                        onChange={(e) => setConnectModels(e.target.value)}
                        placeholder="Model ids to offer (optional) — separated by commas"
                        aria-label={`${provider.label} model ids`}
                        spellCheck={false}
                        autoComplete="off"
                        className="w-full px-2 py-1 text-xs rounded border border-border/50 bg-surface text-text"
                      />
                    )}

                    <p className="text-[10px] text-muted">
                      Sent to the runtime and stored there. This app keeps no copy and cannot show it back.
                      {provider.live && " A gateway offers nothing until you name models for it — leaving that field empty is a choice, not a gap."}
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
