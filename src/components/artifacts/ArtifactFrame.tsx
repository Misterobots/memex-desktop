import { useEffect, useRef, useState } from "react";

/**
 * Sandboxed renderer for agent-authored HTML/SVG content (diagram/report artifacts).
 *
 * `sandbox="allow-scripts"` WITHOUT `allow-same-origin` is deliberate: combining the
 * two would let sandboxed script escape to full origin access via the `about:blank`
 * trick. allow-scripts alone gives interactive-but-isolated rendering — the iframe
 * cannot reach `window.parent`, cookies, or app IPC.
 *
 * Content is passed via `srcDoc` rather than a `postMessage`-after-load handoff:
 * it's capped at 64KB (ArtifactRecord.content) and already agent-authored-but-isolated,
 * so there's no benefit to the extra round trip. The postMessage channel that *does*
 * exist here is one-way, iframe -> host, for auto-resize only.
 */

const MIN_HEIGHT = 120;
const MAX_HEIGHT = 800;

interface FrameMessage {
  type: "resize" | "ready";
  height?: number;
}

function isFrameMessage(data: unknown): data is FrameMessage {
  return !!data && typeof data === "object" && "type" in data &&
    ((data as { type: unknown }).type === "resize" || (data as { type: unknown }).type === "ready");
}

export function ArtifactFrame({ content, title }: { content: string; title: string }) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [height, setHeight] = useState(MIN_HEIGHT);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      if (e.source !== iframeRef.current?.contentWindow) return; // ignore unrelated frames
      if (!isFrameMessage(e.data)) return;
      if (e.data.type === "ready") setLoaded(true);
      if (e.data.type === "resize" && typeof e.data.height === "number") {
        setHeight(Math.min(MAX_HEIGHT, Math.max(MIN_HEIGHT, Math.ceil(e.data.height))));
      }
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  return (
    <div className="relative rounded-lg border border-border/50 overflow-hidden bg-white">
      {!loaded && (
        <div className="absolute inset-0 flex items-center justify-center text-xs text-muted bg-surface2/40">
          Rendering…
        </div>
      )}
      <iframe
        ref={iframeRef}
        title={title}
        sandbox="allow-scripts"
        srcDoc={content}
        style={{ width: "100%", height, border: "none", display: "block" }}
        onLoad={() => setLoaded(true)}
      />
    </div>
  );
}
