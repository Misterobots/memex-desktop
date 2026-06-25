/**
 * Chrome Extension Native Messaging Bridge
 *
 * Mirrors Claude Desktop's pattern:
 * 1. Register a native messaging host manifest in Chrome/Edge/Brave profile dirs
 * 2. Listen on a named pipe for JSON-RPC messages from the extension
 * 3. Relay to the Memex WebContentsView via IPC
 *
 * The companion extension sends browser context (page text, DOM, tabs)
 * and can receive commands (navigate, execute script, etc.).
 *
 * Protocol: 4-byte Little-Endian length prefix + UTF-8 JSON payload
 * (standard Chrome native messaging wire format)
 */

import { net, app }    from "electron";
import { createServer, Server, Socket } from "net";
import { writeFileSync, mkdirSync }     from "fs";
import { join }                         from "path";

// Extension IDs to allow (add your packed extension ID here)
const ALLOWED_EXTENSION_IDS = [
  // Add your Chrome extension ID after packing
];

const PIPE_NAME = process.platform === "win32"
  ? `\\\\.\\pipe\\memex-browser-bridge-${process.env.USERNAME ?? "user"}`
  : `/tmp/memex-browser-bridge-${process.env.USER ?? "user"}.sock`;

// ---------------------------------------------------------------------------
// Manifest registration
// ---------------------------------------------------------------------------
export function registerNativeHost(): void {
  if (process.platform !== "win32" && process.platform !== "darwin" && process.platform !== "linux") return;

  const manifest = {
    name:           "com.memex.browser_bridge",
    description:    "Memex Desktop browser bridge",
    path:           process.execPath,
    type:           "stdio",
    allowed_origins: ALLOWED_EXTENSION_IDS.map((id) => `chrome-extension://${id}/`),
  };

  const manifestPath = getManifestPath();
  if (!manifestPath) return;

  try {
    mkdirSync(join(manifestPath, ".."), { recursive: true });
    writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), "utf-8");

    if (process.platform === "win32") {
      // Register in Chrome/Edge registry — best-effort
      const { execSync } = require("child_process");
      const regKey = `HKCU\\SOFTWARE\\Google\\Chrome\\NativeMessagingHosts\\com.memex.browser_bridge`;
      try { execSync(`reg add "${regKey}" /ve /t REG_SZ /d "${manifestPath}" /f`); } catch {}
    }
  } catch {}
}

function getManifestPath(): string | null {
  const userData = app.getPath("userData");
  return join(userData, "native-host", "com.memex.browser_bridge.json");
}

// ---------------------------------------------------------------------------
// IPC pipe server
// ---------------------------------------------------------------------------
export class BrowserBridge {
  private server:  Server  | null = null;
  private sockets: Set<Socket> = new Set();
  private onMessage: ((msg: Record<string, unknown>) => void) | null = null;

  start(handler: (msg: Record<string, unknown>) => void): void {
    this.onMessage = handler;
    this.server = createServer((socket) => this.handleSocket(socket));
    this.server.listen(PIPE_NAME, () => {});
    this.server.on("error", () => {}); // pipe already held — ignore
  }

  private handleSocket(socket: Socket): void {
    this.sockets.add(socket);
    let buf = Buffer.alloc(0);

    socket.on("data", (chunk) => {
      buf = Buffer.concat([buf, chunk]);
      while (buf.length >= 4) {
        const len = buf.readUInt32LE(0);
        if (buf.length < 4 + len) break;
        try {
          const msg = JSON.parse(buf.slice(4, 4 + len).toString("utf8"));
          this.onMessage?.(msg);
        } catch {}
        buf = buf.slice(4 + len);
      }
    });

    socket.on("close", () => this.sockets.delete(socket));
    socket.on("error", () => this.sockets.delete(socket));
  }

  /** Send a command to the browser extension */
  send(msg: Record<string, unknown>): void {
    const body = Buffer.from(JSON.stringify(msg), "utf8");
    const header = Buffer.alloc(4);
    header.writeUInt32LE(body.length, 0);
    const packet = Buffer.concat([header, body]);
    for (const socket of this.sockets) {
      try { socket.write(packet); } catch {}
    }
  }

  stop(): void {
    for (const socket of this.sockets) try { socket.destroy(); } catch {}
    this.server?.close();
    this.sockets.clear();
  }
}
