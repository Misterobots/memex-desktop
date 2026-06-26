/**
 * Minimal line-level diff (Myers diff subset).
 * Returns an array of hunks suitable for rendering.
 * Good enough for code review; not a replacement for a full diff library.
 */
export type DiffOp = "equal" | "insert" | "delete";

export interface DiffLine {
  op:      DiffOp;
  content: string;
  lineOld?: number;
  lineNew?: number;
}

export function diffLines(oldText: string, newText: string): DiffLine[] {
  const oldLines = oldText.split("\n");
  const newLines = newText.split("\n");

  // Build LCS table (simple O(nm) for files up to ~1000 lines each)
  const m = oldLines.length;
  const n = newLines.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));

  for (let i = m - 1; i >= 0; i--) {
    for (let j = n - 1; j >= 0; j--) {
      if (oldLines[i] === newLines[j]) {
        dp[i][j] = 1 + dp[i + 1][j + 1];
      } else {
        dp[i][j] = Math.max(dp[i + 1][j], dp[i][j + 1]);
      }
    }
  }

  const result: DiffLine[] = [];
  let io = 0, in_ = 0, lo = 1, ln = 1;

  while (io < m || in_ < n) {
    if (io < m && in_ < n && oldLines[io] === newLines[in_]) {
      result.push({ op: "equal",  content: oldLines[io], lineOld: lo++, lineNew: ln++ });
      io++; in_++;
    } else if (in_ < n && (io >= m || dp[io][in_ + 1] >= dp[io + 1][in_])) {
      result.push({ op: "insert", content: newLines[in_], lineNew: ln++ });
      in_++;
    } else {
      result.push({ op: "delete", content: oldLines[io], lineOld: lo++ });
      io++;
    }
  }

  return result;
}

/** Collapse long equal runs to ±3 context lines around changes. */
export function collapseContext(lines: DiffLine[], context = 3): Array<DiffLine | "..."> {
  const changed = new Set<number>();
  lines.forEach((l, i) => { if (l.op !== "equal") changed.add(i); });

  const visible = new Set<number>();
  changed.forEach((i) => {
    for (let d = -context; d <= context; d++) {
      const idx = i + d;
      if (idx >= 0 && idx < lines.length) visible.add(idx);
    }
  });

  const out: Array<DiffLine | "..."> = [];
  let lastVisible = -1;
  for (let i = 0; i < lines.length; i++) {
    if (!visible.has(i)) continue;
    if (lastVisible !== -1 && i > lastVisible + 1) out.push("...");
    out.push(lines[i]);
    lastVisible = i;
  }
  return out;
}
