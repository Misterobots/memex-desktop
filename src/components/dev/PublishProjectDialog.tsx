import { useEffect, useState } from "react";
import { getPublishPreview, publishProject, type PublishPreview } from "../../lib/dev-publish-api";

/**
 * Single-click Publish confirm dialog — deliberately NOT the multi-step
 * preview/confirm-token gate the task-completion push flow uses (that gate
 * exists to approve an agent-produced diff; this is the user's own project,
 * their own deliberate click). The one dialog still shows what's about to be
 * pushed (branch + files) so the click is informed either way.
 */
interface Props {
  projectId:   string;
  projectName: string;
  onClose:     () => void;
  onPublished: (result: { git_url: string; html_url: string }) => void;
}

export function PublishProjectDialog({ projectId, projectName, onClose, onPublished }: Props) {
  const [preview, setPreview]   = useState<PublishPreview | null>(null);
  const [loadError, setLoadError] = useState("");
  const [repoName, setRepoName] = useState(projectName);
  const [isPrivate, setIsPrivate] = useState(true);
  const [publishing, setPublishing] = useState(false);
  const [publishError, setPublishError] = useState("");
  const [result, setResult] = useState<{ git_url: string; html_url: string } | null>(null);

  useEffect(() => {
    (async () => {
      const r = await getPublishPreview(projectId);
      if (r.preview) {
        setPreview(r.preview);
        setRepoName(r.preview.suggested_repo_name || projectName);
      } else if (r.status === 400) {
        setLoadError(r.detail || "This project isn't publishable yet.");
      } else if (r.status === 404) {
        setLoadError("GitHub publish isn't enabled on this server.");
      } else {
        setLoadError("Could not load publish preview — check your connection.");
      }
    })();
  }, [projectId, projectName]);

  const handlePublish = async () => {
    if (!repoName.trim()) { setPublishError("Repo name is required"); return; }
    setPublishError("");
    setPublishing(true);
    const r = await publishProject(projectId, { repoName: repoName.trim(), private: isPrivate });
    setPublishing(false);
    if (r.git_url && r.html_url) {
      setResult({ git_url: r.git_url, html_url: r.html_url });
      onPublished({ git_url: r.git_url, html_url: r.html_url });
    } else if (r.status === 409) {
      setPublishError(r.detail || "A repo with that name already exists — pick another.");
    } else {
      setPublishError(r.detail || "Publish failed — check your connection and try again.");
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-canvas border border-border/60 rounded-2xl shadow-2xl w-full max-w-lg max-h-[85vh] flex flex-col">

        <div className="flex items-center justify-between px-5 py-3.5 border-b border-border/40 flex-shrink-0">
          <span className="text-sm font-semibold text-text">Publish to GitHub</span>
          <button onClick={onClose} className="text-muted hover:text-text p-1">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8">
              <path d="M3 3l10 10M13 3L3 13" />
            </svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {loadError && <p className="text-sm text-red-400">{loadError}</p>}

          {result ? (
            <div className="space-y-3">
              <p className="text-sm text-green-400">Published successfully.</p>
              <a
                href={result.html_url} target="_blank" rel="noreferrer"
                className="text-sm text-accent hover:underline break-all"
              >{result.html_url}</a>
            </div>
          ) : preview ? (
            <>
              <div>
                <div className="text-[10px] text-muted uppercase tracking-wide mb-1.5">Repo name</div>
                <input
                  value={repoName}
                  onChange={(e) => { setRepoName(e.target.value); setPublishError(""); }}
                  disabled={publishing}
                  className="w-full px-3 py-2 rounded-lg bg-surface2 border border-border/60 text-sm text-text
                    focus:outline-none focus:ring-1 focus:ring-accent/60 disabled:opacity-60"
                />
                {preview.github_username && (
                  <p className="text-[11px] text-muted mt-1">as {preview.github_username}/{repoName || "…"}</p>
                )}
              </div>

              <label className="flex items-center gap-2 text-sm text-text/80">
                <input type="checkbox" checked={isPrivate} onChange={(e) => setIsPrivate(e.target.checked)} disabled={publishing} />
                Private repository
              </label>

              <div>
                <div className="text-[10px] text-muted uppercase tracking-wide mb-1.5">
                  Branch {preview.branch} · {preview.files.length} file{preview.files.length === 1 ? "" : "s"}
                </div>
                <div className="max-h-40 overflow-y-auto rounded-lg border border-border/40 bg-surface2/30 p-2 space-y-0.5">
                  {preview.files.slice(0, 100).map((f) => (
                    <div key={f} className="text-xs font-mono text-text/70 truncate">{f}</div>
                  ))}
                  {preview.files.length > 100 && (
                    <div className="text-xs text-muted">…and {preview.files.length - 100} more</div>
                  )}
                </div>
              </div>

              {publishError && <p className="text-xs text-red-400">{publishError}</p>}
            </>
          ) : !loadError ? (
            <p className="text-sm text-muted">Loading…</p>
          ) : null}
        </div>

        <div className="flex gap-3 px-5 py-3.5 border-t border-border/40 flex-shrink-0">
          {result ? (
            <button onClick={onClose} className="flex-1 py-2 rounded-xl bg-accent text-white text-sm font-medium hover:bg-accent/80">
              Done
            </button>
          ) : (
            <>
              <button
                onClick={handlePublish}
                disabled={!preview || publishing}
                className="flex-1 py-2 rounded-xl bg-accent text-white text-sm font-medium hover:bg-accent/80 disabled:opacity-50"
              >{publishing ? "Publishing…" : "Publish"}</button>
              <button onClick={onClose} className="flex-1 py-2 rounded-xl bg-surface2 border border-border/60 text-sm hover:bg-surface2/80">
                Cancel
              </button>
            </>
          )}
        </div>

      </div>
    </div>
  );
}
