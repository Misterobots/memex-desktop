import { describe, it, expect } from "vitest";

// ---------------------------------------------------------------------------
// Re-implement the parser inline so tests run in Node without Electron
// ---------------------------------------------------------------------------
function parseMessages(buf: Buffer): [unknown[], Buffer] {
  const messages: unknown[] = [];
  let offset = 0;

  while (offset < buf.length) {
    const sep = buf.indexOf("\r\n\r\n", offset);
    if (sep === -1) break;
    const headerStr = buf.slice(offset, sep).toString("ascii");
    const clMatch   = headerStr.match(/Content-Length:\s*(\d+)/i);
    if (!clMatch) { offset = sep + 4; continue; }
    const contentLen = parseInt(clMatch[1], 10);
    const bodyStart  = sep + 4;
    if (buf.length < bodyStart + contentLen) break;
    try { messages.push(JSON.parse(buf.slice(bodyStart, bodyStart + contentLen).toString("utf8"))); } catch {}
    offset = bodyStart + contentLen;
  }

  return [messages, buf.slice(offset)];
}

function frame(body: string): Buffer {
  const b = Buffer.from(body, "utf8");
  return Buffer.concat([Buffer.from(`Content-Length: ${b.length}\r\n\r\n`, "ascii"), b]);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe("LSP incremental parser", () => {
  it("parses a single complete message", () => {
    const [msgs, remainder] = parseMessages(frame('{"id":1}'));
    expect(msgs).toHaveLength(1);
    expect(msgs[0]).toEqual({ id: 1 });
    expect(remainder.length).toBe(0);
  });

  it("parses multiple messages in one chunk", () => {
    const buf = Buffer.concat([frame('{"id":1}'), frame('{"id":2}'), frame('{"id":3}')]);
    const [msgs, remainder] = parseMessages(buf);
    expect(msgs).toHaveLength(3);
    expect((msgs[2] as any).id).toBe(3);
    expect(remainder.length).toBe(0);
  });

  it("preserves partial trailing data when body is incomplete", () => {
    const complete = frame('{"id":1}');
    const partial  = Buffer.from("Content-Length: 100\r\n\r\n{", "ascii"); // body only partially received
    const buf      = Buffer.concat([complete, partial]);
    const [msgs, remainder] = parseMessages(buf);
    expect(msgs).toHaveLength(1);
    expect(remainder.toString()).toBe("Content-Length: 100\r\n\r\n{");
  });

  it("preserves partial header when no separator yet", () => {
    const buf = Buffer.from("Content-Length: 5\r\n", "ascii"); // no \r\n\r\n yet
    const [msgs, remainder] = parseMessages(buf);
    expect(msgs).toHaveLength(0);
    expect(remainder.toString()).toBe("Content-Length: 5\r\n");
  });

  it("splits correctly: message arrives in two chunks", () => {
    const full  = frame('{"method":"init"}');
    const part1 = full.slice(0, 10);
    const part2 = full.slice(10);

    let buf = part1;
    let [msgs, remainder] = parseMessages(buf);
    expect(msgs).toHaveLength(0);
    buf = Buffer.concat([remainder, part2]);
    [msgs, remainder] = parseMessages(buf);
    expect(msgs).toHaveLength(1);
    expect((msgs[0] as any).method).toBe("init");
    expect(remainder.length).toBe(0);
  });

  it("skips malformed JSON bodies without losing subsequent messages", () => {
    const bad  = Buffer.concat([Buffer.from("Content-Length: 3\r\n\r\n", "ascii"), Buffer.from("not", "ascii")]);
    const good = frame('{"id":42}');
    const [msgs, remainder] = parseMessages(Buffer.concat([bad, good]));
    expect(msgs).toHaveLength(1); // malformed silently skipped
    expect((msgs[0] as any).id).toBe(42);
    expect(remainder.length).toBe(0);
  });

  it("skips headers without Content-Length", () => {
    const noLen = Buffer.from("X-Junk: foo\r\n\r\n{}", "ascii");
    const good  = frame('{"id":7}');
    const [msgs] = parseMessages(Buffer.concat([noLen, good]));
    expect(msgs).toHaveLength(1);
    expect((msgs[0] as any).id).toBe(7);
  });
});
