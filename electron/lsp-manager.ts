/**
 * LSP Manager — spawns language servers and relays JSON-RPC to the renderer.
 *
 * Each workspace gets one server per language. Messages follow the
 * Language Server Protocol (JSON-RPC 2.0 over stdio).
 */
import { spawn, ChildProcess } from "child_process";
import { BrowserWindow }       from "electron";

// ---------------------------------------------------------------------------
// Server definitions — extend to add more languages
// ---------------------------------------------------------------------------
interface ServerDef {
  command:   string;
  args:      string[];
  extensions: string[];
}

const SERVER_DEFS: ServerDef[] = [
  {
    command:    "typescript-language-server",
    args:       ["--stdio"],
    extensions: [".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"],
  },
  {
    command:    "pylsp",
    args:       [],
    extensions: [".py"],
  },
  {
    command:    "rust-analyzer",
    args:       [],
    extensions: [".rs"],
  },
  {
    command:    "gopls",
    args:       [],
    extensions: [".go"],
  },
];

export function serverForExtension(ext: string): ServerDef | null {
  return SERVER_DEFS.find((s) => s.extensions.includes(ext)) ?? null;
}

// ---------------------------------------------------------------------------
// LSP content-length framing
// ---------------------------------------------------------------------------
function encode(obj: unknown): Buffer {
  const body = JSON.stringify(obj);
  const header = `Content-Length: ${Buffer.byteLength(body, "utf8")}\r\n\r\n`;
  return Buffer.concat([Buffer.from(header, "ascii"), Buffer.from(body, "utf8")]);
}

function* parseMessages(buf: Buffer): Generator<unknown> {
  let offset = 0;
  while (offset < buf.length) {
    const header = buf.indexOf("\r\n\r\n", offset);
    if (header === -1) break;
    const headerStr = buf.slice(offset, header).toString("ascii");
    const clMatch   = headerStr.match(/Content-Length:\s*(\d+)/i);
    if (!clMatch) { offset = header + 4; continue; }
    const contentLen = parseInt(clMatch[1], 10);
    const bodyStart  = header + 4;
    if (buf.length < bodyStart + contentLen) break;
    try {
      yield JSON.parse(buf.slice(bodyStart, bodyStart + contentLen).toString("utf8"));
    } catch {}
    offset = bodyStart + contentLen;
  }
}

// ---------------------------------------------------------------------------
// LspServer — wraps a single language server process
// ---------------------------------------------------------------------------
class LspServer {
  private proc:   ChildProcess;
  private buf:    Buffer   = Buffer.alloc(0);
  private reqId:  number   = 1;
  private pending: Map<number, { resolve: (r: unknown) => void; reject: (e: unknown) => void }> = new Map();
  public  ready:  boolean  = false;

  constructor(
    private lang:    string,
    private rootUri: string,
    private win:     () => BrowserWindow | null,
    def:             ServerDef,
  ) {
    this.proc = spawn(def.command, def.args, {
      cwd:   rootUri.replace("file://", ""),
      stdio: ["pipe", "pipe", "pipe"],
    });

    this.proc.stdout?.on("data", (chunk: Buffer) => {
      this.buf = Buffer.concat([this.buf, chunk]);
      for (const msg of parseMessages(this.buf)) {
        this.buf = Buffer.alloc(0); // reset after full parse pass
        this.handleMessage(msg);
      }
    });

    this.proc.stderr?.on("data", () => {}); // suppress noise
    this.proc.on("exit", () => { this.ready = false; });

    this.initialize();
  }

  private async initialize() {
    const result = await this.request("initialize", {
      processId: process.pid,
      rootUri:   this.rootUri,
      capabilities: {
        textDocument: {
          synchronization: { dynamicRegistration: false, didSave: true },
          publishDiagnostics: { relatedInformation: true },
          completion: { completionItem: { snippetSupport: false } },
          hover: {},
        },
      },
    });
    if (result) {
      this.send({ jsonrpc: "2.0", method: "initialized", params: {} });
      this.ready = true;
    }
  }

  private handleMessage(msg: unknown) {
    const m = msg as Record<string, unknown>;

    // Response to a pending request
    if ("id" in m && (m.result !== undefined || m.error !== undefined)) {
      const cb = this.pending.get(m.id as number);
      if (cb) {
        this.pending.delete(m.id as number);
        m.error ? cb.reject(m.error) : cb.resolve(m.result);
        return;
      }
    }

    // Server notification — forward to renderer
    this.win()?.webContents.send("lsp:notification", {
      lang:   this.lang,
      method: m.method,
      params: m.params,
    });
  }

  request(method: string, params: unknown): Promise<unknown> {
    return new Promise((resolve, reject) => {
      const id = this.reqId++;
      this.pending.set(id, { resolve, reject });
      this.send({ jsonrpc: "2.0", id, method, params });
      // Timeout after 5s
      setTimeout(() => {
        if (this.pending.has(id)) {
          this.pending.delete(id);
          reject(new Error(`LSP request timed out: ${method}`));
        }
      }, 5000);
    });
  }

  send(msg: unknown) {
    try { this.proc.stdin?.write(encode(msg)); } catch {}
  }

  stop() {
    this.send({ jsonrpc: "2.0", method: "shutdown", params: {} });
    setTimeout(() => this.proc.kill(), 500);
  }
}

// ---------------------------------------------------------------------------
// LspManager — one server per (lang, rootUri)
// ---------------------------------------------------------------------------
export class LspManager {
  private servers: Map<string, LspServer> = new Map();

  constructor(private win: () => BrowserWindow | null) {}

  private key(lang: string, rootUri: string) { return `${lang}::${rootUri}`; }

  start(ext: string, rootUri: string): boolean {
    const def  = serverForExtension(ext);
    if (!def)   return false;
    const lang  = def.extensions[0].slice(1); // e.g. "ts"
    const k     = this.key(lang, rootUri);
    if (this.servers.has(k)) return true;
    try {
      this.servers.set(k, new LspServer(lang, rootUri, this.win, def));
      return true;
    } catch {
      return false;
    }
  }

  request(lang: string, rootUri: string, method: string, params: unknown): Promise<unknown> {
    const srv = this.servers.get(this.key(lang, rootUri));
    if (!srv || !srv.ready) return Promise.reject(new Error("Server not ready"));
    return srv.request(method, params);
  }

  notify(lang: string, rootUri: string, method: string, params: unknown) {
    this.servers.get(this.key(lang, rootUri))?.send({ jsonrpc: "2.0", method, params });
  }

  stopAll() {
    this.servers.forEach((s) => s.stop());
    this.servers.clear();
  }
}
