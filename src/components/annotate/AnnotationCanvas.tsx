import { useEffect, useRef, useState } from "react";

/**
 * Small canvas-based image markup tool: rectangle / arrow / text / blur (pixelate).
 * Hand-rolled rather than a pulled-in annotation library — the scope here is
 * deliberately small, and one more bundled dependency isn't worth it for this.
 *
 * Actions are kept as a replayable list (image draw, then each action in order)
 * rather than mutating the canvas directly, so Undo just pops the list and redraws.
 */

type Tool = "rect" | "arrow" | "text" | "blur";

type Action =
  | { tool: "rect";  x: number; y: number; w: number; h: number; color: string }
  | { tool: "arrow"; x1: number; y1: number; x2: number; y2: number; color: string }
  | { tool: "text";  x: number; y: number; text: string; color: string }
  | { tool: "blur";  x: number; y: number; w: number; h: number };

const COLORS = ["#ef4444", "#eab308", "#22c55e", "#3b82f6"];
const PIXEL_SIZE = 8;

function drawArrowHead(ctx: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number) {
  const angle = Math.atan2(y2 - y1, x2 - x1);
  const size = 10;
  ctx.beginPath();
  ctx.moveTo(x2, y2);
  ctx.lineTo(x2 - size * Math.cos(angle - Math.PI / 6), y2 - size * Math.sin(angle - Math.PI / 6));
  ctx.moveTo(x2, y2);
  ctx.lineTo(x2 - size * Math.cos(angle + Math.PI / 6), y2 - size * Math.sin(angle + Math.PI / 6));
  ctx.stroke();
}

function pixelate(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) {
  if (w <= 0 || h <= 0) return;
  const img = ctx.getImageData(x, y, w, h);
  const small = document.createElement("canvas");
  small.width  = Math.max(1, Math.round(w / PIXEL_SIZE));
  small.height = Math.max(1, Math.round(h / PIXEL_SIZE));
  const sctx = small.getContext("2d")!;
  const tmp = document.createElement("canvas");
  tmp.width = w; tmp.height = h;
  tmp.getContext("2d")!.putImageData(img, 0, 0);
  sctx.imageSmoothingEnabled = true;
  sctx.drawImage(tmp, 0, 0, w, h, 0, 0, small.width, small.height);
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(small, 0, 0, small.width, small.height, x, y, w, h);
  ctx.imageSmoothingEnabled = true;
}

function replay(ctx: CanvasRenderingContext2D, image: HTMLImageElement, actions: Action[]) {
  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  ctx.drawImage(image, 0, 0);
  for (const a of actions) {
    if (a.tool === "rect") {
      ctx.strokeStyle = a.color; ctx.lineWidth = 3;
      ctx.strokeRect(a.x, a.y, a.w, a.h);
    } else if (a.tool === "arrow") {
      ctx.strokeStyle = a.color; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(a.x1, a.y1); ctx.lineTo(a.x2, a.y2); ctx.stroke();
      drawArrowHead(ctx, a.x1, a.y1, a.x2, a.y2);
    } else if (a.tool === "text") {
      ctx.fillStyle = a.color; ctx.font = "20px sans-serif";
      ctx.fillText(a.text, a.x, a.y);
    } else if (a.tool === "blur") {
      pixelate(ctx, a.x, a.y, a.w, a.h);
    }
  }
}

interface Props {
  src:      string; // data URL or file:// path
  onSave:   (dataUrl: string) => void;
  onCancel: () => void;
}

