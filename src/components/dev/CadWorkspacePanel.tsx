import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useStore } from "../../lib/store";
import { cadPrint, FRIDAY_BODY_ROOT, type CadArtifact, type CadPart, type PrinterContext } from "../../lib/cad-print-api";
import { desktop } from "../../lib/desktop";
import { ConversationPane } from "../chat/ConversationPane";
import { InputBar } from "../layout/InputBar";

const BUILD_SET_KEY = "memex.fridayBody.buildSet.v1";

type BuildItem = { part: string; quantity: number };
type ExportedBuildSet = { artifact: CadArtifact; parts: Array<{ part: string; quantity: number; artifact: CadArtifact }> };

function loadBuildSet(): BuildItem[] {
  try {
    const raw = JSON.parse(localStorage.getItem(BUILD_SET_KEY) ?? "[]") as unknown;
    if (!Array.isArray(raw)) return [];
    return raw.filter((item): item is BuildItem =>
      typeof item === "object" && item !== null
      && typeof (item as BuildItem).part === "string"
      && Number.isInteger((item as BuildItem).quantity)
      && (item as BuildItem).quantity > 0,
    );
  } catch { return []; }
}

export function CadWorkspacePanel({ onOpenSource, onGoToPrint }: {
  onOpenSource: () => void;
  onGoToPrint: () => void;
}) {
  const { activeSession } = useStore();
  const [parts, setParts] = useState<Record<string, CadPart>>({});
  const [printerContext, setPrinterContext] = useState<PrinterContext | null>(null);
  const [items, setItems] = useState<BuildItem[]>(loadBuildSet);
  const [selectedPart, setSelectedPart] = useState("");
  const [exported, setExported] = useState<ExportedBuildSet | null>(null);
  const [busy, setBusy] = useState<"" | "refresh" | "export">("");
  const [status, setStatus] = useState("Loading Friday Body project…");
  const refreshGeneration = useRef(0);

  useEffect(() => {
    localStorage.setItem(BUILD_SET_KEY, JSON.stringify(items));
  }, [items]);

  const refresh = useCallback(async () => {
    const generation = ++refreshGeneration.current;
    setBusy("refresh");
    try {
      const [result, nextPrinterContext] = await Promise.all([cadPrint.parts(), cadPrint.printerContext()]);
      // An earlier request can finish after a manual retry. Never let its
      // stale success/error replace the state of the most recent refresh.
      if (generation !== refreshGeneration.current) return;
      const printable = Object.entries(result.parts).filter(([, detail]) => detail.printable);
      setParts(result.parts);
      setPrinterContext(nextPrinterContext);
      setSelectedPart((current) => current || printable[0]?.[0] || "");
      setStatus("Friday Body source and printable parts are ready for review.");
    } catch (error) {
      if (generation !== refreshGeneration.current) return;
      setStatus(error instanceof Error ? error.message : "Could not reach the local CAD bridge.");
    } finally {
      if (generation === refreshGeneration.current) setBusy("");
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  const printable = useMemo(
    () => Object.entries(parts).filter(([, detail]) => detail.printable),
    [parts],
  );
  const session = activeSession("code", FRIDAY_BODY_ROOT);
  const emptyConversation = !session || session.messages.length === 0;

  const addToBuildSet = () => {
    if (!selectedPart) return;
    setItems((current) => {
      const found = current.find((item) => item.part === selectedPart);
      return found
        ? current.map((item) => item.part === selectedPart ? { ...item, quantity: item.quantity + 1 } : item)
        : [...current, { part: selectedPart, quantity: 1 }];
    });
  };

  const setQuantity = (part: string, quantity: number) => {
    setItems((current) => quantity <= 0
      ? current.filter((item) => item.part !== part)
      : current.map((item) => item.part === part ? { ...item, quantity } : item));
  };

  const exportBuildSet = async () => {
    if (!items.length) return;
    setBusy("export");
    setStatus("Rendering the selected source models and creating a review package…");
    setExported(null);
    try {
      const result = await cadPrint.exportBuildSet(items);
      if (!result.ok || !result.artifact || !result.parts) throw new Error(result.error || "Could not create the source-model review package.");
      setExported({ artifact: result.artifact, parts: result.parts });
      setStatus("Source-model review package is ready. It contains the selected 3MF models plus a quantity manifest; no printer action was taken.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "CAD export failed.");
    } finally { setBusy(""); }
  };

  const openExportedPackage = () => {
    if (!exported) return;
    const fileUrl = `file:///${exported.artifact.path.replace(/\\/g, "/")}`;
    void desktop()?.shell.openExternal(encodeURI(fileUrl));
  };

  return (
    <div className="flex flex-1 min-h-0 bg-canvas">
      <main className="flex min-w-0 flex-1 flex-col border-r border-border/60">
        <div className="border-b border-border/60 bg-surface px-5 py-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-medium text-text">Friday Body CAD workspace</h2>
              <p className="mt-1 max-w-2xl text-sm text-muted">
                Discuss the design with Memex, have the Code agent inspect or edit the project, then review the change before exporting anything for manufacture.
              </p>
            </div>
            <button onClick={onOpenSource} className="rounded-lg border border-border/60 bg-surface2 px-3 py-1.5 text-xs text-text hover:bg-surface2/80">
              Open chassis.scad
            </button>
          </div>
          <div className="mt-3 flex flex-wrap gap-2 text-[11px]">
            {["1. Discuss", "2. Agent proposes / edits", "3. Review & render", "4. Build set", "5. Print handoff"].map((label, index) => (
              <span key={label} className={`rounded-full border px-2 py-0.5 ${index < 2 ? "border-accent/35 bg-accent/10 text-accent" : "border-border/60 text-muted"}`}>{label}</span>
            ))}
          </div>
        </div>

        {emptyConversation ? (
          <div className="flex flex-1 flex-col items-center justify-center px-6 text-center">
            <div className="max-w-xl">
              <h3 className="text-base font-medium text-text">Start with intent, not a slicer setting.</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted">
                For example: “Review the wheel-adapter mounting and make a printable proposal,” or “Create a compact fit-check plate for the wheel mounts and caster.”
              </p>
              <p className="mt-4 text-xs text-muted">Memex works in the Friday Body project; any source change still remains visible in the Editor for review.</p>
            </div>
          </div>
        ) : (
          <ConversationPane experience="code" workspaceKey={FRIDAY_BODY_ROOT} />
        )}
        <InputBar
          experience="code"
          workspaceKey={FRIDAY_BODY_ROOT}
          lockMode="swarm"
          extraFlags={{ dev_mode: true, cad_mode: true }}
          placeholder="Describe the model you want to create, change, inspect, or prepare…"
        />
      </main>

      <aside className="w-[330px] flex-shrink-0 overflow-y-auto bg-surface p-4 space-y-4">
        <section className="rounded-xl border border-border/60 bg-surface2/30 p-3">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted">Model status</h3>
            <button onClick={() => void refresh()} disabled={busy === "refresh"} className="text-xs text-accent hover:text-accent/80 disabled:opacity-50">
              {busy === "refresh" ? "Refreshing…" : "Refresh"}
            </button>
          </div>
          <p className="mt-2 text-xs leading-relaxed text-muted">{status}</p>
        </section>

        <section className="rounded-xl border border-border/60 p-3">
          <h3 className="text-sm font-medium text-text">Printer context</h3>
          {printerContext?.configured ? (
            <div className="mt-2 space-y-1 text-xs text-muted">
              <p className={printerContext.ok ? "text-green" : "text-yellow"}>{printerContext.ok ? "Live Home Assistant snapshot" : "Home Assistant returned incomplete printer data"}</p>
              {printerContext.entities.map((entity) => <p key={entity.entity_id} className="truncate" title={entity.entity_id}>{entity.entity_id}: {entity.error || entity.state || "unknown"}</p>)}
            </div>
          ) : (
            <p className="mt-2 text-xs leading-relaxed text-muted">Home Assistant printer entities are not configured yet. Rendering is still available; live printer facts will be used for the OrcaSlicer recipe once connected.</p>
          )}
        </section>

        <section className="rounded-xl border border-border/60 p-3">
          <h3 className="text-sm font-medium text-text">Build set review</h3>
          <p className="mt-1 text-xs text-muted">Select the models and quantities to review for printability. The export is a ZIP source package; physical plate arrangement remains an OrcaSlicer step.</p>
          <div className="mt-3 flex gap-2">
            <select value={selectedPart} onChange={(event) => setSelectedPart(event.target.value)} className="min-w-0 flex-1 rounded-lg border border-border/60 bg-surface2 px-2 py-1.5 text-xs text-text">
              {printable.map(([name, detail]) => <option key={name} value={name}>{name} · {detail.material}</option>)}
            </select>
            <button onClick={addToBuildSet} disabled={!selectedPart} className="rounded-lg border border-accent/40 bg-accent/10 px-2.5 py-1.5 text-xs text-accent hover:bg-accent/20 disabled:opacity-50">Add</button>
          </div>
          <div className="mt-3 space-y-2">
            {!items.length && <p className="text-xs text-muted">No parts grouped yet.</p>}
            {items.map((item) => (
              <div key={item.part} className="flex items-center gap-2 rounded-lg border border-border/50 bg-surface2/40 px-2 py-1.5">
                <span className="min-w-0 flex-1 truncate text-xs text-text" title={item.part}>{item.part}</span>
                <input aria-label={`${item.part} quantity`} type="number" min="0" value={item.quantity} onChange={(event) => setQuantity(item.part, Number(event.target.value))} className="w-12 rounded border border-border/60 bg-canvas px-1 py-0.5 text-center text-xs text-text" />
              </div>
            ))}
          </div>
          <button onClick={() => void exportBuildSet()} disabled={!items.length || busy === "export"} className="mt-3 w-full rounded-lg border border-border/60 bg-surface2 px-3 py-2 text-xs text-text hover:bg-surface2/80 disabled:opacity-50">
            {busy === "export" ? "Creating source-model ZIP…" : "Export source-model review ZIP"}
          </button>
        </section>

        {exported && (
          <section className="rounded-xl border border-green/30 bg-green/5 p-3">
            <h3 className="text-sm font-medium text-green">Source-model review package ready</h3>
            <p className="mt-1 break-all text-[11px] text-muted">{exported.artifact.path}</p>
            <ul className="mt-2 space-y-1 text-[11px] text-muted">
              {exported.parts.map((item) => <li key={item.artifact.path} className="truncate" title={item.artifact.path}>{item.part} × {item.quantity} · {item.artifact.name}</li>)}
            </ul>
            <button onClick={openExportedPackage} className="mt-3 w-full rounded-lg border border-border/60 bg-surface2 px-3 py-2 text-xs text-text hover:bg-surface2/80">Open review ZIP</button>
            <button onClick={onGoToPrint} className="mt-3 w-full rounded-lg border border-accent/40 bg-accent/10 px-3 py-2 text-xs text-accent hover:bg-accent/20">Continue to print handoff</button>
          </section>
        )}

        <section className="rounded-xl border border-border/60 p-3">
          <h3 className="text-sm font-medium text-text">Guardrails</h3>
          <ul className="mt-2 space-y-1 text-xs leading-relaxed text-muted">
            <li>• Treat an agent change as a proposal until you review it.</li>
            <li>• Render/export is separate from any printer action.</li>
            <li>• A physical print still requires an approved sliced job and explicit confirmation.</li>
          </ul>
        </section>
      </aside>
    </div>
  );
}
