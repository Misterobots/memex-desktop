import { useEffect, useRef, useState } from "react";
import { desktop } from "../../lib/desktop";
import { useStore } from "../../lib/store";

/** Persistent, Codex-style account control for the public Memex session. */
export function AccountMenu() {
  const { connections, setConnections, setActiveTab } = useStore();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<"signIn" | "signOut" | null>(null);
  const [uid, setUid] = useState("");
  const [notice, setNotice] = useState("");
  const root = useRef<HTMLDivElement>(null);
  const bridge = desktop();
  const connected = connections.agentRuntime === "connected";

  useEffect(() => {
    bridge?.identity?.get().then(setUid).catch(() => {});
  }, [bridge]);

  useEffect(() => {
    const close = (event: MouseEvent) => {
      if (root.current && !root.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(""), 3500);
    return () => window.clearTimeout(timer);
  }, [notice]);

  // Settings is the advanced home for routing, but feedback must remain
  // visible there too.  The persistent account control owns the one shared
  // lightweight notification surface.
  useEffect(() => {
    const showNotice = (event: Event) => setNotice((event as CustomEvent<string>).detail);
    window.addEventListener("memex:notice", showNotice);
    return () => window.removeEventListener("memex:notice", showNotice);
  }, []);

  const signIn = async () => {
    if (!bridge) return;
    setBusy("signIn");
    try {
      const complete = await bridge.remoteAuth.signIn();
      if (!complete) { setNotice("Sign-in was cancelled."); return; }
      const health = await bridge.health.check();
      setConnections({
        agentRuntime: health.agentRuntime as "connected" | "disconnected",
        mempalace: health.mempalace as "connected" | "disconnected",
        ollama: health.ollama as "connected" | "disconnected",
      });
      setNotice(health.agentRuntime === "connected" ? "Signed in to Memex." : "Signed in — checking Memex connection.");
    } catch {
      setNotice("Could not complete sign-in. Please try again.");
    } finally {
      setBusy(null);
    }
  };

  const signOut = async () => {
    if (!bridge) return;
    setBusy("signOut");
    try {
      const complete = await bridge.remoteAuth.signOut();
      if (!complete) throw new Error("Sign-out did not complete");
      setConnections({ agentRuntime: "disconnected", mempalace: "disconnected", ollama: "disconnected" });
      setOpen(false);
      setNotice("Signed out of Memex on this desktop.");
    } catch {
      setNotice("Could not sign out. Please try again.");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div ref={root} className="relative">
      {notice && (
        <div role="status" className="absolute right-0 top-[calc(100%+8px)] z-50 w-64 rounded-lg border border-accent/30 bg-surface2 px-3 py-2 text-xs text-text shadow-xl">
          {notice}
        </div>
      )}
      {open && (
        <div className="absolute right-0 top-[calc(100%+8px)] z-50 w-64 rounded-xl border border-border/70 bg-surface2 p-2 shadow-2xl">
          <div className="px-2 py-1.5">
            <div className="text-sm font-medium text-text truncate">{uid || "Memex account"}</div>
            <div className={`mt-0.5 text-xs ${connected ? "text-green" : "text-muted"}`}>
              {connected ? "Connected to Memex Anywhere" : "Signed out or unavailable"}
            </div>
          </div>
          <div className="my-1 border-t border-border/60" />
          <button onClick={() => { setActiveTab("settings"); setOpen(false); }} className="w-full rounded-lg px-2 py-2 text-left text-sm text-muted hover:bg-surface hover:text-text">
            Account & routing settings
          </button>
          {connected ? (
            <button onClick={signOut} disabled={busy !== null} className="w-full rounded-lg px-2 py-2 text-left text-sm text-red-400 hover:bg-red-500/10 disabled:opacity-50">
              {busy === "signOut" ? "Signing out…" : "Sign out"}
            </button>
          ) : (
            <button onClick={signIn} disabled={busy !== null} className="w-full rounded-lg px-2 py-2 text-left text-sm text-accent hover:bg-accent/10 disabled:opacity-50">
              {busy === "signIn" ? "Signing in…" : "Sign in to Memex"}
            </button>
          )}
        </div>
      )}
      <button onClick={() => setOpen((value) => !value)} className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-left hover:bg-surface2">
        <span className={`flex h-7 w-7 items-center justify-center rounded-full text-[10px] font-semibold ${connected ? "bg-accent/20 text-accent" : "bg-surface2 text-muted"}`}>
          {(uid || "M").slice(0, 2).toUpperCase()}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium text-text">{uid || "Memex"}</span>
          <span className={`block text-[11px] ${connected ? "text-green" : "text-muted"}`}>{connected ? "Connected" : "Sign in required"}</span>
        </span>
        <span className="text-muted">⌄</span>
      </button>
    </div>
  );
}
