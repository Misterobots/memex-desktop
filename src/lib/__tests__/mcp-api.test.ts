import { describe, expect, it } from "vitest";
import { normalizeMcpClientConfig } from "../mcp-api";

describe("normalizeMcpClientConfig", () => {
  it("recognizes standard server transports and capabilities", () => {
    const config = normalizeMcpClientConfig({
      mcpServers: {
        remote: { url: "https://example.test/mcp", transport: "sse" },
        local: { command: "mcp-server", args: ["--safe", 42] },
      },
      capabilities: { resources: true, prompts: true },
    });
    expect(config.servers).toEqual([
      { name: "remote", transport: "sse", url: "https://example.test/mcp" },
      { name: "local", transport: "stdio", command: "mcp-server", args: ["--safe"] },
    ]);
    expect(config.resourcesSupported).toBe(true);
    expect(config.promptsSupported).toBe(true);
  });

  it("fails closed for malformed server entries", () => {
    expect(normalizeMcpClientConfig({ servers: { bad: null, alsoBad: [] } }).servers).toEqual([]);
  });
});
