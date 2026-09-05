import { useState } from "react";
import { outputsFromEvents, type WorkspaceOutput } from "../../lib/workspace-outputs";
import type { MessageEvent } from "../../types/memex";

function OutputCard({ output }: { output: WorkspaceOutput }) {
  const [source, setSource] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [failed, setFailed] = useState(false);
  const [notice, setNotice] = useState("");
  const copy = async () => {
    try { await navigator.clipboard.writeText(output.html!); setNotice("HTML copied."); }
    catch { setNotice("Clipboard unavailable. Select and copy the HTML from Source."); setSource(true); }
  };
  const download = () => {
    const url = URL.createObjectURL(new Blob([output.html!], { type: "text/html" }));
    const link = document.createElement("a");
    link.href = url; link.download = output.name.endsWith(".html") ? output.name : output.name + ".html";
    document.body.appendChild(link);
    link.click();
    link.remove();
    setNotice("Download requested. If it does not start, use Copy HTML or Source.");
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  return <section aria-label={output.name} className="rounded-xl border border-border bg-surface overflow-hidden">
    <div className="flex flex-wrap items-center gap-2 border-b border-border/60 p-3 text-xs">
      <span className="mr-auto min-w-0 break-all font-medium text-text">{output.name}</span>
      {output.html && <>
        <button aria-pressed={!source} onClick={() => setSource(false)} className="rounded px-2 py-1 hover:bg-surface2">Preview</button>
        <button aria-pressed={source} onClick={() => setSource(true)} className="rounded px-2 py-1 hover:bg-surface2">Source</button>
        <button aria-expanded={expanded} onClick={() => setExpanded(!expanded)} className="rounded px-2 py-1 hover:bg-surface2">{expanded ? "Compact preview" : "Expand preview"}</button>
        <button onClick={download} className="rounded px-2 py-1 text-accent hover:bg-surface2">Download HTML</button>
        <button onClick={copy} className="rounded px-2 py-1 text-accent hover:bg-surface2">Copy HTML</button>
      </>}
      {output.url && <a href={output.downloadUrl ?? output.url} target="_blank" rel="noreferrer" className="text-accent">Open / download</a>}
    </div>
    {notice && <p role="status" className="px-3 py-2 text-xs text-muted">{notice}</p>}
    {output.html ? source
      ? <pre className="max-h-[65vh] overflow-auto p-4 text-xs text-text"><code>{output.html}</code></pre>
      : <iframe title={output.name + " preview"} sandbox="allow-scripts"
          referrerPolicy="no-referrer" srcDoc={output.html}
          className={expanded ? "w-full h-[75vh] bg-white border-0" : "w-full h-[420px] bg-white border-0"} />
      : output.url ? <>
        {output.mimeType?.startsWith("image/") && !failed && <img src={output.url} alt={output.name} onError={() => setFailed(true)} className="max-h-[65vh] max-w-full mx-auto object-contain" />}
        {output.mimeType?.startsWith("video/") && <video src={output.url} controls onError={() => setFailed(true)} className="max-h-[65vh] w-full" />}
        {output.mimeType?.startsWith("audio/") && <audio src={output.url} controls onError={() => setFailed(true)} className="w-full" />}
        {failed && <p role="alert" className="p-3 text-sm text-red-400">The media could not be loaded. Try the output link above.</p>}
        {!/^(image|video|audio)\//.test(output.mimeType ?? "") && <p className="p-3 text-sm text-muted">Use Open / download to view this file.</p>}
      </> : <p role="status" className="p-3 text-sm text-muted">The runtime returned a file reference without a downloadable URL.{output.path && <code className="block mt-2 break-all">{output.path}</code>}</p>}
  </section>;
}

export function MessageOutputs({ events }: { events: MessageEvent[] }) {
  const outputs = outputsFromEvents(events);
  const workflow = events.filter((event) => ["workshop_questions", "workflow_next_steps"].includes(String(event.data?.type)));
  return <>{outputs.map((output, index) => <OutputCard key={index + output.name} output={output} />)}
    {workflow.slice(-1).map((event, index) => {
      const payload = event.data?.content as Record<string, unknown> | undefined;
      if (!payload || payload.loading) return null;
      const questions = Array.isArray(payload.questions) ? payload.questions : [];
      const steps = Array.isArray(payload.steps) ? payload.steps : [];
      return <section key={index} aria-label="Routine next steps" className="rounded-xl border border-border bg-surface p-3 text-sm space-y-3">
        {questions.length > 0 && <details><summary className="cursor-pointer text-accent">Discovery questions</summary>
          {questions.map((question, i) => <p key={i} className="mt-2"><strong>{String(question.topic ?? "Question")}</strong><br />{String(question.text ?? "")}</p>)}
        </details>}
        {steps.map((step, i) => <details key={i}><summary className="cursor-pointer text-accent">{String(step.label ?? "Next step")}</summary>
          <pre className="mt-2 whitespace-pre-wrap break-words text-xs">{String(step.prompt ?? "")}</pre>
        </details>)}
      </section>;
    })}
  </>;
}
