import { describe, expect, it, vi } from "vitest";

vi.mock("os", () => ({ totalmem: () => 32 * 1024 ** 3 }));
vi.mock("child_process", () => ({ execFile: vi.fn() }));
vi.mock("util", () => ({ promisify: () => async () => ({ stdout: "" }) }));
import {
  detectGpusWith, gpuProbes, normalizeLocalEndpoint, recommendLocalModels,
  parseNvidiaSmiCsv, parseSystemProfilerGpus, parseWmiGpus,
} from "../local-llm";
describe("local LLM setup", () => {
  it("recommends a capable model for a 16 GB local GPU", () => {
    expect(recommendLocalModels([{ name: "RTX", vramGb: 16 }], 32)[0]?.model).toBe("qwen3:14b");
  });
  it("recommends qwen3.8 for multi-GPU setups with 24 GB+ total VRAM", () => {
    expect(recommendLocalModels([{ name: "RTX A", vramGb: 16 }, { name: "RTX B", vramGb: 16 }], 32)[0]?.model).toBe("qwen3.8:27b");
  });
  it("recommends a small model when local hardware is constrained", () => {
    expect(recommendLocalModels([], 16)[0]?.model).toBe("gemma4:e4b");
  });
  it("normalizes user-provided local service endpoints", () => {
    expect(normalizeLocalEndpoint("http://localhost:11434/api/tags")).toBe("http://localhost:11434");
    expect(() => normalizeLocalEndpoint("file:///etc/passwd")).toThrow("http or https");
  });
});

describe("GPU memory detection", () => {
  const GiB = 1024 ** 3;

  it("reads nvidia-smi MiB totals as GB", () => {
    const stdout = "NVIDIA GeForce RTX 5060 Ti, 16311\r\nNVIDIA GeForce RTX 5060 Ti, 16311\r\n";
    expect(parseNvidiaSmiCsv(stdout)).toEqual([
      { name: "NVIDIA GeForce RTX 5060 Ti", vramGb: 15.9 },
      { name: "NVIDIA GeForce RTX 5060 Ti", vramGb: 15.9 },
    ]);
  });

  // AdapterRAM is a UInt32: 4294967295 bytes is what a 24 GB card reports, not 4 GB.
  // The pre-fix expression (`[math]::Round($_.AdapterRAM / 1GB,1)`) returned 4.0 here.
  it("reports a saturated AdapterRAM as unknown instead of as 4 GB", () => {
    const stdout = JSON.stringify({ Name: "NVIDIA GeForce RTX 4090", AdapterRAM: 4294967295 });
    expect(parseWmiGpus(stdout)).toEqual([{ name: "NVIDIA GeForce RTX 4090", vramGb: 0 }]);
  });

  it("keeps an AdapterRAM value below the UInt32 ceiling", () => {
    const stdout = JSON.stringify([{ Name: "Intel UHD 630", AdapterRAM: 3 * GiB }]);
    expect(parseWmiGpus(stdout)).toEqual([{ name: "Intel UHD 630", vramGb: 3 }]);
  });

  it("treats Apple Silicon, which reports no discrete VRAM, as unknown rather than absent", () => {
    const apple = JSON.stringify({ SPDisplaysDataType: [{ _name: "Apple M3 Max" }] });
    expect(parseSystemProfilerGpus(apple)).toEqual([{ name: "Apple M3 Max", vramGb: 0 }]);
    const discrete = JSON.stringify({ SPDisplaysDataType: [{ _name: "Radeon Pro", spdisplays_vram: "8 GB" }] });
    expect(parseSystemProfilerGpus(discrete)).toEqual([{ name: "Radeon Pro", vramGb: 8 }]);
  });

  it("prefers the probe that can measure memory and falls back only when it is absent", async () => {
    const calls: string[] = [];
    const gpus = await detectGpusWith("win32", async (command) => {
      calls.push(command);
      if (command === "nvidia-smi") return "NVIDIA GeForce RTX 4090, 24576\n";
      return JSON.stringify({ Name: "NVIDIA GeForce RTX 4090", AdapterRAM: 4294967295 });
    });
    expect(gpus).toEqual([{ name: "NVIDIA GeForce RTX 4090", vramGb: 24 }]);
    expect(calls).toEqual(["nvidia-smi"]);
  });

  it("falls through to WMI when nvidia-smi is not installed, and stays honest about what WMI claims", async () => {
    const calls: string[] = [];
    const gpus = await detectGpusWith("win32", async (command) => {
      calls.push(command);
      if (command === "nvidia-smi") throw Object.assign(new Error("ENOENT"), { code: "ENOENT" });
      // A card over 4 GB arrives as -1 or as the ceiling: neither is a measurement.
      return JSON.stringify([{ Name: "AMD Radeon RX 7900 XTX", AdapterRAM: -1 }]);
    });
    expect(gpus).toEqual([{ name: "AMD Radeon RX 7900 XTX", vramGb: 0 }]);
    expect(calls).toEqual(["nvidia-smi", "powershell.exe"]);
  });

  it("asks the platform that owns the tool", () => {
    expect(gpuProbes("darwin").map((probe) => probe.command)).toEqual(["system_profiler", "nvidia-smi"]);
    expect(gpuProbes("win32").map((probe) => probe.command)).toEqual(["nvidia-smi", "powershell.exe"]);
    expect(gpuProbes("linux").map((probe) => probe.command)).toEqual(["nvidia-smi"]);
  });

  it("recommends the top tier for a 24 GB card it could measure, and never a 4 GB tier for a saturated read", () => {
    const measured = parseNvidiaSmiCsv("RTX 4090, 24576\n");
    expect(recommendLocalModels(measured, 32)[0]?.model).toBe("qwen3.8:27b");
    const saturated = parseWmiGpus(JSON.stringify({ Name: "RTX 4090", AdapterRAM: 4294967295 }));
    const first = recommendLocalModels(saturated, 32)[0]?.model;
    expect(first).not.toBe("qwen3.8:27b");
    expect(recommendLocalModels(saturated, 32).length).toBeGreaterThan(0);
  });
});
