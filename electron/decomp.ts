/**
 * decomp.wtf integration (https://github.com/i12bp8/decomp.wtf).
 *
 * decomp.wtf is a separately installed local app (its Linux toolchain runs in
 * WSL 2 on Windows and Docker on macOS).  Memex does not vendor or install it:
 * it drives decomp.wtf (on Windows through wsl.exe into its `decomp-wtf` distro, as decomp's own shim does) and shows the loopback web UI that
 * `decomp url` prints in the sandboxed Browser pane.
 */
import { execFile } from "node:child_process";
import { decompInvocation, parseDecompUrl, redactSecrets, wslListHasDecomp } from "./decomp-pure";

export const DECOMP_INSTALL_PAGE = "https://decomp.wtf";
export const DECOMP_MCP_COMMAND = "claude mcp add decomp -- decomp mcp";

export type DecompStartResult =
  | { status: "ready"; url: string }
  | { status: "missing" }
  | { status: "error"; message: string };

export interface DecompCommandResult {
  status: "ok" | "missing" | "error";
  output: string;
}

/** Windows only: is the `decomp-wtf` WSL distribution registered? (wsl.exe missing counts as no.) */
function windowsDistroPresent(): Promise<boolean> {
  return new Promise((resolve) => {
    execFile("wsl.exe", ["-l", "-q"], { timeout: 20_000, windowsHide: true, encoding: "buffer" }, (err, stdout) => {
      resolve(!err && wslListHasDecomp(Buffer.from(stdout).toString("utf16le")));
    });
  });
}

async function run(args: string[], timeoutMs: number): Promise<DecompCommandResult> {
  if (process.platform === "win32" && !(await windowsDistroPresent())) return { status: "missing", output: "" };
  const cmd = decompInvocation(process.platform, args);
  return new Promise((resolve) => {
    execFile(cmd.file, cmd.args, { timeout: timeoutMs, windowsHide: true, maxBuffer: 1024 * 1024 }, (err, stdout, stderr) => {
      const output = `${stdout ?? ""}${stderr ? `\n${stderr}` : ""}`.trim();
      if (!err) return resolve({ status: "ok", output });
      if ((err as NodeJS.ErrnoException).code === "ENOENT") return resolve({ status: "missing", output: "" });
      resolve({ status: "error", output: output || err.message });
    });
  });
}

/** Detect the CLI and start (or reuse) the app; `decomp url` prints the address. */
export async function startDecomp(timeoutMs = 90_000): Promise<DecompStartResult> {
  const result = await run(["url"], timeoutMs);
  if (result.status === "missing") return { status: "missing" };
  if (result.status === "error") return { status: "error", message: "decomp.wtf did not start. " + redactSecrets(result.output).slice(-400) };
  const url = parseDecompUrl(result.output);
  return url ? { status: "ready", url } : { status: "error", message: "decomp.wtf did not return a local address." };
}

/** `decomp connect` wires decomp.wtf's tools into Claude Code, Codex, Antigravity CLI and opencode. */
export async function connectDecompAgents(listOnly: boolean): Promise<DecompCommandResult> {
  const result = await run(listOnly ? ["connect", "--list"] : ["connect"], 60_000);
  return { ...result, output: redactSecrets(result.output) };
}
