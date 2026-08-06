import { useEffect, useState } from "react";
import { connectGithubPush, disconnectGithubPush, getGithubPushStatus } from "../../lib/github-push-api";

/**
 * Settings section for the fine-grained GitHub PAT used to open pull requests
 * from completed Tasks. Structurally separate from any other GitHub
 * connection — this token is never used for chat/LLM auth, only for the
 * gated push/PR flow.
 */
export function GitHubPushConnect() {
  const [status, setStatus] = useState<"loading" | "disconnected" | "connecting" | "connected">("loading");
  const [username, setUsername] = useState<string | undefined>();
  const [token, setToken] = useState("");
  const [error, setError] = useState("");
  const [disconnecting, setDisconnecting] = useState(false);

  const load = async () => {
    const s = await getGithubPushStatus();
    if (s.connected) {
      setStatus("connected");
      setUsername(s.github_username);
    } else {
      setStatus("disconnected");
      setUsername(undefined);
    }
  };

  useEffect(() => { load(); }, []);

  const handleConnect = async () => {
    if (!token.trim()) { setError("Paste a token first"); return; }
    setError("");
    setStatus("connecting");
    const result = await connectGithubPush(token.trim());
    if (result.connected) {
      setToken("");
      setStatus("connected");
      setUsername(result.github_username);
    } else {
      setStatus("disconnected");
      setError(result.error || "Connection failed");
    }
  };

  const handleDisconnect = async () => {
    setDisconnecting(true);
    const ok = await disconnectGithubPush();
    setDisconnecting(false);
    if (ok) {
      setStatus("disconnected");
      setUsername(undefined);
    } else {
      setError("Disconnect failed");
    }
  };

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted">
        Used to open pull requests from completed Tasks. Separate from any other GitHub connection.
        Paste a{" "}
        <a
          href="https://github.com/settings/personal-access-tokens/new"
          target="_blank"
          rel="noreferrer"
          className="text-accent hover:text-accent/80 underline"
        >
          fine-grained personal access token
        </a>{" "}
        scoped to the specific repo(s) you want Tasks to push branches and open PRs against.
      </p>

      {status === "loading" && <p className="text-xs text-muted">Checking connection…</p>}

      {status === "connected" && (
        <div className="flex items-center justify-between gap-3 px-3 py-2 rounded-lg border border-border/40 bg-surface2/30">
          <span className="flex items-center gap-2 text-sm">
            <span className="w-2 h-2 rounded-full bg-green" />
            <span className="text-text">
              Connected as <span className="font-medium">{username}</span>
            </span>
          </span>
          <button
            onClick={handleDisconnect}
            disabled={disconnecting}
            className="text-xs px-2 py-1 rounded-lg border border-border/60 text-red-400 hover:text-red-300 disabled:opacity-40"
          >
            {disconnecting ? "Disconnecting…" : "Disconnect"}
          </button>
        </div>
      )}

      {(status === "disconnected" || status === "connecting") && (
        <div className="space-y-2">
          <div className="flex gap-2">
            <input
              type="password"
              value={token}
              onChange={(e) => { setToken(e.target.value); setError(""); }}
              placeholder="github_pat_…"
              autoComplete="off"
              disabled={status === "connecting"}
              className={`flex-1 px-3 py-1.5 rounded-lg bg-surface2 border text-sm text-text font-mono
                focus:outline-none focus:ring-1 focus:ring-accent/60 disabled:opacity-60
                ${error ? "border-red-500/60" : "border-border/60"}`}
            />
            <button
              onClick={handleConnect}
              disabled={status === "connecting"}
              className="px-3 py-1.5 rounded-lg bg-accent text-white text-sm hover:bg-accent/80 disabled:opacity-40 flex-shrink-0"
            >
              {status === "connecting" ? "Connecting…" : "Connect"}
            </button>
          </div>
          {error && <p className="text-xs text-red-400">{error}</p>}
        </div>
      )}
    </div>
  );
}
