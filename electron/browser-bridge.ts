/**
 * Chrome Extension Native Messaging Bridge — hardened contract.
 *
 * Wire format: 4-byte Little-Endian length prefix + UTF-8 JSON payload
 * (standard Chrome native messaging wire format, RFC-4122 + LE framing).
 *
 * Handshake protocol:
 *   1. Client (extension) sends:
 *      { "type": "handshake", "extensionId": "<32-char id>", "protocolVersion": 1 }
 *   2. Server validates extensionId against the configured allowlist.
 *   3. If allowed → { "type": "handshake_ok", "desktopVersion": "x.y.z", "protocolVersion": 1 }
 *   4. If rejected → { "type": "handshake_rejected", "reason": "..." } + socket destroyed.
 *   5. All subsequent messages are relayed to the renderer (browser:message IPC).
 *
 * Extension IDs must be 32 lowercase letters (Chrome packed extension format).
 * Connections with empty or unknown extension IDs are rejected after the handshake.
 */

import { app }                              from "electron";
import { createServer, Server, Socket }     from "net";
import { writeFileSync, mkdirSync }         from "fs";
import { join }                             from "path";

const PROTOCOL_VERSION = 1;
const HANDSHAKE_TIMEOUT_MS = 5_000; // reject if no handshake within 5s

const PIPE_NAME = process.platform === "win32"
  ? `\\\\.\\pipe\\memex-browser-bridge-${process.env.USERNAME ?? "user"}`
  : `/tmp/memex-browser-bridge-${process.env.USER ?? "user"}.sock`;

// Injected at runtime from ConfigStore so the bridge stays in sync
let _allowedIds: Set<string> = new Set();

export function setBridgeAllowedIds(ids: string[]): void {
  _allowedIds = new Set(ids.filter((id) => /^[a-z]{32}$/.test(id)));
}

// ---------------------------------------------------------------------------
// Framing helpers (Chrome native messaging: 4-byte LE length prefix)
// ---------------------------------------------------------------------------
function encode(obj: unknown): Buffer {
  const body   = Buffer.from(JSON.stringify(obj), "utf8");
  const header = Buffer.alloc(4);
  header.writeUInt32LE(body.length, 0);
  return Buffer.concat([header, body]);
}

function* parseFrames(buf: Buffer): Generator<[unknown, number]> {
  let offset = 0;
  while (buf.length - offset >= 4) {
    const len = buf.readUInt32LE(offset);
    if (len > 4 * 1024 * 1024) break; // 4 MB safety cap
    if (buf.length - offset < 4 + len) break;
    try { yield [JSON.parse(buf.slice(offset + 4, offset + 4 + len).toString("utf8")), offset + 4 + len]; }
    catch { yield [null, offset + 4 + len]; }
    offset += 4 + len;
  }
  return offset;
}

// ---------------------------------------------------------------------------
// Manifest registration
// ---------------------------------------------------------------------------
export function registerNativeHost(): void {
  const manifestPath = join(app.getPath("userData"), "native-host", "com.memex.browser_bridge.json");
  const manifest = {
    name:            "com.memex.browser_bridge",
    description:     "Memex Desktop browser bridge",
    path:            process.execPath,
    type:            "stdio",
    allowed_origins: [..._allowedIds].map((id) => `chrome-extension://${id}/`),
  };

  try {
    mkdirSync(join(manifestPath, ".."), { recursive: true });
    writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), "utf-8");

    if (process.platform === "win32") {
      const { execSync } = require("child_process");
      const key = `HKCU\\SOFTWARE\\Google\\Chrome\\NativeMessagingHosts\\com.memex.browser_bridge`;
      try { execSync(`reg add "${key}" /ve /t REG_SZ /d "${manifestPath}" /f`); } catch {}
    }
  } catch {}
}

// Re-write the manifest when the allowlist changes
export function updateNativeHostManifest(ids: string[]): void {
  setBridgeAllowedIds(ids);
  registerNativeHost();
}

// ---------------------------------------------------------------------------
// BrowserBridge — pipe server with handshake enforcement
// ---------------------------------------------------------------------------
export class BrowserBridge {
  private server:     Server   | null  = null;
  private sockets:    Map<Socket, boolean> = new Map(); // socket → handshake complete
  private onMessage:  ((msg: Record<string, unknown>) => void) | null = null;

  start(handler: (msg: Record<string, unknown>) => void): void {
    this.onMessage = handler;
    this.server    = createServer((socket) => this.handleSocket(socket));
    this.server.listen(PIPE_NAME, () => {});
    this.server.on("error", () => {}); // already-bound is OK
  }

  private sendFrame(socket: Socket, obj: unknown): void {
    try { socket.write(encode(obj)); } catch {}
  }

  private handleSocket(socket: Socket): void {
    this.sockets.set(socket, false); // pending handshake
    let buf = Buffer.alloc(0);

    // Reject if no handshake arrives within timeout
    const timer = setTimeout(() => {
      if (!this.sockets.get(socket)) {
        this.sendFrame(socket, { type: "handshake_rejected", reason: "timeout" });
        socket.destroy();
      }
    }, HANDSHAKE_TIMEOUT_MS);

    socket.on("data", (chunk: Buffer) => {
      buf = Buffer.concat([buf, chunk]);

      for (const [msg, end] of parseFrames(buf)) {
        buf = buf.slice(end);
        if (!msg || typeof msg !== "object") continue;
        const m = msg as Record<string, unknown>;

        const handshakeDone = this.sockets.get(socket);

        if (!handshakeDone) {
          // Must be a valid handshake
          if (
            m.type !== "handshake" ||
            typeof m.extensionId !== "string" ||
            m.extensionId.length === 0
          ) {
            this.sendFrame(socket, { type: "handshake_rejected", reason: "handshake required" });
            socket.destroy();
            return;
          }

          if (!_allowedIds.has(m.extensionId as string)) {
            this.sendFrame(socket, { type: "handshake_rejected", reason: "extension not allowed" });
            socket.destroy();
            return;
          }

          clearTimeout(timer);
          this.sockets.set(socket, true);
          this.sendFrame(socket, {
            type:            "handshake_ok",
            desktopVersion:  app.getVersion(),
            protocolVersion: PROTOCOL_VERSION,
          });
          return;
        }

        // Authenticated — relay to renderer
        this.onMessage?.(m);
      }
    });

    socket.on("close", () => { clearTimeout(timer); this.sockets.delete(socket); });
    socket.on("error", () => { clearTimeout(timer); this.sockets.delete(socket); });
  }

  /** Send a command to all authenticated browser connections */
  send(msg: Record<string, unknown>): void {
    for (const [socket, authenticated] of this.sockets) {
      if (authenticated) try { socket.write(encode(msg)); } catch {}
    }
  }

  stop(): void {
    for (const [socket] of this.sockets) try { socket.destroy(); } catch {}
    this.server?.close();
    this.sockets.clear();
  }
}
