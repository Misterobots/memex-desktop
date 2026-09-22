import { useEffect, type ReactNode } from "react";
import { useStore } from "../../lib/store";

export function WorkspaceSidebar({ children }: { children: ReactNode }) {
  const { sidebarOpen, toggleSidebar } = useStore();
  useEffect(() => {
    if (window.innerWidth < 768 && useStore.getState().sidebarOpen) toggleSidebar();
  }, []);
  if (!sidebarOpen) return null;
  return <>
    <button aria-label="Close workspace sidebar" onClick={toggleSidebar} className="fixed inset-0 z-30 bg-black/50 md:hidden" />
    <aside className="fixed inset-y-0 left-0 z-40 flex w-[82vw] max-w-[300px] flex-col overflow-y-auto border-r border-border/60 bg-surface md:static md:z-auto md:w-[260px] md:flex-shrink-0">
      <button onClick={toggleSidebar} className="self-end m-3 text-xs text-muted md:hidden">Close sidebar</button>
      {children}
    </aside>
  </>;
}
