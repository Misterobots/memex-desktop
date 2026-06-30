/**
 * Self-contained unified-diff renderer for the mobile task board — no Electron
 * bridge / filesystem. Takes the aggregate diff_text string from
 * GET /v1/tasks/{id}/diff (per-file `### op: path` headers + unified hunks).
 */
export function WebDiffViewer({ diff }: { diff: string }) {
  const lines = diff.split("\n");
  return (
    <div className="font-mono text-[11px] leading-relaxed overflow-x-auto rounded-lg border border-border/40 bg-canvas">
      {lines.map((line, i) => {
        let cls = "text-text/60";
        if (line.startsWith("### ")) {
          cls = "text-accent font-semibold bg-surface2/50 sticky left-0";
        } else if (line.startsWith("@@")) {
          cls = "text-accent2 bg-surface2/30";
        } else if (line.startsWith("+") && !line.startsWith("+++")) {
          cls = "bg-green-500/10 text-green";
        } else if (line.startsWith("-") && !line.startsWith("---")) {
          cls = "bg-red-500/10 text-red-400";
        }
        return (
          <div key={i} className={`whitespace-pre px-2 ${cls}`}>{line || " "}</div>
        );
      })}
    </div>
  );
}
