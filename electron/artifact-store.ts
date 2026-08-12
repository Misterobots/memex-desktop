/**
 * ArtifactStore — append-only JSONL log of artifacts produced by agent runs.
 * Each artifact is linked to a runId (optional) and a session.
 *
 * Size handling: content up to INLINE_LIMIT stays inline in the JSONL record (and
 * in the in-memory cache). Anything larger — which in practice means every image,
 * since a PNG data URL routinely runs 200KB-2MB — is written to a file under
 * userData/artifacts/ instead, and only its `path` is kept in the record/cache.
 * This is the same on-disk convention file/diff artifacts already used, now
 * enforced for every type instead of being a comment nothing implemented.
 *
 * Durability: writes are synchronous (appendFileSync), matching run-store.ts's
 * appendLine — not a buffered WriteStream. A buffered stream.write() can still be
 * sitting in Node's internal buffer, unflushed, if the process is killed right
 * after addArtifact() returns; the caller would believe the write succeeded when
 * it never reached disk. Artifact writes aren't a hot path (occasional agent
 * output, not per-token streaming), so the throughput cost of going synchronous
 * is not worth trading away that guarantee.
 *
 * Rotation: on load, records older than MAX_AGE_DAYS are dropped, and if the
 * survivors still exceed MAX_RECORDS, only the most recent MAX_RECORDS are kept.
 * Pruned records that spilled content to disk have their backing file deleted too
 * — pruning the index without freeing the blob wouldn't reclaim any space. This
 * bounds long-run growth from a large *number* of records, which the per-item
 * size cap above doesn't touch on its own.
 */
import { join } from "path";
import {
  appendFileSync, existsSync, readFileSync, writeFileSync, mkdirSync, unlinkSync,
} from "fs";

export type ArtifactType = "file" | "diff" | "diagram" | "report" | "log" | "image";

export interface ArtifactRecord {
  id:        string;
  runId?:    string;
  sessionId: string;
  type:      ArtifactType;
  name:      string;
  /** File-system path — set for file/diff artifacts, and for any artifact whose
   *  content exceeded INLINE_LIMIT and was spilled to disk. */
  path?:     string;
  /** Inline content, only when its size is <= INLINE_LIMIT. See file header. */
  content?:  string;
  createdAt: string; // ISO
  sizeBytes?: number;
}

const INLINE_LIMIT   = 64 * 1024;       // 64 KB
const MAX_AGE_DAYS    = 90;
const MAX_RECORDS     = 2000;

function extFor(type: ArtifactType): string {
  switch (type) {
    case "image":   return "png";
    case "diagram": return "html";
    case "report":  return "md";
    case "log":     return "log";
    default:        return "txt";
  }
}

/** Decodes a data URL ("data:image/png;base64,...") or plain string to raw bytes. */
function toBuffer(content: string, type: ArtifactType): Buffer {
  if (type === "image" && content.startsWith("data:")) {
    return Buffer.from(content.replace(/^data:[^,]+,/, ""), "base64");
  }
  return Buffer.from(content, "utf-8");
}

export class ArtifactStore {
  private logPath:      string;
  private artifactsDir: string;
  private cache:        ArtifactRecord[] = [];

  constructor(userData: string) {
    this.logPath      = join(userData, "artifacts.jsonl");
    this.artifactsDir = join(userData, "artifacts");
    mkdirSync(this.artifactsDir, { recursive: true });
    if (existsSync(this.logPath)) {
      this.cache = readFileSync(this.logPath, "utf-8")
        .split("\n")
        .filter(Boolean)
        .flatMap((line) => { try { return [JSON.parse(line) as ArtifactRecord]; } catch { return []; } });
    }
    this.prune();
  }

  /** Drops records past MAX_AGE_DAYS / beyond MAX_RECORDS, deletes their spilled
   *  files, and rewrites the log — a no-op (no rewrite) when nothing was dropped. */
  private prune(): void {
    if (this.cache.length === 0) return;

    const cutoff = Date.now() - MAX_AGE_DAYS * 24 * 60 * 60 * 1000;
    // cache is in file order (oldest first) — sort defensively in case that ever changes.
    const sorted = [...this.cache].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    let survivors = sorted.filter((r) => new Date(r.createdAt).getTime() >= cutoff);
    if (survivors.length > MAX_RECORDS) {
      survivors = survivors.slice(survivors.length - MAX_RECORDS);
    }
    if (survivors.length === this.cache.length) return; // nothing pruned

    const survivorIds = new Set(survivors.map((r) => r.id));
    for (const r of this.cache) {
      if (!survivorIds.has(r.id) && r.path) {
        try { unlinkSync(r.path); } catch {} // best-effort — file may already be gone
      }
    }

    this.cache = survivors;
    this.rewrite();
  }

  private rewrite(): void {
    try {
      writeFileSync(this.logPath, this.cache.map((r) => JSON.stringify(r)).join("\n") + (this.cache.length ? "\n" : ""), "utf-8");
    } catch {}
  }

  private append(rec: ArtifactRecord): void {
    this.cache.push(rec);
    try { appendFileSync(this.logPath, JSON.stringify(rec) + "\n", "utf-8"); } catch {}
  }

  addArtifact(rec: Omit<ArtifactRecord, "id" | "createdAt">): ArtifactRecord {
    const id = `art-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    let { content, path, sizeBytes } = rec;

    if (content && !path) {
      const raw = toBuffer(content, rec.type);
      sizeBytes = raw.length;
      if (raw.length > INLINE_LIMIT) {
        path = join(this.artifactsDir, `${id}.${extFor(rec.type)}`);
        writeFileSync(path, raw);
        content = undefined; // spilled to disk — don't also keep it (and its memory) inline
      }
    }

    const artifact: ArtifactRecord = {
      ...rec,
      content,
      path,
      sizeBytes,
      id,
      createdAt: new Date().toISOString(),
    };
    this.append(artifact);
    return artifact;
  }

  getForRun(runId: string): ArtifactRecord[] {
    return this.cache.filter((a) => a.runId === runId);
  }

  getForSession(sessionId: string): ArtifactRecord[] {
    return this.cache.filter((a) => a.sessionId === sessionId);
  }

  getRecent(limit = 50): ArtifactRecord[] {
    return this.cache.slice(-limit).reverse();
  }
}
