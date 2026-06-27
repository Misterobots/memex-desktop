import { useEffect, useState } from "react";
import { AppShell } from "./components/layout/AppShell";
import { CommandPalette } from "./components/shared/CommandPalette";
import { SetupWizard } from "./components/onboarding/SetupWizard";
import { useStore } from "./lib/store";
import { checkHealth } from "./lib/memex-client";
import { desktop, isDesktop } from "./lib/desktop";
import { initRuntimeUrls } from "./lib/runtime-urls";
import { fetchRemoteSessions } from "./lib/conv-sync";

export default function App() {
  const {
    setConnections, setCwd, createSession, activeSessionId,
    setCommandPalette, commandPaletteOpen,
  } = useStore();
  const [wizardDone, setWizardDone] = useState<boolean | null>(null); // null = loading

  // Check wizard completion state on startup
  useEffect(() => {
    const bridge = desktop();
    if (!bridge) { setWizardDone(true); return; } // web mode — skip wizard
    bridge.config.getWizardDone().then((done) => setWizardDone(done)).catch(() => setWizardDone(true));
  }, []);

  useEffect(() => {
    if (!activeSessionId) createSession();
    // Load active profile URLs before any requests fire, then resume sessions
    // from the backend (cross-device / fresh-install continuity).
    initRuntimeUrls().then(() => {
      if (!isDesktop()) return;
      fetchRemoteSessions().then((remote) => {
        if (remote.length) useStore.getState().mergeRemoteSessions(remote);
      });
    });

    // Health status — prefer native push events in Electron, fall back to JS polling
    let id: ReturnType<typeof setInterval> | undefined;
    let offHealth: (() => void) | undefined;

    if (isDesktop()) {
      const bridge = desktop()!;
      // Subscribe to native health:status events from main process
      offHealth = bridge.health.onStatus((s) => {
        setConnections({
          agentRuntime: s.agentRuntime as "connected" | "disconnected",
          mempalace:    s.mempalace    as "connected" | "disconnected",
          ollama:       s.ollama       as "connected" | "disconnected",
        });
      });
      // Seed with last known status if available
      bridge.health.getLast().then((s) => {
        if (s) setConnections({
          agentRuntime: s.agentRuntime as "connected" | "disconnected",
          mempalace:    s.mempalace    as "connected" | "disconnected",
          ollama:       s.ollama       as "connected" | "disconnected",
        });
      });
    } else {
      // Browser dev — JS fetch-based polling
      const poll = async () => {
        const h = await checkHealth();
        setConnections({
          agentRuntime: h.agentRuntime ? "connected" : "disconnected",
          mempalace:    h.mempalace    ? "connected" : "disconnected",
          ollama:       h.ollama       ? "connected" : "disconnected",
        });
      };
      poll();
      id = setInterval(poll, 30_000);
    }

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

    return () => {
      if (id)        clearInterval(id);
      if (offHealth) offHealth();
    };
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

  const handleWizardComplete = () => {
    desktop()?.config.setWizardDone();
    setWizardDone(true);
  };

  // Show nothing while wizard completion state is loading
  if (wizardDone === null) return null;

  return (
    <>
      {!wizardDone && <SetupWizard onComplete={handleWizardComplete} />}
      <AppShell />
      {commandPaletteOpen && <CommandPalette />}
    </>
  );
}
