import { useEffect } from "react";
import { AppShell } from "./components/layout/AppShell";
import { CommandPalette } from "./components/shared/CommandPalette";
import { useStore } from "./lib/store";
import { checkHealth } from "./lib/memex-client";
import { desktop } from "./lib/desktop";
import { initRuntimeUrls } from "./lib/runtime-urls";

export default function App() {
  const {
    setConnections, setCwd, createSession, activeSessionId,
    setCommandPalette, commandPaletteOpen,
  } = useStore();

  useEffect(() => {
    if (!activeSessionId) createSession();
    // Load active profile URLs before any requests fire
    initRuntimeUrls();

    // Health check on mount and every 30s
    const poll = async () => {
      const h = await checkHealth();
      setConnections({
        agentRuntime: h.agentRuntime ? "connected" : "disconnected",
        mempalace:    h.mempalace    ? "connected" : "disconnected",
        ollama:       h.ollama       ? "connected" : "disconnected",
      });
    };
    poll();
    const id = setInterval(poll, 30_000);

    // Native bridge handlers
    const bridge = desktop();
    if (bridge) {
      // Quick entry → prefill chat input
      bridge.onQuickSubmit((text) => {
        window.dispatchEvent(new CustomEvent("chat:prefill", { detail: text }));
      });

      // File/folder drop → switch to dev tab
      bridge.onOpenPath((_path) => {
        useStore.getState().setActiveTab("dev");
      });

      // Global shortcut: new conversation
      (window as any).__memexNewConversation = () => {
        const { createSession: cs, setActiveTab } = useStore.getState();
        cs();
        setActiveTab("chat");
      };

      // File type handler: .memex / .claude
      (window as any).__memexImportFile = (path: string) => {
        window.dispatchEvent(new CustomEvent("memex:importFile", { detail: path }));
      };

      // Resolve working directory
      bridge.fs.readDir(".").then(() => {}).catch(() => {});
      setCwd("");
    }

    return () => clearInterval(id);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Ctrl+K command palette
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "k") {
        e.preventDefault();
        setCommandPalette(!commandPaletteOpen);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [commandPaletteOpen]);

  return (
    <>
      <AppShell />
      {commandPaletteOpen && <CommandPalette />}
    </>
  );
}
