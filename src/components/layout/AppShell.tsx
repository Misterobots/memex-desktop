import { useStore } from "../../lib/store";
import { Sidebar } from "./Sidebar";
import { StatusBar } from "./StatusBar";
import { InputBar } from "./InputBar";
import { ConversationPane } from "../chat/ConversationPane";

export function AppShell() {
  const { sidebarOpen } = useStore();

  return (
    <div className="flex flex-col h-full bg-canvas">
      <StatusBar />
      <div className="flex flex-1 min-h-0">
        {sidebarOpen && <Sidebar />}
        <main className="flex flex-col flex-1 min-w-0">
          <ConversationPane />
          <InputBar />
        </main>
      </div>
    </div>
  );
}
