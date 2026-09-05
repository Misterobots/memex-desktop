import { useState } from "react";

export function ResponseActions({ content }: { content: string }) {
  const [notice, setNotice] = useState("");
  return <div className="flex flex-wrap items-center gap-3 text-xs text-muted">
    <button className="hover:text-text" onClick={async () => {
      try { await navigator.clipboard.writeText(content); setNotice("Response copied."); }
      catch { setNotice("Clipboard unavailable. Select the response text to copy."); }
    }}>Copy response</button>
    <button className="hover:text-text" onClick={() => {
      const url = URL.createObjectURL(new Blob([content], { type: "text/markdown" }));
      const anchor = document.createElement("a");
      anchor.href = url; anchor.download = "memex-response.md";
      document.body.appendChild(anchor); anchor.click(); anchor.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setNotice("Download requested.");
    }}>Save Markdown</button>
    {notice && <span role="status">{notice}</span>}
  </div>;
}
