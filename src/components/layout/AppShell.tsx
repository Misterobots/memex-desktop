import { useEffect, useState } from "react";
import { useStore } from "../../lib/store";
import { StatusBar } from "./StatusBar";
import { TabBar } from "./TabBar";
import { ChatView } from "../views/ChatView";
import { GoalsView } from "../views/GoalsView";
import { ResearchView } from "../views/ResearchView";
import { ArtView } from "../views/ArtView";
import { DesignView } from "../views/DesignView";
import { MemoryView } from "../views/MemoryView";
import { DevView } from "../views/DevView";
import { SettingsView }   from "../views/SettingsView";
import { EvalBenchView }  from "../views/EvalBenchView";
import { DiffReviewModal } from "../shared/DiffReviewModal";
import { ExportPanel }     from "../shared/ExportPanel";
import { DiffReviewContext, useDiffReviewStore } from "../../hooks/useDiffReview";

function AppShellInner() {
  const { activeTab } = useStore();
  const diffReview = useDiffReviewStore();
  const [exportOpen, setExportOpen] = useState(false);

  // Ctrl+Shift+E → open export dialog
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === "e") {
        e.preventDefault();
        setExportOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  return (
    <DiffReviewContext.Provider value={diffReview}>
      <div className="flex flex-col h-full bg-canvas">
        <StatusBar />
        <TabBar />
        <div className="flex flex-1 min-h-0">
          {activeTab === "chat"      && <ChatView />}
          {activeTab === "research"  && <ResearchView />}
          {activeTab === "goals"     && <GoalsView />}
          {activeTab === "design"    && <DesignView />}
          {activeTab === "art"       && <ArtView />}
          {activeTab === "memory"    && <MemoryView />}
          {activeTab === "dev"       && <DevView />}
          {activeTab === "eval"      && <EvalBenchView />}
          {activeTab === "settings"  && <SettingsView />}
        </div>
      </div>
      {diffReview.pending && (
        <DiffReviewModal
          filePath={diffReview.pending.filePath}
          oldContent={diffReview.pending.oldContent}
          newContent={diffReview.pending.newContent}
          onApprove={diffReview.approve}
          onReject={diffReview.reject}
        />
      )}
      {exportOpen && <ExportPanel onClose={() => setExportOpen(false)} />}
    </DiffReviewContext.Provider>
  );
}

export function AppShell() {
  return <AppShellInner />;
}
