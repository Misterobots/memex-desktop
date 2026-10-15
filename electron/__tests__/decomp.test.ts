import { describe, expect, it } from "vitest";
import { parseDecompUrl, redactSecrets } from "../decomp-pure";

describe("decomp.wtf address parsing", () => {
  const good = "http://127.0.0.1:6464/?k=abcDEF123_-xyz789";

  it("accepts the loopback address `decomp url` prints", () => {
    expect(parseDecompUrl(`${good}\n`)).toBe(good);
  });

  it("takes the last valid line when the CLI prints progress first", () => {
    expect(parseDecompUrl(`starting decomp.wtf…\n${good}\r\n`)).toBe(good);
  });

  it.each([
    "https://decomp.wtf/?k=abcDEF123_-xyz789",
    "http://localhost:6464/?k=abcDEF123_-xyz789",
    "http://127.0.0.1.evil.example:6464/?k=abcDEF123_-xyz789",
    "http://user@127.0.0.1:6464/?k=abcDEF123_-xyz789",
    "http://127.0.0.1:6464/other?k=abcDEF123_-xyz789",
    "http://127.0.0.1:6464/?k=short",
    "http://127.0.0.1/?k=abcDEF123_-xyz789",
    "file:///etc/passwd",
    "not a url",
    "",
  ])("rejects %s", (value) => {
    expect(parseDecompUrl(value)).toBeNull();
  });

  it("removes the session key from text shown to the user", () => {
    expect(redactSecrets(`failed at ${good}`)).toBe("failed at http://127.0.0.1:6464/?k=…");
  });
});
