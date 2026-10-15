import { useState } from "react";

export function ResponseActions({ content }: { content: string }) {
  const [notice, setNotice] = useState("");
  return <div className="flex flex-wrap items-center gap-3 text-xs text-muted pt-1">
    <button className="flex items-center gap-1.5 hover:text-text hover:bg-surface2 p-1 rounded transition-colors" onClick={async () => {
      try { await navigator.clipboard.writeText(content); setNotice("Copied"); setTimeout(() => setNotice(""), 2000); }
      catch { setNotice("Clipboard unavailable"); }
    }} title="Copy">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"></path></svg>
      <span>Copy</span>
    </button>
    <button className="flex items-center gap-1.5 hover:text-text hover:bg-surface2 p-1 rounded transition-colors" onClick={() => {
      setNotice("Branching not implemented"); setTimeout(() => setNotice(""), 2000);
    }} title="Branch">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 3v12M18 9a3 3 0 100-6 3 3 0 000 6zM6 21a3 3 0 100-6 3 3 0 000 6zM15 9l-9 6"></path></svg>
      <span>Branch</span>
    </button>
    <button className="flex items-center gap-1.5 hover:text-text hover:bg-surface2 p-1 rounded transition-colors" onClick={() => {
      setNotice("Retry not implemented"); setTimeout(() => setNotice(""), 2000);
    }} title="Retry">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.92-12.28l5.07 5.07"></path></svg>
      <span>Retry</span>
    </button>
    {notice && <span role="status">{notice}</span>}
  </div>;
}
