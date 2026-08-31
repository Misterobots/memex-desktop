import { useEffect, useMemo } from "react";
import { diffLines, collapseContext } from "../../lib/diff";

interface Props {
  filePath:   string;
  oldContent: string;
  newContent: string;
  onApprove:  () => void;
  onReject:   () => void;
}

export function DiffReviewModal({ filePath, oldContent, newContent, onApprove, onReject }: Props) {
  const hunks = useMemo(
    () => collapseContext(diffLines(oldContent, newContent)),
    [oldContent, newContent]
  );

  const adds = hunks.filter((h) => h !== "..." && h.op === "insert").length;
  const dels = hunks.filter((h) => h !== "..." && h.op === "delete").length;

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onReject();
      } else if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
        event.preventDefault();
        onApprove();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onApprove, onReject]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="diff-review-title"
      aria-describedby="diff-review-summary"
    >
      <div className="bg-canvas border border-border/60 rounded-2xl shadow-2xl w-full max-w-3xl max-h-[85vh] flex flex-col">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-border/40 flex-shrink-0">
          <div>
            <div id="diff-review-title" className="text-sm font-semibold text-text">{filePath}</div>
            <div id="diff-review-summary" className="text-xs text-muted mt-0.5">
              <span className="text-green-400">+{adds}</span>
              {" / "}
              <span className="text-red-400">-{dels}</span>
            </div>
          </div>
          <span className="text-xs font-semibold uppercase tracking-wide text-accent px-2.5 py-1 rounded-full border border-accent/30 bg-accent/10">
            Review required
          </span>
        </div>

        {/* Diff viewer */}
        <div className="flex-1 overflow-y-auto font-mono text-xs leading-5">
          <table className="w-full border-collapse">
            <tbody>
              {hunks.map((line, i) => {
                if (line === "...") {
                  return (
                    <tr key={i} className="bg-surface2/30">
                      <td colSpan={3} className="px-4 py-0.5 text-muted text-center select-none">⋯</td>
                    </tr>
                  );
                }

                const bg =
                  line.op === "insert" ? "bg-green-500/10 hover:bg-green-500/15" :
                  line.op === "delete" ? "bg-red-500/10  hover:bg-red-500/15"  :
                  "hover:bg-surface2/20";

                const prefix =
                  line.op === "insert" ? "+" :
                  line.op === "delete" ? "-" : " ";

                const prefixColor =
                  line.op === "insert" ? "text-green-400" :
                  line.op === "delete" ? "text-red-400"   : "text-muted/30";

                return (
                  <tr key={i} className={`${bg} transition-colors`}>
                    <td className="pl-3 pr-1 py-px text-right text-muted/50 select-none w-10">
                      {line.lineOld ?? ""}
                    </td>
                    <td className="px-1 py-px text-right text-muted/50 select-none w-10">
                      {line.lineNew ?? ""}
                    </td>
                    <td className={`pl-1 pr-3 py-px whitespace-pre ${prefixColor}`}>
                      <span className="select-none">{prefix} </span>
                      <span className="text-text/90">{line.content}</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Actions */}
        <div className="flex gap-3 px-5 py-3.5 border-t border-border/40 flex-shrink-0">
          <button
            onClick={onApprove}
            className="flex-1 py-2 rounded-xl bg-accent text-white text-sm font-medium hover:bg-accent/80 transition-colors"
          >
            Approve write <span className="text-xs opacity-70">(Ctrl+Enter)</span>
          </button>
          <button
            onClick={onReject}
            className="flex-1 py-2 rounded-xl bg-surface2 border border-border/60 text-sm hover:bg-surface2/80 transition-colors"
          >
            Reject <span className="text-xs opacity-70">(Esc)</span>
          </button>
        </div>

      </div>
    </div>
  );
}
