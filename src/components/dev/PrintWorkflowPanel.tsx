import { useCallback, useEffect, useMemo, useState } from "react";
import {
  cadPrint,
  loadCadBridgeConfig,
  normalizeCadBridgeToken,
  saveCadBridgeConfig,
  type CadBridgeConfig,
  type CadPart,
} from "../../lib/cad-print-api";
import { desktop } from "../../lib/desktop";
import { useRemoteCadHost } from "../../lib/use-remote-cad-host";

type Json = Record<string, unknown>;
type ExportArtifact = { name: string; path: string; bytes: number; sha256: string };

const button = "px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors disabled:opacity-40 disabled:cursor-not-allowed";
const secondary = `${button} border-border/60 bg-surface2 hover:bg-surface2/70 text-text`;
const primary = `${button} border-accent/40 bg-accent/15 text-accent hover:bg-accent/25`;

function pretty(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

export function PrintWorkflowPanel() {
  const [config, setConfig] = useState<CadBridgeConfig>(() => loadCadBridgeConfig());
  const [parts, setParts] = useState<Record<string, CadPart>>({});
  const [jobs, setJobs] = useState<Json[]>([]);
  const [selectedPart, setSelectedPart] = useState("");
  const [selectedJob, setSelectedJob] = useState("");
  const [health, setHealth] = useState<Json | null>(null);
  const [printer, setPrinter] = useState<Json | null>(null);
  const [preflight, setPreflight] = useState<Json | null>(null);
  const [approvalToken, setApprovalToken] = useState("");
  const [approved, setApproved] = useState(false);
  const [result, setResult] = useState<Json | null>(null);
  const [exportArtifact, setExportArtifact] = useState<ExportArtifact | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState<"" | "refresh" | "render" | "preflight" | "approval" | "start">("");
  const remoteCadHost = useRemoteCadHost();

  const printableParts = useMemo(
    () => Object.entries(parts).filter(([, detail]) => detail.printable),
    [parts],
  );

  const refresh = useCallback(async () => {
    setBusy("refresh"); setError("");
    try {
      const [nextHealth, nextParts, nextJobs, nextPrinter] = await Promise.all([
        cadPrint.health() as Promise<Json>,
        cadPrint.parts(),
        cadPrint.printJobs() as Promise<Json>,
        cadPrint.printStatus() as Promise<Json>,
      ]);
      setHealth(nextHealth);
      setParts(nextParts.parts);
      setJobs(Array.isArray(nextJobs.jobs) ? nextJobs.jobs as Json[] : []);
      setPrinter(nextPrinter);
      setSelectedPart((current) => current || Object.keys(nextParts.parts).find((key) => nextParts.parts[key].printable) || "");
      setSelectedJob((current) => current || String((nextJobs.jobs as Json[] | undefined)?.[0]?.id || ""));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not reach the CAD/print bridge");
    } finally { setBusy(""); }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const saveConnection = () => {
    const normalized = { ...config, token: normalizeCadBridgeToken(config.token) };
    setConfig(normalized);
    saveCadBridgeConfig(normalized);
    setApprovalToken(""); setApproved(false); setPreflight(null); setResult(null);
    refresh();
  };

  const render = async () => {
    if (!selectedPart) return;
    setBusy("render"); setError(""); setExportArtifact(null);
    try {
      const next = await cadPrint.render(selectedPart, "3mf");
      setResult(next as Json);
      if (next.ok && next.artifact) setExportArtifact(next.artifact);
      else setError(next.error || "CAD export did not produce a source 3MF.");
    }
    catch (caught) { setError(caught instanceof Error ? caught.message : "CAD render failed"); }
    finally { setBusy(""); }
  };

  const revealArtifact = () => {
    if (!exportArtifact) return;
    // The bridge returns a local, allow-listed export path. Reuse the app's
    // existing artifact-open behavior so the result is visible immediately.
    const fileUrl = `file:///${exportArtifact.path.replace(/\\/g, "/")}`;
    void desktop()?.shell.openExternal(encodeURI(fileUrl));
  };

  const runPreflight = async () => {
    if (!selectedJob) return;
    setBusy("preflight"); setError(""); setApprovalToken(""); setApproved(false);
    try { setPreflight(await cadPrint.preflight(selectedJob) as Json); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "Print preflight failed"); }
    finally { setBusy(""); }
  };

  const requestApproval = async () => {
    if (!selectedJob) return;
    setBusy("approval"); setError("");
    try {
      const next = await cadPrint.requestApproval(selectedJob) as Json;
      setPreflight(next);
      setApprovalToken(typeof next.approval_token === "string" ? next.approval_token : "");
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Could not request approval"); }
    finally { setBusy(""); }
  };

  const start = async () => {
    if (!selectedJob || !approvalToken || !approved) return;
    setBusy("start"); setError("");
    try {
      setResult(await cadPrint.start(selectedJob, approvalToken) as Json);
      setApprovalToken(""); setApproved(false);
      await refresh();
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Printer submission failed"); }
    finally { setBusy(""); }
  };

  return (
    <div className="flex-1 min-h-0 overflow-y-auto bg-canvas px-5 py-5">
      <div className="max-w-4xl space-y-5">
        <div>
          <h2 className="text-lg font-medium text-text">CAD & Print</h2>
          <p className="mt-1 text-sm text-muted">Use the same approval-gated print path whether you are working here or talking with Friday.</p>
        </div>

        <section className="rounded-xl border border-border/60 bg-surface overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-border/60 bg-surface2/50">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted">Local bridge</span>
            <button className={secondary} disabled={busy === "refresh"} onClick={refresh}>{busy === "refresh" ? "Refreshing…" : "Refresh"}</button>
          </div>
          <div className="grid gap-3 p-4 sm:grid-cols-2">
            <label className="text-xs text-muted">CAD bridge URL
              <input value={config.url} onChange={(e) => setConfig({ ...config, url: e.target.value })}
                className="mt-1 w-full rounded-lg border border-border/60 bg-surface2 px-3 py-2 text-sm text-text focus:outline-none focus:ring-1 focus:ring-accent/60" />
            </label>
            <label className="text-xs text-muted">CAD bridge token (optional override)
              <input type="password" value={config.token} onChange={(e) => setConfig({ ...config, token: e.target.value })}
                placeholder="Token or CAD_PRINT_BRIDGE_TOKEN=... line" className="mt-1 w-full rounded-lg border border-border/60 bg-surface2 px-3 py-2 text-sm text-text focus:outline-none focus:ring-1 focus:ring-accent/60" />
            </label>
            <div className="sm:col-span-2 flex items-center gap-3">
              <button className={primary} onClick={saveConnection}>Save & connect</button>
              <span className={`text-xs ${health?.ok ? "text-green" : "text-muted"}`}>
                {health?.ok ? "CAD bridge connected" : "The installed app reads this workstation’s local bridge token automatically"}
              </span>
            </div>
            <p className="sm:col-span-2 text-[11px] text-muted">For safety, the desktop app accepts this bridge only on this workstation at <code>127.0.0.1:8790</code>.</p>
          </div>
        </section>

        <section className="rounded-xl border border-border/60 bg-surface p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h3 className="text-sm font-medium text-text">Paired mobile review</h3>
              <p className="mt-1 max-w-2xl text-xs text-muted">Share this workstation with the Memex mobile app. The phone can request reviewed CAD actions, but it never receives local bridge credentials and cannot start a physical print.</p>
            </div>
            {remoteCadHost.state.status === "idle" || remoteCadHost.state.status === "error" ? (
              <button className={secondary} onClick={remoteCadHost.host}>Share CAD workstation</button>
            ) : (
              <button className={secondary} onClick={remoteCadHost.disconnect}>Stop sharing</button>
            )}
          </div>
          <div className="mt-3 rounded-lg border border-border/60 bg-surface2/50 px-3 py-2 text-xs text-muted">
            {remoteCadHost.state.status === "waiting" && <>On mobile, open <strong className="text-text">Remote pairing</strong> and enter code <strong className="ml-1 font-mono tracking-[0.2em] text-accent">{remoteCadHost.state.code}</strong>.</>}
            {remoteCadHost.state.status === "connected" && <span className="text-green">Mobile reviewer connected. Remote requests are limited to CAD review, render, build-set, and print preflight actions.</span>}
            {remoteCadHost.state.status === "idle" && "Not shared with a mobile reviewer."}
            {remoteCadHost.state.status === "error" && <span className="text-red-300">{remoteCadHost.state.error}</span>}
          </div>
        </section>

        <section className="rounded-xl border border-border/60 bg-surface p-4">
          <div className="flex items-start justify-between gap-4">
            <div><h3 className="text-sm font-medium text-text">1. Export a printable model</h3><p className="mt-1 text-xs text-muted">Exports the chosen allow-listed OpenSCAD part as a source 3MF. Arrange and slice it in OrcaSlicer before it can become a print job.</p></div>
            <span className="rounded-full border border-border/60 px-2 py-0.5 text-[10px] text-muted">No printer action</span>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <select value={selectedPart} onChange={(e) => setSelectedPart(e.target.value)} className="min-w-60 rounded-lg border border-border/60 bg-surface2 px-3 py-2 text-sm text-text">
              {printableParts.map(([name, detail]) => <option key={name} value={name}>{name} · {detail.material}</option>)}
            </select>
            <button className={secondary} disabled={!selectedPart || busy === "render"} onClick={render}>{busy === "render" ? "Exporting…" : "Export 3MF"}</button>
          </div>
          {exportArtifact && (
            <div className="mt-3 rounded-lg border border-green/30 bg-green/5 p-3 text-xs">
              <div className="font-medium text-green">Source 3MF exported — no printer action taken.</div>
              <div className="mt-1 break-all text-muted">{exportArtifact.path}</div>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <button className={secondary} onClick={revealArtifact}>Open exported 3MF</button>
                <span className="text-[11px] text-muted">{Math.ceil(exportArtifact.bytes / 1024)} KB · arrange and slice in OrcaSlicer next</span>
              </div>
            </div>
          )}
        </section>

        <section className="rounded-xl border border-border/60 bg-surface p-4">
          <div className="flex items-start justify-between gap-4">
            <div><h3 className="text-sm font-medium text-text">2. Arrange, slice, and register</h3><p className="mt-1 text-xs text-muted">In OrcaSlicer, choose the printer and filament profile, arrange the reviewed source models, slice, and save the resulting <code>.gcode.3mf</code> under <code>cad/print_jobs</code>. The registered jobs appear below.</p></div>
            <span className={`rounded-full border px-2 py-0.5 text-[10px] ${printer?.ok ? "border-green/40 text-green" : "border-border/60 text-muted"}`}>{printer?.ok ? "Printer path ready" : "Printer path awaiting bridge"}</span>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <select value={selectedJob} onChange={(e) => { setSelectedJob(e.target.value); setPreflight(null); setApprovalToken(""); setApproved(false); }} className="min-w-60 rounded-lg border border-border/60 bg-surface2 px-3 py-2 text-sm text-text">
              <option value="">{jobs.length ? "Select an approved job" : "No sliced jobs registered yet"}</option>
              {jobs.map((job) => <option key={String(job.id)} value={String(job.id)}>{String(job.id)} · {String(job.filament || "filament not recorded")}</option>)}
            </select>
            <button className={secondary} disabled={!selectedJob || busy === "preflight"} onClick={runPreflight}>{busy === "preflight" ? "Checking…" : "Preflight"}</button>
            <button className={secondary} disabled={!selectedJob || busy === "approval"} onClick={requestApproval}>{busy === "approval" ? "Requesting…" : "Request approval"}</button>
          </div>
        </section>

        <section className="rounded-xl border border-accent/25 bg-accent/[0.04] p-4">
          <div className="flex items-start justify-between gap-4">
            <div><h3 className="text-sm font-medium text-text">3. Start an approved print</h3><p className="mt-1 text-xs text-muted">This is the only control that can send a print to the P1S. It stays disabled until preflight passes, an approval token is issued, and you explicitly confirm the job.</p></div>
            <span className="rounded-full border border-accent/30 px-2 py-0.5 text-[10px] text-accent">Explicit confirmation required</span>
          </div>
          <label className="mt-3 flex items-center gap-2 text-sm text-text/80">
            <input type="checkbox" checked={approved} disabled={!approvalToken} onChange={(e) => setApproved(e.target.checked)} />
            I reviewed the printer, filament, plate, and selected job.
          </label>
          <button className={`mt-3 ${primary}`} disabled={!selectedJob || !approvalToken || !approved || busy === "start"} onClick={start}>
            {busy === "start" ? "Submitting to printer…" : "Start approved print"}
          </button>
        </section>

        {error && <div className="rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-300">{error}</div>}
        {(preflight || result) && <pre className="max-h-64 overflow-auto rounded-xl border border-border/60 bg-black/20 p-3 text-[11px] text-muted">{pretty(result ?? preflight)}</pre>}
      </div>
    </div>
  );
}
