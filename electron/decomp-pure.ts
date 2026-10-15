/** Pure helpers for the decomp.wtf integration (no Node/Electron imports, so they are unit-testable). */

/**
 * The only address Memex will load for decomp.wtf: its own loopback server,
 * `http://127.0.0.1:<port>/?k=<secret>`.  Anything else on stdout (warnings,
 * progress, a hostile `decomp` shim) is rejected rather than navigated to.
 */
export function parseDecompUrl(stdout: string): string | null {
  for (const line of stdout.split(/\r?\n/).map((l) => l.trim()).reverse()) {
    if (!line) continue;
    let parsed: URL;
    try { parsed = new URL(line); } catch { continue; }
    const port = Number(parsed.port);
    if (
      parsed.protocol === "http:" && parsed.hostname === "127.0.0.1" &&
      Number.isInteger(port) && port > 0 && port < 65536 &&
      parsed.pathname === "/" && /^[A-Za-z0-9_-]{8,}$/.test(parsed.searchParams.get("k") ?? "") &&
      !parsed.username && !parsed.password && !parsed.hash
    ) return parsed.toString();
  }
  return null;
}

/** Strip the per-session secret from anything shown to the user or put in an error. */
export function redactSecrets(text: string): string {
  return text.replace(/([?&]k=)[A-Za-z0-9_-]+/g, "$1…");
}

export const DECOMP_WSL_DISTRO = "decomp-wtf";
export const DECOMP_WSL_BINARY = "/usr/local/bin/decomp";

/**
 * How to run `decomp <args>`.  On Windows decomp.wtf is a WSL 2 distribution
 * (`decomp-wtf`); its own `decomp.cmd` shim just calls wsl.exe like this, so
 * Memex does the same instead of relying on that shim being on Electron's PATH.
 * Elsewhere (Linux, macOS where the installer provides a `decomp` command) it is the plain command.
 */
export function decompInvocation(platform: NodeJS.Platform, args: string[]): { file: string; args: string[] } {
  return platform === "win32"
    ? { file: "wsl.exe", args: ["-d", DECOMP_WSL_DISTRO, "--cd", "~", "--exec", DECOMP_WSL_BINARY, ...args] }
    : { file: "decomp", args };
}

/** `wsl -l -q` prints UTF-16 with NULs and sometimes a BOM; true when the decomp.wtf distro is registered. */
export function wslListHasDecomp(output: string): boolean {
  return output.replace(/\0/g, "").replace(/^﻿/, "").split(/\r?\n/).some((l) => l.trim().replace(/ \(Default\)$/, "") === DECOMP_WSL_DISTRO);
}
