/**
 * Windows setup for decomp.wtf, performed by Memex: the same steps as decomp.wtf's
 * own install.ps1 (https://decomp.wtf/install.ps1), minus the Windows shortcuts and
 * `decomp.cmd` shim Memex does not need because it calls wsl.exe directly.
 *
 *   1. WSL 2 present (elevated `wsl --install --no-distribution`; may need a restart)
 *   2. the `decomp-wtf` distro, imported from Microsoft's listed Debian image after a
 *      SHA-256 check (fallback: WSL's own `--install Debian`)
 *   3. decomp.wtf's own linux-base.sh (as root) and install.sh (as user `decomp`) run inside it
 *
 * Nothing here runs unless the user confirmed in the Decomp pane.
 */
import { execFile, spawn } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { createWriteStream } from "node:fs";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import {
  DECOMP_SETUP_SCRIPTS, DECOMP_WEB, DECOMP_WSL_DISTRO, RUN_INSTALL_SCRIPT, decodeWslOutput, pickDebianImage,
  toLf, toWslPath, wslListHasDecomp, type DecompSetupResult,
} from "./decomp-pure";

const UA = "memex-desktop-decomp-setup (+https://github.com/Misterobots/memex-desktop)";
const DISTRIBUTION_INFO = "https://raw.githubusercontent.com/microsoft/WSL/master/distributions/DistributionInfo.json";
const WSL_ENV = { ...process.env, WSL_UTF8: "1" };

let running = false;

function wsl(args: string[], opts: { timeoutMs?: number; onLine?: (line: string) => void } = {}): Promise<{ code: number; output: string }> {
  return new Promise((resolve) => {
    const child = spawn("wsl.exe", args, { windowsHide: true, env: WSL_ENV, stdio: ["ignore", "pipe", "pipe"] });
    const chunks: Buffer[] = [];
    let pending = "";
    const feed = (d: Buffer) => {
      chunks.push(d);
      if (!opts.onLine) return;
      pending += decodeWslOutput(d);
      const lines = pending.split(/\r?\n/);
      pending = lines.pop() ?? "";
      for (const l of lines) if (l.trim()) opts.onLine(l);
    };
    child.stdout.on("data", feed);
    child.stderr.on("data", feed);
    const timer = opts.timeoutMs ? setTimeout(() => child.kill(), opts.timeoutMs) : null;
    child.on("error", () => { if (timer) clearTimeout(timer); resolve({ code: -1, output: "" }); });
    child.on("close", (code) => {
      if (timer) clearTimeout(timer);
      if (pending.trim()) opts.onLine?.(pending);
      resolve({ code: code ?? -1, output: decodeWslOutput(Buffer.concat(chunks)).trim() });
    });
  });
}

async function distroPresent(): Promise<boolean> {
  const r = await wsl(["--list", "--quiet"], { timeoutMs: 30_000 });
  return r.code === 0 && wslListHasDecomp(r.output);
}

function elevatedWslInstall(): Promise<number> {
  return new Promise((resolve) => {
    const ps = "$p = Start-Process -FilePath wsl.exe -ArgumentList '--install','--no-distribution' -Verb RunAs -Wait -PassThru; exit $p.ExitCode";
    execFile("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", ps], { windowsHide: true }, (err) => {
      resolve(err ? ((err as { code?: number }).code ?? 1) : 0);
    });
  });
}

async function download(url: string, dest: string): Promise<string> {
  const res = await fetch(url, { headers: { "User-Agent": UA } });
  if (!res.ok || !res.body) throw new Error(`download failed (${res.status}) for ${new URL(url).host}`);
  const hash = createHash("sha256");
  const out = createWriteStream(dest);
  const source = Readable.fromWeb(res.body as never);
  source.on("data", (c: Buffer) => hash.update(c));
  await pipeline(source, out);
  return hash.digest("hex");
}

