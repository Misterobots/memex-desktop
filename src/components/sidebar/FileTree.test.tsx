// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { FileTree } from "./FileTree";
import { ipc } from "../../lib/ipc";

vi.mock("../../lib/ipc", () => ({
  ipc: {
    readDir: vi.fn(),
    writeFile: vi.fn(),
    mkdir: vi.fn(),
    delete: vi.fn(),
    rename: vi.fn(),
    copy: vi.fn(),
    openFiles: vi.fn(),
  },
}));

describe("FileTree", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(ipc.readDir).mockResolvedValue([]);
  });

  afterEach(() => {
    cleanup();
  });

  it("renders explorer toolbar controls and root folder name", async () => {
    vi.mocked(ipc.readDir).mockResolvedValueOnce([
      { name: "src", path: "/workspace/src", isDir: true },
      { name: "README.md", path: "/workspace/README.md", isDir: false },
    ]);

    render(<FileTree root="/workspace" />);

    expect(screen.getByTitle("New File (at workspace root)")).toBeDefined();
    expect(screen.getByTitle("New Folder (at workspace root)")).toBeDefined();
    expect(screen.getByTitle("Add / Import into workspace...")).toBeDefined();
    expect(screen.getByTitle("Refresh")).toBeDefined();
    expect(screen.getByTitle("Collapse All")).toBeDefined();

    await waitFor(() => {
      expect(screen.getByText("src")).toBeDefined();
      expect(screen.getByText("README.md")).toBeDefined();
    });
  });

  it("opens inline creation row on New File click and creates file", async () => {
    vi.mocked(ipc.writeFile).mockResolvedValueOnce(undefined as any);

    render(<FileTree root="/workspace" />);

    const newFileBtn = screen.getByTitle("New File (at workspace root)");
    fireEvent.click(newFileBtn);

    const input = screen.getByPlaceholderText("filename.ext") as HTMLInputElement;
    expect(input).toBeDefined();

    fireEvent.change(input, { target: { value: "index.ts" } });
    fireEvent.keyDown(input, { key: "Enter", code: "Enter" });

    await waitFor(() => {
      expect(ipc.writeFile).toHaveBeenCalledWith(
        expect.stringMatching(/[/\\]workspace[/\\]index\.ts/),
        ""
      );
    });
  });

  it("opens inline creation row on New Folder click and creates folder", async () => {
    vi.mocked(ipc.mkdir).mockResolvedValueOnce(undefined as any);

    render(<FileTree root="/workspace" />);

    const newFolderBtn = screen.getByTitle("New Folder (at workspace root)");
    fireEvent.click(newFolderBtn);

    const input = screen.getByPlaceholderText("folder-name") as HTMLInputElement;
    expect(input).toBeDefined();

    fireEvent.change(input, { target: { value: "assets" } });
    fireEvent.keyDown(input, { key: "Enter", code: "Enter" });

    await waitFor(() => {
      expect(ipc.mkdir).toHaveBeenCalledWith(
        expect.stringMatching(/[/\\]workspace[/\\]assets/)
      );
    });
  });

  it("allows renaming a file via inline rename input", async () => {
    vi.mocked(ipc.readDir).mockResolvedValueOnce([
      { name: "old_name.ts", path: "/workspace/old_name.ts", isDir: false },
    ]);
    vi.mocked(ipc.rename).mockResolvedValueOnce(true);

    render(<FileTree root="/workspace" />);

    await waitFor(() => {
      expect(screen.getByText("old_name.ts")).toBeDefined();
    });

    const renameBtn = screen.getByTitle("Rename");
    fireEvent.click(renameBtn);

    const input = screen.getByDisplayValue("old_name.ts") as HTMLInputElement;
    expect(input).toBeDefined();

    fireEvent.change(input, { target: { value: "new_name.ts" } });
    fireEvent.keyDown(input, { key: "Enter", code: "Enter" });

    await waitFor(() => {
      expect(ipc.rename).toHaveBeenCalledWith(
        "/workspace/old_name.ts",
        expect.stringMatching(/[/\\]workspace[/\\]new_name\.ts/)
      );
    });
  });

  it("deletes a file when delete button is clicked and confirmed", async () => {
    vi.mocked(ipc.readDir).mockResolvedValueOnce([
      { name: "to_delete.txt", path: "/workspace/to_delete.txt", isDir: false },
    ]);
    vi.mocked(ipc.delete).mockResolvedValueOnce(true);
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);

    render(<FileTree root="/workspace" />);

    await waitFor(() => {
      expect(screen.getByText("to_delete.txt")).toBeDefined();
    });

    const deleteBtn = screen.getByTitle("Delete");
    fireEvent.click(deleteBtn);

    expect(confirmSpy).toHaveBeenCalled();
    await waitFor(() => {
      expect(ipc.delete).toHaveBeenCalledWith("/workspace/to_delete.txt");
    });

    confirmSpy.mockRestore();
  });

  it("imports selected files into root directory", async () => {
    vi.mocked(ipc.openFiles).mockResolvedValueOnce(["C:\\Downloads\\asset.png"]);
    vi.mocked(ipc.copy).mockResolvedValueOnce(true);

    render(<FileTree root="/workspace" />);

    const importMenuBtn = screen.getByTitle("Add / Import into workspace...");
    fireEvent.click(importMenuBtn);

    const importFilesBtn = screen.getByText("Import Files...");
    fireEvent.click(importFilesBtn);

    await waitFor(() => {
      expect(ipc.openFiles).toHaveBeenCalledWith(
        expect.objectContaining({ multiSelections: true })
      );
      expect(ipc.copy).toHaveBeenCalledWith(
        "C:\\Downloads\\asset.png",
        expect.stringMatching(/[/\\]workspace[/\\]asset\.png/)
      );
    });
  });
});
