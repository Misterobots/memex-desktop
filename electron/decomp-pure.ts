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

/** wsl.exe answers in UTF-16 unless WSL_UTF8=1; accept either. */
export function decodeWslOutput(raw: Uint8Array): string {
  const buf = Buffer.from(raw);
  const utf16 = buf.subarray(0, 200).includes(0);
  return (utf16 ? buf.toString("utf16le") : buf.toString("utf8")).replace(/\0/g, "").replace(/^\uFEFF/, "");
}

/** C:\Users\me\x -> /mnt/c/Users/me/x, how WSL reads a Windows folder. Null for paths not on a drive letter. */
export function toWslPath(windowsPath: string): string | null {
  const m = /^([A-Za-z]):[\\/]?(.*)$/.exec(windowsPath);
  return m ? `/mnt/${m[1].toLowerCase()}/${m[2].replace(/\\/g, "/")}` : null;
}

/** Linux reads shell scripts with LF line ends. */
export function toLf(text: string): string {
  return text.replace(/\r\n/g, "\n");
}

/** The step that runs decomp.wtf's own installer inside its distro (identical to the official run-install.sh). */
export const RUN_INSTALL_SCRIPT = '#!/bin/sh\nexport DECOMP_SOURCE="$(cat ./source.txt)"\nexec bash ./install.sh --no-start\n';

export interface DebianImage { url: string; sha256: string }

/** Microsoft's DistributionInfo.json -> the x64 Debian WSL image and its checksum (null if absent or malformed). */
export function pickDebianImage(info: unknown): DebianImage | null {
  const list = (info as { ModernDistributions?: { Debian?: unknown } } | null)?.ModernDistributions?.Debian;
  if (!Array.isArray(list)) return null;
  const entry = list.find((d) => d && typeof d === "object" && (d as { Name?: unknown }).Name === "Debian") as
    { Amd64Url?: { Url?: unknown; Sha256?: unknown } } | undefined;
  const url = entry?.Amd64Url?.Url, sha256 = entry?.Amd64Url?.Sha256;
  if (typeof url !== "string" || typeof sha256 !== "string" || !/^https:\/\//i.test(url) || !/^[0-9a-f]{64}$/i.test(sha256)) return null;
  return { url, sha256: sha256.toLowerCase() };
}

export type DecompSetupResult =
  | { status: "ok" }
  | { status: "restart-required"; message: string }
  | { status: "unsupported"; message: string }
  | { status: "error"; message: string };

/** Where the setup downloads decomp.wtf's own Linux-side scripts from (the same place install.ps1 uses). */
export const DECOMP_WEB = "https://decomp.wtf";
export const DECOMP_SETUP_SCRIPTS = ["linux-base.sh", "install.sh"] as const;