/** Run the full setup. `log` receives short progress lines for the Decomp pane. */
export async function setupDecomp(log: (line: string) => void): Promise<DecompSetupResult> {
  if (process.platform !== "win32") {
    return { status: "unsupported", message: "Guided setup is available on Windows (WSL 2). On macOS and Linux, use decomp.wtf's installer from decomp.wtf." };
  }
  if (running) return { status: "error", message: "Setup is already running." };
  running = true;
  const tmp = path.join(tmpdir(), `memex-decomp-${randomBytes(4).toString("hex")}`);
  try {
    if (process.arch !== "x64" && process.env.PROCESSOR_ARCHITEW6432 !== "AMD64") {
      return { status: "unsupported", message: "decomp.wtf needs a 64-bit Intel or AMD Windows for now (the old compilers are x86 programs)." };
    }
    const base = path.join(process.env.LOCALAPPDATA ?? path.join(homedir(), "AppData", "Local"), "decomp.wtf");

    log("Checking WSL 2…");
    if ((await wsl(["--version"], { timeoutMs: 30_000 })).code !== 0) {
      log("Turning on WSL 2 (Windows will ask for permission)…");
      const exit = await elevatedWslInstall();
      if ((await wsl(["--version"], { timeoutMs: 30_000 })).code !== 0) {
        return exit !== 0
          ? { status: "error", message: `Turning on WSL 2 didn't work (exit code ${exit}). Run "wsl --install --no-distribution" in an administrator PowerShell, restart Windows, then try again.` }
          : { status: "restart-required", message: "WSL 2 is turned on. Restart Windows to finish, then run setup again." };
      }
    }

    if (!(await distroPresent())) {
      log("Making decomp.wtf's Linux (Debian)…");
      await mkdir(base, { recursive: true });
      let made = false;
      try {
        const info = await (await fetch(DISTRIBUTION_INFO, { headers: { "User-Agent": UA } })).json();
        const image = pickDebianImage(info);
        if (image) {
          const file = path.join(base, "debian.tar.gz");
          const sum = await download(image.url, file);
          if (sum === image.sha256) {
            made = (await wsl(["--import", DECOMP_WSL_DISTRO, path.join(base, "wsl"), file, "--version", "2"], { onLine: log })).code === 0;
          } else {
            log("The downloaded Debian image isn't the one Microsoft lists; using WSL's own download instead.");
          }
          await rm(file, { force: true });
        }
      } catch (e) {
        log(`Couldn't get Debian's WSL image (${e instanceof Error ? e.message : "error"}); using WSL's own download instead.`);
      }
      if (!made) {
        await wsl(["--install", "Debian", "--name", DECOMP_WSL_DISTRO, "--location", path.join(base, "wsl"), "--no-launch"], { onLine: log });
        made = await distroPresent();
      }
      if (!made) {
        return { status: "error", message: "WSL couldn't make decomp.wtf's Linux. WSL 2 needs virtualization: check it's on in your PC's BIOS/UEFI and that Windows' 'Virtual Machine Platform' feature is on, then try again." };
      }
    }

    await mkdir(tmp, { recursive: true });
    for (const name of DECOMP_SETUP_SCRIPTS) {
      const res = await fetch(`${DECOMP_WEB}/${name}`, { headers: { "User-Agent": UA } });
      if (!res.ok) throw new Error(`couldn't download ${name} from ${new URL(DECOMP_WEB).host} (${res.status})`);
      await writeFile(path.join(tmp, name), toLf(await res.text()), "utf8");
    }
    await writeFile(path.join(tmp, "run-install.sh"), RUN_INSTALL_SCRIPT, "utf8");
    await writeFile(path.join(tmp, "source.txt"), "release\n", "utf8");
    const linuxTmp = toWslPath(tmp);
    if (!linuxTmp) throw new Error("decomp.wtf's Linux can't reach the temporary folder (it must be on a drive like C:\\).");

    log("Preparing decomp.wtf's Linux (system packages, a few minutes the first time)…");
    if ((await wsl(["-d", DECOMP_WSL_DISTRO, "-u", "root", "--cd", linuxTmp, "--exec", "sh", "./linux-base.sh", "wsl"], { onLine: log })).code !== 0) {
      return { status: "error", message: "Preparing decomp.wtf's Linux failed (see the log above)." };
    }
    await wsl(["--terminate", DECOMP_WSL_DISTRO]); // its user/PATH settings apply from the next start
    await wsl(["-d", DECOMP_WSL_DISTRO, "-u", "decomp", "--cd", "~", "--exec", "/usr/local/bin/decomp", "stop"], { timeoutMs: 60_000 });

    log("Installing decomp.wtf (compilers and tools)…");
    if ((await wsl(["-d", DECOMP_WSL_DISTRO, "-u", "decomp", "--cd", linuxTmp, "--exec", "sh", "./run-install.sh"], { onLine: log })).code !== 0) {
      return { status: "error", message: "Installing decomp.wtf failed (see the log above)." };
    }
    log("decomp.wtf is installed.");
    return { status: "ok" };
  } catch (e) {
    return { status: "error", message: e instanceof Error ? e.message : "Setup failed." };
  } finally {
    running = false;
    void rm(tmp, { recursive: true, force: true }).catch(() => undefined);
  }
}

