/**
 * ArtifactStore — append-only JSONL log of artifacts produced by agent runs.
 * Each artifact is linked to a runId (optional) and a session.
 */
import { join } from "path";
import { createWriteStream, existsSync, readFileSync, WriteStream } from "fs";

export type ArtifactType = "file" | "diff" | "diagram" | "report" | "log";

export interface ArtifactRecord {
  id:        string;
  runId?:    string;
  sessionId: string;
  type:      ArtifactType;
  name:      string;
  /** File-system path for file/diff artifacts; undefined for inline content. */
  path?:     string;
  /** Inline content for diagram/report/log (capped at 64 KB). */
  content?:  string;
  createdAt: string; // ISO
  sizeBytes?: number;
}

export class ArtifactStore {
  private logPath: string;
  private stream:  WriteStream;
  private cache:   ArtifactRecord[] = [];

  constructor(userData: string) {
    this.logPath = join(userData, "artifacts.jsonl");
    this.stream  = createWriteStream(this.logPath, { flags: "a", encoding: "utf-8" });
    if (existsSync(this.logPath)) {
      this.cache = readFileSync(this.logPath, "utf-8")
        .split("\n")
        .filter(Boolean)
        .flatMap((line) => { try { return [JSON.parse(line) as ArtifactRecord]; } catch { return []; } });
    }
  }

  private append(rec: ArtifactRecord): void {
    this.cache.push(rec);
    this.stream.write(JSON.stringify(rec) + "\n");
  }

  addArtifact(rec: Omit<ArtifactRecord, "id" | "createdAt">): ArtifactRecord {
    const artifact: ArtifactRecord = {
      ...rec,
      id:        `art-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
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
