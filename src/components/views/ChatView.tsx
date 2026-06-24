import { useStore } from "../../lib/store";
import { SessionList } from "../sidebar/SessionList";
import { ConversationPane } from "../chat/ConversationPane";
import { InputBar } from "../layout/InputBar";

export function ChatView() {
  const { sidebarOpen } = useStore();

  return (
    <div className="flex flex-1 min-h-0">
      {sidebarOpen && (
        <aside className="w-[260px] flex-shrink-0 border-r border-border/60 bg-surface overflow-y-auto">
          <SessionList />
        </aside>
      )}
      <main className="flex flex-col flex-1 min-w-0">
        <ConversationPane />
        <InputBar placeholder="Message Memex…" />
      </main>
    </div>
  );
}
