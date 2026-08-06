import { useCallback, useEffect, useState } from "react";
import type { TaskDiff } from "../../lib/tasks-api";
import { confirmPush, getPushPreview, type PushPreview } from "../../lib/github-push-api";
import { WebDiffViewer } from "./WebDiffViewer";

/**
 * "https://github.com/owner/repo.git" (or .../owner/repo) -> "owner/repo".
 * Mirrors TaskCard.tsx's local `ownerRepo()` helper, which isn't exported
 * from that file — inlined here rather than reaching across components for it.
 */
function ownerRepo(url: string): string {
  const m = url.match(/[:/]([^/]+)\/([^/]+?)(?:\.git)?\/?$/);
  return m ? `${m[1]}/${m[2]}` : url;
}

const fieldBase =
  "w-full px-3 py-2 rounded-lg bg-surface2 border border-border/60 text-sm text-text " +
  "focus:outline-none focus:ring-1 focus:ring-accent2/60 disabled:opacity-50";
const fieldMono = `${fieldBase} font-mono`;

type LoadState = "loading" | "ready" | "blocked" | "error";

/**
 * The gated push/PR confirmation. Visually modeled on DiffReviewModal.tsx's
 * `fixed inset-0 z-50` overlay + header/body/footer structure, but deliberately
 * heavier: a second, distinct color (purple accent2, not the routine teal
 * accent), an explicit warning line, and a confirm button worded and styled
 * so it does not read as equivalent to the routine per-file diff approve.
 * This is a different, unrelated gate from DiffReviewModal's — no state or
 * context is shared with it.
 *
 * Flow: preview (pure computation, issues a short-TTL confirm_token) ->
 * user edits branch/base/title/body -> explicit confirm (actually pushes +
 * opens the PR). A 409 on confirm means the confirm_token went stale
 * (single-use) -> offer a fresh preview. A 502 means the push/PR call itself
 * failed on the backend -> offer a retry, which also goes through a fresh
 * preview since the spent token can't be reused either way.
 */
