import { useEffect } from "react";
import { AppShell } from "./components/layout/AppShell";
import { CommandPalette } from "./components/shared/CommandPalette";
import { useStore } from "./lib/store";
import { checkHealth } from "./lib/memex-client";
import { ipc } from "./lib/ipc";

export default function App() {
  const { setConnections, setCwd, createSession, activeSessionId, setCommandPalette, commandPaletteOpen } = useStore();

  // Initial setup
  useEffect(() => {
    // Ensure a session exists
    if (!activeSessionId) createSession();

    // Resolve working directory
    ipc.getCwd().then(setCwd).catch(() => setCwd("~"));

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
    return () => clearInterval(id);
  }, []);

  // Global keyboard shortcuts
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
