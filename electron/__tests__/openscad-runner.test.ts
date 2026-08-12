import { describe, it, expect } from "vitest";
import { buildArgs, parseStlContent, type RenderParams } from "../openscad-pure";

// ---------------------------------------------------------------------------
// Imports from ../openscad-pure (NOT ../openscad-runner) deliberately: this
// repo's Vite config shims Node builtins for the renderer context, which
// breaks under vitest for any test that even transitively imports a module
// with a top-level `import ... from "fs"`/"child_process" -- confirmed with
// both openscad-runner.ts directly and via re-exports through it, since the
// whole module (including its own top-level Node-builtin imports) gets
// evaluated on import either way. electron/__tests__/lsp-parser.test.ts hits
// the same constraint and works around it by re-implementing its parser
// inline; openscad-pure.ts instead gives the pure logic a real, importable,
// fs-free home so this file can test the actual implementation directly.
// See openscad-pure.ts's own header comment for the full explanation.
// ---------------------------------------------------------------------------

describe("openscad-runner: buildArgs", () => {
  it("adds --render for stl/3mf/off but not for a plain png preview", () => {
    const base: Omit<RenderParams, "format"> = { scadPath: "a.scad", outputPath: "a.stl" };
    expect(buildArgs({ ...base, format: "stl" })).toContain("--render");
    expect(buildArgs({ ...base, format: "3mf" })).toContain("--render");
    expect(buildArgs({ ...base, format: "off" })).toContain("--render");
    expect(buildArgs({ ...base, format: "png" })).not.toContain("--render");
  });

  it("passes the part name as a quoted -D override, matching this project's chassis.scad part dispatcher convention", () => {
    const args = buildArgs({ scadPath: "chassis.scad", outputPath: "out.stl", format: "stl", part: "drive_sprocket" });
    const dIndex = args.indexOf("-D");
    expect(dIndex).toBeGreaterThanOrEqual(0);
    expect(args[dIndex + 1]).toBe('part="drive_sprocket"');
  });

  it("escapes embedded quotes in a part/var string rather than producing broken -D syntax", () => {
    const args = buildArgs({ scadPath: "a.scad", outputPath: "a.stl", format: "stl", part: 'weird"name' });
    const dIndex = args.indexOf("-D");
    expect(args[dIndex + 1]).toBe('part="weird\\"name"');
  });

  it("adds numeric and boolean -D vars unquoted, strings quoted", () => {
    const args = buildArgs({
      scadPath: "a.scad", outputPath: "a.stl", format: "stl",
      vars: { CHAIN_PITCH: 12, DEBUG: true, LABEL: "left" },
    });
    const joined = args.join(" ");
    expect(joined).toContain("CHAIN_PITCH=12");
    expect(joined).toContain("DEBUG=true");
    expect(joined).toContain('LABEL="left"');
  });

  it("adds --export-format 3mf only for the 3mf case", () => {
    const stlArgs = buildArgs({ scadPath: "a.scad", outputPath: "a.stl", format: "stl" });
    const mfArgs  = buildArgs({ scadPath: "a.scad", outputPath: "a.3mf", format: "3mf" });
    expect(stlArgs).not.toContain("3mf");
    expect(mfArgs).toContain("--export-format");
    expect(mfArgs).toContain("3mf");
  });

  it("places -o outputPath and the scad path last, in that order", () => {
    const args = buildArgs({ scadPath: "chassis.scad", outputPath: "out.stl", format: "stl" });
    expect(args.slice(-3)).toEqual(["-o", "out.stl", "chassis.scad"]);
  });
});

describe("openscad-runner: parseStlContent", () => {
  it("parses a minimal single-triangle ASCII STL and computes a correct bounding box", () => {
    const ascii = [
      "solid test",
      "  facet normal 0 0 1",
      "    outer loop",
      "      vertex 0 0 0",
      "      vertex 10 0 0",
      "      vertex 0 10 5",
      "    endloop",
      "  endfacet",
      "endsolid test",
      "",
    ].join("\n");

    const geo = parseStlContent(ascii);
    expect(geo).not.toBeNull();
    expect(geo!.vertexCount).toBe(3);
    expect(geo!.triangleCount).toBe(1);
    expect(geo!.boundingBox.min).toEqual([0, 0, 0]);
    expect(geo!.boundingBox.max).toEqual([10, 10, 5]);
  });

  it("sums vertices/triangles correctly across multiple facets", () => {
    const ascii = [
      "solid two",
      "facet normal 0 0 1", "outer loop",
      "vertex 0 0 0", "vertex 1 0 0", "vertex 0 1 0",
      "endloop", "endfacet",
      "facet normal 0 0 1", "outer loop",
      "vertex 5 5 5", "vertex 6 5 5", "vertex 5 6 5",
      "endloop", "endfacet",
      "endsolid two",
    ].join("\n");

    const geo = parseStlContent(ascii);
    expect(geo!.vertexCount).toBe(6);
    expect(geo!.triangleCount).toBe(2);
    expect(geo!.boundingBox.min).toEqual([0, 0, 0]);
    expect(geo!.boundingBox.max).toEqual([6, 6, 5]);
  });

  it("returns null for binary STL content (no leading 'solid' marker) rather than misparsing it as empty geometry", () => {
    // Binary STL starts with an 80-byte arbitrary header, not the ASCII "solid" keyword.
    const fakeBinaryHeader = "\x00".repeat(80) + "garbage-not-ascii-stl";
    expect(parseStlContent(fakeBinaryHeader)).toBeNull();
  });

  it("returns null for a 'solid' file with zero parseable vertices instead of a degenerate zero-bbox result", () => {
    expect(parseStlContent("solid empty\nendsolid empty\n")).toBeNull();
  });

  it("returns manifold: null (unverified), not a guessed true/false -- inferManifold from stderr is a separate step", () => {
    const ascii = "solid t\nfacet normal 0 0 1\nouter loop\nvertex 0 0 0\nvertex 1 0 0\nvertex 0 1 0\nendloop\nendfacet\nendsolid t\n";
    expect(parseStlContent(ascii)!.manifold).toBeNull();
  });
});
