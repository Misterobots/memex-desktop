// @vitest-environment jsdom
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryView } from "./MemoryView";
import { apiFetch } from "../../lib/api-fetch";

vi.mock("../../lib/runtime-urls", () => ({ getMempalace: () => "http://memories.test" }));
vi.mock("../../lib/api-fetch", () => ({ apiFetch: vi.fn() }));

const response = (body: unknown) => ({ ok: true, json: async () => body }) as Response;

describe("MemoryView", () => {
  beforeEach(() => {
    vi.mocked(apiFetch).mockImplementation(async (url, init) => {
      if (String(url).endsWith("/stats")) return response({ total: 1, breakdown: [] });
      if (String(url).endsWith("/search")) return response([{ id: "mem-1", content: "Remember the release checklist", metadata: {} }]);
      if (init?.method === "PATCH") return response({});
      return response({});
    });
  });

  it("searches and pins a memory with accessible, non-emoji controls", async () => {
    const user = userEvent.setup();
    render(<MemoryView />);

    await user.type(screen.getByPlaceholderText("Search memories…"), "release");
    await user.click(screen.getByRole("button", { name: "Search" }));
    await user.click(await screen.findByText("Remember the release checklist"));
    await user.click(screen.getByRole("button", { name: "Pin memory" }));

    await waitFor(() => expect(apiFetch).toHaveBeenCalledWith(
      "http://memories.test/v1/memories/mem-1",
      expect.objectContaining({ method: "PATCH" }),
    ));
    expect(screen.getByText("Pinned")).toBeTruthy();
    expect(document.body.textContent).not.toContain("📌");
  });
});
