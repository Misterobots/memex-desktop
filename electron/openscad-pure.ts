/**
 * Pure OpenSCAD argument-building and STL-parsing logic, with ZERO Node
 * builtin imports (no fs, no child_process, no os, no path) at module scope.
 *
 * Why this file exists separately from openscad-runner.ts: this repo's Vite
 * config shims Node builtins for the renderer context, and vitest breaks
 * ("require is not defined in ES module scope") for any test file that even
 * transitively imports a module with a *top-level* `import ... from "fs"` /
 * "child_process" -- not just one that calls those APIs. Simply re-exporting
 * a single fs-free function from openscad-runner.ts doesn't help, because
 * the whole module (including its own top-level `import { spawn } from
 * "child_process"`) still gets evaluated on import. electron/__tests__/
 * lsp-parser.test.ts hits the same constraint and works around it by
 * re-implementing its parser inline in the test; this file instead gives
 * the pure logic a real, importable home so openscad-runner.test.ts can
 * import the actual implementation rather than a hand-kept-in-sync copy.
 *
 * openscad-runner.ts imports FROM this file (buildArgs, parseStlContent),
 * never the other way around -- keep it that way, or this file stops being
 * safely importable from tests again.
 */

export type OpenScadFormat = "png" | "stl" | "3mf" | "off";

export interface RenderParams {
  scadPath: string;
  outputPath: string;
  part?: string;
  vars?: Record<string, string | number | boolean>;
  format: OpenScadFormat;
  /** Force full CGAL evaluation (--render). Defaults to true for stl/3mf/off,
   *  false for png (a preview render doesn't need it and is much faster). */
  fullRender?: boolean;
  timeoutMs?: number;
  openscadBin?: string;
}

export interface GeometryInfo {
  boundingBox: { min: [number, number, number]; max: [number, number, number] };
  triangleCount: number;
  vertexCount: number;
  /** Best-effort: true unless OpenSCAD's own stderr flagged non-manifold
   *  geometry. A missing/ambiguous signal is reported as null, not coerced
   *  to true -- callers should treat null as "unverified", not "passed". */
  manifold: boolean | null;
}

export interface OpenScadResult {
  ok: boolean;
  outputPath?: string;
  stdout: string;
  stderr: string;
  code: number | null;
  warnings: string[];
  geometry?: GeometryInfo;
  durationMs: number;
}

export function escapeScadString(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

export function formatScadValue(v: string | number | boolean): string {
  if (typeof v === "string") return `"${escapeScadString(v)}"`;
  return String(v);
}

export function buildArgs(params: RenderParams): string[] {
  const args: string[] = [];
  const wantsFullRender = params.fullRender ?? params.format !== "png";
  if (wantsFullRender) args.push("--render");

  if (params.part !== undefined) {
    args.push("-D", `part="${escapeScadString(params.part)}"`);
  }
  for (const [key, value] of Object.entries(params.vars ?? {})) {
    args.push("-D", `${key}=${formatScadValue(value)}`);
  }

  if (params.format === "3mf") {
    args.push("--export-format", "3mf");
  }

  args.push("-o", params.outputPath);
  args.push(params.scadPath);
  return args;
}

/** Parses OpenSCAD's own stderr for the specific lines it emits on a bad
 *  render, so callers get a structured warnings list instead of raw text. */
export function parseWarnings(stderr: string): string[] {
  const lines = stderr.split(/\r?\n/);
  return lines.filter((l) =>
    /warning|non-manifold|not.*2-manifold|WARNING|ERROR/i.test(l) && l.trim().length > 0);
}

export function inferManifold(stderr: string, code: number | null): boolean | null {
  if (code !== 0) return null; // a failed render can't claim anything about manifoldness
  if (/not a valid 2-manifold|non-manifold/i.test(stderr)) return false;
  if (/Simple:\s*yes/i.test(stderr)) return true;
  return null; // no explicit signal either way -- report unverified, don't guess
}

/** ASCII-STL parser -- ports the same approach used by hand throughout this
 *  project's chassis.scad verification work (a Python regex-based vertex
 *  scan) to TypeScript. Binary STL is not handled here; OpenSCAD's default
 *  `-o out.stl` output is ASCII, matching what every prior manual
 *  verification pass in this project has assumed and relied on. */
export function parseStlContent(content: string): GeometryInfo | null {
  if (!content.trimStart().startsWith("solid")) {
    return null; // binary STL -- not parsed, caller gets geometry: undefined rather than wrong data
  }

  const vertexRe = /vertex\s+([-\d.eE]+)\s+([-\d.eE]+)\s+([-\d.eE]+)/g;
  let match: RegExpExecArray | null;
  let count = 0;
  let minX = Infinity, minY = Infinity, minZ = Infinity;
  let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
  while ((match = vertexRe.exec(content)) !== null) {
    const x = parseFloat(match[1]), y = parseFloat(match[2]), z = parseFloat(match[3]);
    if (x < minX) minX = x; if (x > maxX) maxX = x;
    if (y < minY) minY = y; if (y > maxY) maxY = y;
    if (z < minZ) minZ = z; if (z > maxZ) maxZ = z;
    count++;
  }
  if (count === 0) return null;

  return {
    boundingBox: { min: [minX, minY, minZ], max: [maxX, maxY, maxZ] },
    vertexCount: count,
    triangleCount: Math.floor(count / 3),
    manifold: null, // ASCII-STL alone can't confirm this; rely on stderr's "Simple: yes" via inferManifold
  };
}
