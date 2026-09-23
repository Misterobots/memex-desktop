import { describe, expect, it } from "vitest";
import { collectResidentModels } from "../ollama-residency";

const aliasBases = [
  "http://localhost:11434",
  "http://127.0.0.1:11434",
  "http://192.168.2.101:11434",
];

const embedLoad = {
  name: "nomic-embed-text:latest",
  model: "0a109f422b47",
  size: 323000000,
  size_vram: 323000000,
  expires_at: "2026-09-23T12:35:00.000Z",
};

describe("Ollama residency rows", () => {
  it("collapses one load seen through several addresses of the same daemon", () => {
    const rows = collectResidentModels(aliasBases.map((base) => ({ base, models: [embedLoad] })));
    expect(rows).toHaveLength(1);
    expect(rows[0].name).toBe("nomic-embed-text:latest");
    expect(rows[0].host).toBe("http://localhost:11434");
  });

  it("keeps the same model loaded on two independent daemons as two rows", () => {
    const rows = collectResidentModels([
      { base: "http://192.168.2.101:11434", models: [{ ...embedLoad, expires_at: "2026-09-23T12:35:00.000Z" }] },
      { base: "http://192.168.2.103:11434", models: [{ ...embedLoad, expires_at: "2026-09-23T13:02:00.000Z" }] },
    ]);
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.host)).toEqual([
      "http://192.168.2.101:11434",
      "http://192.168.2.103:11434",
    ]);
  });

  it("reports every distinct model from a multi-model host", () => {
    const rows = collectResidentModels([{
      base: "http://127.0.0.1:11434",
      models: [
        embedLoad,
        { name: "qwen3:14b", model: "b1fd9cbf90f9", size: 9000000000, expires_at: "2026-09-23T12:40:00.000Z" },
      ],
    }]);
    expect(rows.map((r) => r.name)).toEqual(["nomic-embed-text:latest", "qwen3:14b"]);
    expect(rows[1].vramGb).toBe(9);
  });

  it("skips unnamed entries and tolerates an empty sweep", () => {
    expect(collectResidentModels([{ base: "http://x", models: [{ name: "" }] }])).toEqual([]);
    expect(collectResidentModels([])).toEqual([]);
  });
});