export function AnnotationCanvas({ src, onSave, onCancel }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imageRef  = useRef<HTMLImageElement | null>(null);
  const dragStart = useRef<{ x: number; y: number } | null>(null);

  const [tool, setTool]       = useState<Tool>("rect");
  const [color, setColor]     = useState(COLORS[0]);
  const [actions, setActions] = useState<Action[]>([]);
  const [ready, setReady]     = useState(false);

  // Load the source image once.
  useEffect(() => {
    const img = new Image();
    img.onload = () => {
      imageRef.current = img;
      const c = canvasRef.current;
      if (!c) return;
      c.width = img.naturalWidth;
      c.height = img.naturalHeight;
      const ctx = c.getContext("2d");
      if (ctx) replay(ctx, img, []);
      setReady(true);
    };
    img.src = src;
  }, [src]);

  // Redraw whenever the action list changes.
  useEffect(() => {
    const c = canvasRef.current, img = imageRef.current;
    if (!c || !img) return;
    const ctx = c.getContext("2d");
    if (ctx) replay(ctx, img, actions);
  }, [actions]);

  const toCanvasPoint = (e: React.MouseEvent): { x: number; y: number } => {
    const c = canvasRef.current!;
    const rect = c.getBoundingClientRect();
    const scaleX = c.width / rect.width;
    const scaleY = c.height / rect.height;
    return { x: (e.clientX - rect.left) * scaleX, y: (e.clientY - rect.top) * scaleY };
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    if (tool === "text") {
      const p = toCanvasPoint(e);
      const text = window.prompt("Annotation text:");
      if (text) setActions((a) => [...a, { tool: "text", x: p.x, y: p.y, text, color }]);
      return;
    }
    dragStart.current = toCanvasPoint(e);
  };

  const handleMouseUp = (e: React.MouseEvent) => {
    const start = dragStart.current;
    dragStart.current = null;
    if (!start || tool === "text") return;
    const end = toCanvasPoint(e);
    if (tool === "rect") {
      setActions((a) => [...a, {
        tool: "rect", color,
        x: Math.min(start.x, end.x), y: Math.min(start.y, end.y),
        w: Math.abs(end.x - start.x), h: Math.abs(end.y - start.y),
      }]);
    } else if (tool === "arrow") {
      setActions((a) => [...a, { tool: "arrow", color, x1: start.x, y1: start.y, x2: end.x, y2: end.y }]);
    } else if (tool === "blur") {
      setActions((a) => [...a, {
        tool: "blur",
        x: Math.min(start.x, end.x), y: Math.min(start.y, end.y),
        w: Math.abs(end.x - start.x), h: Math.abs(end.y - start.y),
      }]);
    }
  };

  const handleSave = () => {
    const c = canvasRef.current;
    if (!c) return;
    onSave(c.toDataURL("image/png"));
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-canvas border border-border/60 rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col">

        <div className="flex items-center justify-between px-5 py-3.5 border-b border-border/40 flex-shrink-0">
          <span className="text-sm font-semibold text-text">Annotate</span>
          <button onClick={onCancel} className="text-muted hover:text-text p-1">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8">
              <path d="M3 3l10 10M13 3L3 13" />
            </svg>
          </button>
        </div>

        <div className="flex items-center gap-3 px-5 py-2.5 border-b border-border/40 flex-shrink-0">
          {(["rect", "arrow", "text", "blur"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTool(t)}
              className={`px-2.5 py-1 rounded-lg text-xs border capitalize transition-colors
                ${tool === t ? "border-accent/50 bg-accent/10 text-accent" : "border-border/40 text-muted hover:text-text"}`}
            >{t === "rect" ? "Box" : t === "blur" ? "Pixelate" : t}</button>
          ))}
          <div className="flex gap-1.5 ml-2">
            {COLORS.map((c) => (
              <button
                key={c}
                onClick={() => setColor(c)}
                style={{ backgroundColor: c }}
                className={`w-5 h-5 rounded-full border-2 ${color === c ? "border-text" : "border-transparent"}`}
              />
            ))}
          </div>
          <button
            onClick={() => setActions((a) => a.slice(0, -1))}
            disabled={actions.length === 0}
            className="ml-auto px-2.5 py-1 rounded-lg text-xs border border-border/40 text-muted hover:text-text disabled:opacity-40"
          >Undo</button>
        </div>

        <div className="flex-1 overflow-auto p-4 flex items-center justify-center bg-surface2/20">
          {!ready && <p className="text-sm text-muted">Loading image…</p>}
          <canvas
            ref={canvasRef}
            className="max-w-full max-h-full cursor-crosshair border border-border/40"
            style={{ display: ready ? "block" : "none" }}
            onMouseDown={handleMouseDown}
            onMouseUp={handleMouseUp}
          />
        </div>

        <div className="flex gap-3 px-5 py-3.5 border-t border-border/40 flex-shrink-0">
          <button
            onClick={handleSave}
            disabled={!ready}
            className="flex-1 py-2 rounded-xl bg-accent text-white text-sm font-medium hover:bg-accent/80 disabled:opacity-50"
          >Save annotation</button>
          <button onClick={onCancel} className="flex-1 py-2 rounded-xl bg-surface2 border border-border/60 text-sm hover:bg-surface2/80">
            Cancel
          </button>
        </div>

      </div>
    </div>
  );
}