export function PushPreviewModal({
  coordinationId,
  diff,
  onClose,
  onPushed,
}: {
  coordinationId: string;
  diff: TaskDiff | null;
  onClose: () => void;
  onPushed: (prUrl: string) => void;
}) {
  const [state, setState] = useState<LoadState>("loading");
  const [loadError, setLoadError] = useState("");
  const [preview, setPreview] = useState<PushPreview | null>(null);

  // Editable fields — pre-filled from the preview, but the CURRENT edited
  // values are what get sent on confirm, not necessarily the originals.
  const [branch, setBranch] = useState("");
  const [baseBranch, setBaseBranch] = useState("");
  const [prTitle, setPrTitle] = useState("");
  const [prBody, setPrBody] = useState("");

  const [confirming, setConfirming] = useState(false);
  const [confirmError, setConfirmError] = useState<{ message: string; expired: boolean } | null>(null);

  const fetchPreview = useCallback(async () => {
    setState("loading");
    setLoadError("");
    setConfirmError(null);
    const result = await getPushPreview(coordinationId);
    if ("error" in result) {
      setLoadError(result.error);
      // 404 (push not enabled) and 409 (diff not approved / no pushable branch /
      // no token connected) mean "not available at all" — nothing to retry
      // until the user fixes the underlying thing elsewhere (e.g. Settings).
      setState(result.status === 404 || result.status === 409 ? "blocked" : "error");
      return;
    }
    setPreview(result);
    setBranch(result.branch);
    setBaseBranch(result.base_branch);
    setPrTitle(result.pr_title);
    setPrBody(result.pr_body);
    setState("ready");
  }, [coordinationId]);

  useEffect(() => { fetchPreview(); }, [fetchPreview]);

  const handleConfirm = async () => {
    if (!preview) return;
    setConfirming(true);
    setConfirmError(null);
    const result = await confirmPush(coordinationId, {
      confirm_token: preview.confirm_token,
      branch: branch.trim(),
      pr_title: prTitle.trim(),
      pr_body: prBody,
      base_branch: baseBranch.trim(),
    });
    setConfirming(false);
    if ("error" in result) {
      setConfirmError({ message: result.error, expired: result.status === 409 });
      return;
    }
    onPushed(result.pr_url);
  };

  const repoLabel = preview ? ownerRepo(preview.git_url) : "";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="bg-canvas border-2 border-accent2/50 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">

        {/* Header */}
        <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-border/40 flex-shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="text-lg flex-shrink-0" aria-hidden>⚠️</span>
            <div className="min-w-0">
              <div className="text-sm font-semibold text-text">Push to GitHub</div>
              <div className="text-[11px] text-muted mt-0.5">This leaves Memex and opens a real pull request.</div>
            </div>
          </div>
          <button onClick={onClose} className="text-muted hover:text-text p-1 flex-shrink-0">
            <svg width="14" height="14" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.8">
              <path d="M2 2l8 8M10 2L2 10" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {state === "loading" && (
            <div className="py-8 text-center text-sm text-muted">Preparing push preview…</div>
          )}

          {state === "blocked" && (
            <div className="rounded-lg border border-red-400/30 bg-red-400/10 px-4 py-3 text-sm text-red-400">
              {loadError}
            </div>
          )}

          {state === "error" && (
            <div className="space-y-3">
              <div className="rounded-lg border border-red-400/30 bg-red-400/10 px-4 py-3 text-sm text-red-400">
                {loadError || "Could not load the push preview."}
              </div>
              <button
                onClick={fetchPreview}
                className="text-xs px-3 py-1.5 rounded-lg border border-border/60 text-text hover:bg-surface2/60"
              >
                Try again
              </button>
            </div>
          )}

          {state === "ready" && preview && (
            <>
              <div className="rounded-lg border border-yellow/30 bg-yellow/10 px-4 py-2.5 text-xs text-text/90 leading-relaxed">
                This will push a new branch to <span className="font-mono font-medium">{repoLabel}</span> and
                open a pull request against <span className="font-mono font-medium">{baseBranch}</span>.
              </div>

              <div>
                <div className="text-[10px] text-muted uppercase tracking-wide mb-1.5">Target repo</div>
                <div className="text-xs text-text/80 font-mono px-3 py-2 rounded-lg bg-surface2/50 border border-border/40 truncate">
                  {preview.git_url}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <div className="text-[10px] text-muted uppercase tracking-wide mb-1.5">Base branch</div>
                  <input value={baseBranch} onChange={(e) => setBaseBranch(e.target.value)} disabled={confirming} className={fieldMono} />
                </div>
                <div>
                  <div className="text-[10px] text-muted uppercase tracking-wide mb-1.5">New branch</div>
                  <input value={branch} onChange={(e) => setBranch(e.target.value)} disabled={confirming} className={fieldMono} />
                </div>
              </div>

              <div>
                <div className="text-[10px] text-muted uppercase tracking-wide mb-1.5">PR title</div>
                <input value={prTitle} onChange={(e) => setPrTitle(e.target.value)} disabled={confirming} className={fieldBase} />
              </div>

              <div>
                <div className="text-[10px] text-muted uppercase tracking-wide mb-1.5">PR description</div>
                <textarea
                  value={prBody}
                  onChange={(e) => setPrBody(e.target.value)}
                  disabled={confirming}
                  rows={5}
                  className={`${fieldBase} resize-none`}
                />
              </div>

              <div>
                <div className="text-[10px] text-muted uppercase tracking-wide mb-1.5">
                  Changes{diff?.truncated ? " (truncated)" : ""}
                </div>
                {diff
                  ? <div className="max-h-64 overflow-y-auto"><WebDiffViewer diff={diff.diff_text} /></div>
                  : <div className="text-xs text-muted">No diff available.</div>}
              </div>

              {confirmError && (
                <div className="rounded-lg border border-red-400/30 bg-red-400/10 px-4 py-3 space-y-2">
                  <p className="text-sm text-red-400">{confirmError.message}</p>
                  <button
                    onClick={fetchPreview}
                    className="text-xs px-3 py-1.5 rounded-lg border border-red-400/40 text-red-400 hover:bg-red-400/10"
                  >
                    {confirmError.expired ? "Get a new preview" : "Retry"}
                  </button>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        {state === "ready" && preview && (
          <div className="flex gap-3 px-5 py-4 border-t border-border/40 flex-shrink-0">
            <button
              onClick={onClose}
              disabled={confirming}
              className="flex-1 py-2.5 rounded-xl bg-surface2 border border-border/60 text-sm hover:bg-surface2/80 transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              onClick={handleConfirm}
              disabled={confirming || !branch.trim() || !baseBranch.trim() || !prTitle.trim()}
              className="flex-1 py-2.5 rounded-xl bg-accent2 text-white text-sm font-semibold hover:bg-accent2/80 transition-colors disabled:opacity-50"
            >
              {confirming ? "Pushing…" : "Yes, push to GitHub"}
            </button>
          </div>
        )}

        {(state === "blocked" || state === "error") && (
          <div className="flex-shrink-0 border-t border-border/40 p-4">
            <button
              onClick={onClose}
              className="w-full py-2.5 rounded-xl bg-surface2 border border-border/60 text-sm hover:bg-surface2/80 transition-colors"
            >
              Close
            </button>
          </div>
        )}

      </div>
    </div>
  );
}
