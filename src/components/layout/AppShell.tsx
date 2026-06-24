import { useStore } from "../../lib/store";
import { StatusBar } from "./StatusBar";
import { TabBar } from "./TabBar";
import { ChatView } from "../views/ChatView";
import { GoalsView } from "../views/GoalsView";
import { ArtView } from "../views/ArtView";
import { DevView } from "../views/DevView";

export function AppShell() {
  const { activeTab } = useStore();

  return (
    <div className="flex flex-col h-full bg-canvas">
      <StatusBar />
      <TabBar />
      <div className="flex flex-1 min-h-0">
        {activeTab === "chat"  && <ChatView />}
        {activeTab === "goals" && <GoalsView />}
        {activeTab === "art"   && <ArtView />}
        {activeTab === "dev"   && <DevView />}
      </div>
    </div>
  );
}
