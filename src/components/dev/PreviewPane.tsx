import { useEffect, useRef, useState } from "react";

interface Props {
  html: string;
  title?: string;
}

export function PreviewPane({ html, title = "Preview" }: Props) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [viewport, setViewport] = useState<"desktop" | "mobile">("desktop");

  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe) return;
    const doc = iframe.contentDocument;
    if (!doc) return;
    doc.open();
    doc.write(html);
    doc.close();
  }, [html]);

  return (
    <div className="flex flex-col h-full bg-[#1a1917]">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-border/60 bg-surface flex-shrink-0">
        <span className="text-xs text-muted">{title}</span>
        <div className="flex items-center gap-1">
          {(["desktop", "mobile"] as const).map((v) => (
            <button
              key={v}
              onClick={() => setViewport(v)}
              className={`px-2.5 py-1 text-xs rounded-md transition-colors ${
                viewport === v ? "bg-surface2 text-text" : "text-faint hover:text-text"
              }`}
            >
              {v === "desktop" ? (
                <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <rect x="1" y="2" width="14" height="10" rx="1.5" />
                  <line x1="5" y1="15" x2="11" y2="15" />
                  <line x1="8" y1="12" x2="8" y2="15" />
                </svg>
              ) : (
                <svg width="11" height="13" viewBox="0 0 12 16" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <rect x="1" y="1" width="10" height="14" rx="2" />
                  <line x1="5" y1="13" x2="7" y2="13" />
                </svg>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* iframe */}
      <div className="flex-1 overflow-auto flex items-start justify-center p-4 bg-[#141312]">
        <iframe
          ref={iframeRef}
          sandbox="allow-scripts allow-same-origin"
          className="bg-white border border-border/40 rounded-lg shadow-xl"
          style={{
            width:  viewport === "mobile" ? "390px" : "100%",
            height: viewport === "mobile" ? "844px" : "100%",
            minHeight: viewport === "desktop" ? "500px" : undefined,
          }}
          title={title}
        />
      </div>
    </div>
  );
}
