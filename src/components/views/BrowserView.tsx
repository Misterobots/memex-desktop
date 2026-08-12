import { useCallback, useEffect, useRef, useState } from "react";
import { desktop, type BrowserPaneState } from "../../lib/desktop";

const INITIAL: BrowserPaneState = {
  url: "https://memex.shivelymedia.com", title: "Memex Browser",
  canGoBack: false, canGoForward: false, loading: false,
};

/** Renderer chrome for electron/browser-pane.ts's native BrowserView. */
export function BrowserView() {
  const hostRef = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<BrowserPaneState>(INITIAL);
  const [address, setAddress] = useState(INITIAL.url);
  const bridge = desktop();

  const syncBounds = useCallback(() => {
    const rect = hostRef.current?.getBoundingClientRect();
    if (!rect || !bridge) return;
    void bridge.browserPane.setBounds({ x: rect.left, y: rect.top, width: rect.width, height: rect.height });
  }, [bridge]);

  useEffect(() => {
    if (!bridge) return;
    let active = true;
    void bridge.browserPane.open().then((next) => {
      if (!active) return;
      setState(next); setAddress(next.url); requestAnimationFrame(syncBounds);
    });
    const unsubscribe = bridge.browserPane.onState((next) => {
      if (!active) return;
      setState(next); setAddress(next.url);
    });
    const observer = new ResizeObserver(syncBounds);
    if (hostRef.current) observer.observe(hostRef.current);
    window.addEventListener("resize", syncBounds);
    return () => {
      active = false;
      unsubscribe(); observer.disconnect(); window.removeEventListener("resize", syncBounds);
      void bridge.browserPane.hide();
    };
  }, [bridge, syncBounds]);

  const navigate = (value = address) => {
    if (!bridge) return;
    void bridge.browserPane.navigate(value).then(setState).catch(() => setAddress(state.url));
  };
  const command = (action: "back" | "forward" | "reload" | "stop") => {
    if (!bridge) return;
    void bridge.browserPane[action]().then(setState);
  };

  if (!bridge) return null;

  return (
    <section className="flex flex-col flex-1 min-w-0 bg-canvas">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-border/60 bg-surface/40">
        <button aria-label="Back" title="Back" disabled={!state.canGoBack} onClick={() => command("back")} className="p-1.5 rounded text-muted hover:text-text hover:bg-surface2 disabled:opacity-30">←</button>
        <button aria-label="Forward" title="Forward" disabled={!state.canGoForward} onClick={() => command("forward")} className="p-1.5 rounded text-muted hover:text-text hover:bg-surface2 disabled:opacity-30">→</button>
        <button aria-label={state.loading ? "Stop" : "Reload"} title={state.loading ? "Stop" : "Reload"} onClick={() => command(state.loading ? "stop" : "reload")} className="p-1.5 rounded text-muted hover:text-text hover:bg-surface2">{state.loading ? "×" : "↻"}</button>
        <form className="flex-1" onSubmit={(e) => { e.preventDefault(); navigate(); }}>
          <input aria-label="Address" value={address} onChange={(e) => setAddress(e.target.value)} onFocus={(e) => e.currentTarget.select()} className="w-full bg-canvas border border-border rounded-md px-3 py-1.5 text-sm text-text outline-none focus:border-accent" />
        </form>
        <button title="Open in default browser" onClick={() => void bridge.shell.openExternal(state.url)} className="p-1.5 rounded text-muted hover:text-text hover:bg-surface2">↗</button>
      </div>
      <div ref={hostRef} className="flex-1 min-h-0 relative bg-canvas">
        <div className="absolute inset-0 flex items-center justify-center text-muted text-sm pointer-events-none">{state.loading ? "Loading…" : state.title}</div>
      </div>
    </section>
  );
}
