import { useMemo, useState } from "react";
import type { ArtifactRecord } from "../../lib/desktop";
import { desktop } from "../../lib/desktop";
import { ArtifactFrame } from "./ArtifactFrame";
import { AnnotationCanvas } from "../annotate/AnnotationCanvas";

interface Props {
  artifact: ArtifactRecord;
  onClose:  () => void;
}

/** Colors a pre-formatted unified-diff string. Not a recomputed line diff — the
 *  artifact's `content` is already diff-shaped text, so this just paints +/- lines. */
function DiffText({ content }: { content: string }) {
  const lines = useMemo(() => content.split("\n"), [content]);
  return (
    <pre className="text-xs font-mono leading-5 whitespace-pre-wrap break-all">
      {lines.map((line, i) => {
        const color =
          line.startsWith("+") && !line.startsWith("+++") ? "text-green-400" :
          line.startsWith("-") && !line.startsWith("---")  ? "text-red-400"   :
          line.startsWith("@@")                             ? "text-accent"    :
          "text-text/80";
        return <div key={i} className={color}>{line || " "}</div>;
      })}
    </pre>
  );
}

export function ArtifactViewer({ artifact, onClose }: Props) {
  const bridge = desktop();
  const hasContent = !!artifact.content;
  const [annotating, setAnnotating] = useState(false);
  const [savedNotice, setSavedNotice] = useState(false);

  // Images routinely exceed the store's 64KB inline cap, so most real images arrive
  // as `path` (spilled to disk) rather than `content` — file:// works fine as an
  // <img src>/canvas source for local content, same as content data URLs do.
  const imageSrc = artifact.type === "image"
    ? (artifact.content ?? (artifact.path ? `file://${artifact.path}` : undefined))
    : undefined;

  const handleAnnotationSave = async (dataUrl: string) => {
    setAnnotating(false);
    if (!bridge) return;
    await bridge.artifacts.add({
      runId:     artifact.runId,
      sessionId: artifact.sessionId,
      type:      "image",
      name:      `${artifact.name.replace(/\.[^/.]+$/, "")}-annotated.png`,
      content:   dataUrl,
    });
    setSavedNotice(true);
    setTimeout(() => setSavedNotice(false), 2500);
  };

  if (annotating && imageSrc) {
    return (
      <AnnotationCanvas
        src={imageSrc}
        onSave={handleAnnotationSave}
        onCancel={() => setAnnotating(false)}
      />
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-canvas border border-border/60 rounded-2xl shadow-2xl w-full max-w-3xl max-h-[85vh] flex flex-col">

        <div className="flex items-center justify-between px-5 py-3.5 border-b border-border/40 flex-shrink-0">
          <div className="min-w-0">
            <div className="text-sm font-semibold text-text truncate">{artifact.name}</div>
            <div className="text-xs text-muted mt-0.5 capitalize">{artifact.type}</div>
          </div>
          <button onClick={onClose} className="text-muted hover:text-text p-1 flex-shrink-0">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8">
              <path d="M3 3l10 10M13 3L3 13" />
            </svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {!hasContent && !imageSrc && artifact.path && (
            <div className="space-y-3">
              <p className="text-sm text-muted">No inline content stored for this artifact — it lives on disk.</p>
              <p className="text-xs font-mono text-text/70 break-all">{artifact.path}</p>
              <button
                onClick={() => bridge?.shell.openExternal(`file://${artifact.path}`)}
                className="px-3 py-1.5 rounded-lg bg-accent text-white text-sm hover:bg-accent/80"
              >Open file</button>
            </div>
          )}

          {hasContent && (artifact.type === "diagram" || artifact.type === "report") && (
            <ArtifactFrame content={artifact.content!} title={artifact.name} />
          )}

          {hasContent && artifact.type === "diff" && (
            <DiffText content={artifact.content!} />
          )}

          {hasContent && (artifact.type === "file" || artifact.type === "log") && (
            <pre className="text-xs font-mono text-text/80 leading-5 whitespace-pre-wrap break-all">
              {artifact.content}
            </pre>
          )}

          {imageSrc && (
            <div className="space-y-3">
              <img src={imageSrc} alt={artifact.name} className="max-w-full rounded-lg border border-border/40" />
              <button
                onClick={() => setAnnotating(true)}
                className="px-3 py-1.5 rounded-lg bg-accent text-white text-sm hover:bg-accent/80"
              >Annotate</button>
              {savedNotice && <span className="ml-3 text-xs text-green-400">Saved as new artifact</span>}
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
