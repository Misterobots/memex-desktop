/**
 * OpenSCAD invocation + output verification. All fs-free/child_process-free
 * logic (argument building, STL parsing) lives in ./openscad-pure.ts and is
 * re-exported here for callers -- keep it there, not duplicated here, so
 * electron/__tests__/openscad-runner.test.ts can import the real logic
 * without tripping this repo's Vite renderer-shim issue on Node builtins.
 * This file is the thin orchestration layer that actually touches the
 * filesystem and spawns the real openscad.exe process; see IpcContext /
 * ipc-handlers.ts's openscad:render / openscad:export handlers for how it's
 * wired up and firewall-gated.
 *
 * Deliberate deviation from the shell:exec template this is otherwise
 * modeled on: shell:exec uses execAsync with a fixed 30s timeout, which is
 * correct for generic one-shot commands but would kill a real OpenSCAD
 * render before it finishes -- a full assembly-level render with --render
 * (forcing full CGAL boolean evaluation) has taken 5-20+ minutes in practice
 * on non-trivial .scad files. This module uses spawn() with a much longer,
 * caller-overridable default timeout instead of exec()'s buffered/short-lived
 * model, and reports elapsed time so slow renders are visible, not silently
 * truncated.
 */
import { spawn } from "child_process";
import { access, stat } from "fs/promises";
import { constants as fsConstants } from "fs";
import {
  buildArgs,
  parseStlContent,
  parseWarnings,
  inferManifold,
  type RenderParams,
  type GeometryInfo,
  type OpenScadResult,
  type OpenScadFormat,
} from "./openscad-pure";

export {
  buildArgs, parseStlContent, parseWarnings, inferManifold,
  type RenderParams, type GeometryInfo, type OpenScadResult, type OpenScadFormat,
};

export const DEFAULT_OPENSCAD_BIN = "C:\\Program Files (x86)\\OpenSCAD\\openscad.exe";
export const DEFAULT_RENDER_TIMEOUT_MS = 15 * 60 * 1000; // 15 min -- generous, see file header

export async function assertBinaryExists(bin: string): Promise<void> {
  try {
    await access(bin, fsConstants.F_OK);
  } catch {
    throw new Error(
      `OpenSCAD not found at "${bin}". Verify the install location or pass openscadBin explicitly.`,
    );
  }
}

/** fs-touching wrapper around parseStlContent() (from openscad-pure.ts) --
 *  this is what runOpenScad() actually calls. Not unit-tested directly since
 *  it's a thin file-read + try/catch -> null around already-tested pure
 *  logic; see openscad-pure.ts's own header comment for why the parsing
 *  logic itself lives there instead of here. */
export async function parseStlGeometry(stlPath: string): Promise<GeometryInfo | null> {
  let content: string;
  try {
    const { readFile } = await import("fs/promises");
    content = await readFile(stlPath, "utf-8");
  } catch {
    return null;
  }
  return parseStlContent(content);
}

/** Runs OpenSCAD once and returns a structured result -- never throws for
 *  expected failure modes (missing binary, bad .scad syntax, non-zero exit),
 *  matching this codebase's IPC convention of returning `{ ok, ... }` rather
 *  than rejecting across the ipcMain.handle boundary. Only truly unexpected
 *  errors (e.g. spawn() itself failing to start a process) propagate. */
export async function runOpenScad(params: RenderParams): Promise<OpenScadResult> {
  const bin = params.openscadBin ?? DEFAULT_OPENSCAD_BIN;
  const timeoutMs = params.timeoutMs ?? DEFAULT_RENDER_TIMEOUT_MS;
  const startedAt = Date.now();

  try {
    await assertBinaryExists(bin);
  } catch (err: any) {
    return { ok: false, stdout: "", stderr: err.message, code: null, warnings: [], durationMs: Date.now() - startedAt };
  }

  const args = buildArgs(params);

  const result = await new Promise<{ stdout: string; stderr: string; code: number | null; timedOut: boolean }>((resolve) => {
    const child = spawn(bin, args, { windowsHide: true });
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill();
    }, timeoutMs);

    child.stdout.on("data", (d) => { stdout += d.toString(); });
    child.stderr.on("data", (d) => { stderr += d.toString(); });
    child.on("error", (err) => {
      clearTimeout(timer);
      resolve({ stdout, stderr: stderr + `\n[spawn error] ${err.message}`, code: null, timedOut: false });
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ stdout, stderr, code, timedOut });
    });
  });

  const durationMs = Date.now() - startedAt;
  const warnings = parseWarnings(result.stderr);
  if (result.timedOut) {
    warnings.push(`Render exceeded ${timeoutMs}ms timeout and was killed -- consider raising timeoutMs for large assemblies.`);
  }

  const ok = result.code === 0 && !result.timedOut;
  let outputExists = false;
  if (ok) {
    try { await stat(params.outputPath); outputExists = true; } catch { outputExists = false; }
  }

  let geometry: GeometryInfo | undefined;
  if (ok && outputExists && params.format === "stl") {
    const parsed = await parseStlGeometry(params.outputPath);
    if (parsed) {
      geometry = { ...parsed, manifold: inferManifold(result.stderr, result.code) };
    }
  }

  return {
    ok: ok && outputExists,
    outputPath: ok && outputExists ? params.outputPath : undefined,
    stdout: result.stdout,
    stderr: result.stderr,
    code: result.code,
    warnings,
    geometry,
    durationMs,
  };
}
