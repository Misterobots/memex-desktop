import { describe, expect, it } from "vitest";
import { decodeWslOutput, decompInvocation, pickDebianImage, toLf, toWslPath, parseDecompUrl, redactSecrets, wslListHasDecomp } from "../decomp-pure";

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

describe("how decomp is invoked", () => {
  it("goes through wsl.exe into the decomp-wtf distro on Windows, like decomp's own shim", () => {
    expect(decompInvocation("win32", ["url"])).toEqual({
      file: "wsl.exe",
      args: ["-d", "decomp-wtf", "--cd", "~", "--exec", "/usr/local/bin/decomp", "url"],
    });
  });

  it("uses the plain command elsewhere", () => {
    expect(decompInvocation("darwin", ["connect", "--list"])).toEqual({ file: "decomp", args: ["connect", "--list"] });
  });

  it("finds the distro in wsl -l -q output (UTF-16 residue, BOM, default marker)", () => {
    expect(wslListHasDecomp("\uFEFFDebian\r\ndecomp-wtf\r\n")).toBe(true);
    expect(wslListHasDecomp("d\0e\0c\0o\0m\0p\0-\0w\0t\0f\0\r\0\n\0")).toBe(true);
    expect(wslListHasDecomp("decomp-wtf (Default)\n")).toBe(true);
    expect(wslListHasDecomp("Ubuntu\nDebian\n")).toBe(false);
    expect(wslListHasDecomp("my-decomp-wtf-2\n")).toBe(false);
  });
});

describe("windows setup helpers", () => {
  it("maps Windows folders to WSL mounts", () => {
    expect(toWslPath("C:\\Users\\me\\AppData\\Local\\Temp\\x")).toBe("/mnt/c/Users/me/AppData/Local/Temp/x");
    expect(toWslPath("\\\\server\\share")).toBeNull();
  });

  it("writes Linux scripts with LF endings", () => {
    expect(toLf("a\r\nb\r\n")).toBe("a\nb\n");
  });

  it("decodes wsl.exe output in UTF-16 or UTF-8", () => {
    expect(decodeWslOutput(Buffer.from("\uFEFFdecomp-wtf\r\n", "utf16le"))).toBe("decomp-wtf\r\n");
    expect(decodeWslOutput(Buffer.from("decomp-wtf\n", "utf8"))).toBe("decomp-wtf\n");
  });

  const sha = "a".repeat(64);
  it("picks the x64 Debian image only with an https URL and a real checksum", () => {
    const info = (Url: unknown, Sha256: unknown) => ({ ModernDistributions: { Debian: [{ Name: "Debian", Amd64Url: { Url, Sha256 } }] } });
    expect(pickDebianImage(info("https://example.org/d.tar.gz", sha.toUpperCase()))).toEqual({ url: "https://example.org/d.tar.gz", sha256: sha });
    expect(pickDebianImage(info("http://example.org/d.tar.gz", sha))).toBeNull();
    expect(pickDebianImage(info("https://example.org/d.tar.gz", "abc"))).toBeNull();
    expect(pickDebianImage({})).toBeNull();
    expect(pickDebianImage(null)).toBeNull();
  });
});
