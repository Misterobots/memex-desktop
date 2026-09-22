// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ModelPickerPopover } from "./ModelPickerPopover";
import { useStore } from "../../lib/store";

describe("ModelPickerPopover", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    useStore.setState({
      selectedModel: "qwen3:8b",
    });

    window.memex = {
      config: {
        getActive: vi.fn().mockResolvedValue({
          id: "local",
          providerType: "external",
          defaultModel: "qwen3:8b",
        }),
        save: vi.fn().mockResolvedValue(undefined),
        onChange: vi.fn().mockReturnValue(() => {}),
      },
      ollama: {
        listModels: vi.fn().mockResolvedValue([]),
        contextLength: vi.fn().mockResolvedValue(32768),
        getLoadedModels: vi.fn().mockResolvedValue([
          {
            name: "qwen3:8b",
            model: "qwen3:8b",
            sizeGb: 5.2,
            vramGb: 5.2,
            host: "http://127.0.0.1:11434",
          },
        ]),
        unloadModel: vi.fn().mockResolvedValue({ ok: true, unloaded: ["qwen3:8b"] }),
      },
    } as unknown as typeof window.memex;
  });

  afterEach(cleanup);

  it("renders trigger button and shows In VRAM indicator when a model is resident", async () => {
    render(<ModelPickerPopover />);

    // Waits for access permissions and initial loaded models fetch
    await waitFor(() => {
      expect(screen.getAllByTitle(/resident in VRAM/i).length).toBeGreaterThan(0);
    });

    expect(screen.getByRole("button", { name: /qwen3 8b/i })).toBeTruthy();
  });

  it("opens popover, shows resident VRAM banner, and calls unloadModel on click", async () => {
    const user = userEvent.setup();
    render(<ModelPickerPopover />);

    await waitFor(() => {
      expect(screen.getAllByTitle(/resident in VRAM/i).length).toBeGreaterThan(0);
    });

    // Click trigger to open popover
    await user.click(screen.getByRole("button", { name: /qwen3 8b/i }));

    // Popover is open: check VRAM status banner
    await waitFor(() => {
      expect(screen.getByText("In VRAM")).toBeTruthy();
      expect(screen.getByText("5.2 GB")).toBeTruthy();
      expect(screen.getByRole("button", { name: /Unload/i })).toBeTruthy();
    });

    // Click Unload
    const unloadBtn = screen.getByRole("button", { name: /Unload/i });
    await user.click(unloadBtn);

    expect(window.memex?.ollama.unloadModel).toHaveBeenCalledWith("qwen3:8b");
  });
});
