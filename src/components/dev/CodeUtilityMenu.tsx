import { useEffect, useRef, useState } from "react";

type Props = {
  onProjects: () => void;
  onNavigate: (tab: "pulls" | "schedules" | "sites" | "skills") => void;
};

const actions = [
  { id: "projects", label: "Projects", detail: "Browse workspace projects" },
  { id: "pulls", label: "Pull requests", detail: "Review tasks and open a PR" },
  { id: "schedules", label: "Scheduled", detail: "Manage recurring work" },
  { id: "sites", label: "Sites & design", detail: "Design an app or site" },
  { id: "plugins", label: "Skills & plugins", detail: "Manage available extensions" },
] as const;

export function CodeUtilityMenu({ onProjects, onNavigate }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent) => { if (!ref.current?.contains(event.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  const select = (id: typeof actions[number]["id"]) => {
    setOpen(false);
    if (id === "projects") onProjects();
    else if (id === "pulls") onNavigate("pulls");
    else if (id === "schedules") onNavigate("schedules");
    else if (id === "sites") onNavigate("sites");
    else onNavigate("skills");
  };

  return <div ref={ref} className="relative">
    <button onClick={() => setOpen((value) => !value)} className={`px-2.5 py-1 text-xs rounded-md transition-colors ${open ? "bg-surface2 text-text" : "text-faint hover:text-text"}`}>
      More
    </button>
    {open && <div className="absolute right-0 top-full mt-2 w-64 p-1.5 rounded-xl border border-border/60 bg-canvas shadow-2xl z-40">
      {actions.map((action) => <button key={action.id} onClick={() => select(action.id)} className="w-full text-left px-3 py-2.5 rounded-lg hover:bg-surface2 transition-colors">
        <span className="block text-sm text-text">{action.label}</span>
        <span className="block mt-0.5 text-[11px] text-muted">{action.detail}</span>
      </button>)}
    </div>}
  </div>;
}
