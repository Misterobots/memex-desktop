// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { InputBar } from "../../components/layout/InputBar";
import { SessionList } from "../../components/sidebar/SessionList";
import { DiffReviewModal } from "../../components/shared/DiffReviewModal";
import { ShortcutCapture } from "../../components/settings/ShortcutCapture";
import { MessageOutputs } from "../../components/chat/MessageOutputs";
import { ScheduledTasks } from "../../components/scheduled/ScheduledTasks";
import { useStore } from "../store";
import { streamChat, type StreamOptions } from "../sse-stream";
import { createTrigger, listTriggers, resumeTrigger } from "../trigger-api";

vi.mock("../sse-stream", () => ({ streamChat: vi.fn() }));
vi.mock("../conv-sync", () => ({ pushSession: vi.fn(), deleteRemoteSession: vi.fn() }));
vi.mock("../../components/layout/ModelPickerPopover", () => ({ ModelPickerPopover: () => null }));
vi.mock("../../components/layout/ContextMeter", () => ({ ContextMeter: () => null }));
vi.mock("../trigger-api", () => ({ listTriggers: vi.fn(), createTrigger: vi.fn(), pauseTrigger: vi.fn(), resumeTrigger: vi.fn(), deleteTrigger: vi.fn() }));

let stop = vi.fn<() => void>();
beforeEach(() => {
  vi.clearAllMocks();
  delete window.memex;
  localStorage.clear();
  useStore.setState({ sessions: [], activeSessionIds: {}, workspaceDisplayModes: {}, workspaceRunPreferences: {}, streamingSessions: {}, stopStreams: {}, activeTab: "chat", mode: "chat", selectedModel: "qwen3:14b" });
  stop = vi.fn<() => void>();
  vi.mocked(streamChat).mockReturnValue(stop);
  vi.mocked(listTriggers).mockResolvedValue({ status: 200, triggers: [] });
});
afterEach(cleanup);

describe("desktop parity interaction contracts (mocked runtime)", () => {
  it("shows Collective while sending/storing legacy swarm and stops the owning stream", async () => {
    const user = userEvent.setup();
    render(<InputBar lockMode="swarm" experience="code" workspaceKey="C:/alpha" />);
    expect(screen.getByText("Collective")).toBeTruthy();
    await user.selectOptions(screen.getByRole("combobox", { name: "Output detail" }), "high");
    await user.selectOptions(screen.getByRole("combobox", { name: "Reasoning summary" }), "detailed");
    await user.selectOptions(screen.getByRole("combobox", { name: "Reasoning effort" }), "high");
    await user.type(screen.getByRole("textbox"), "Build a local example{enter}");
    const request = vi.mocked(streamChat).mock.calls[0][0];
    expect(request).toMatchObject({ mode: "swarm", style: "explanatory", modeFlags: { swarm_mode: true, ultrathink_mode: true }, workspaceKey: "C:/alpha" });
    const session = useStore.getState().activeSession("code", "C:/alpha")!;
    expect(session.displayMode).toBe("thought");
    expect(session.messages[0].mode).toBe("swarm");
    await user.click(screen.getByRole("button", { name: "Stop" }));
    expect(stop).toHaveBeenCalledOnce();
    expect(useStore.getState().streamingSessions[session.id]).toBe(false);
    expect(useStore.getState().activeSession("code", "C:/alpha")!.messages.at(-1)!.events.at(-1)!.data?.type).toBe("cancelled");
  });

  it("requires a Gauntlet quality bar and serializes it with Collective orchestration", async () => {
    useStore.setState({ mode: "gauntlet" });
    const user = userEvent.setup();
    render(<InputBar experience="design" />);
    await user.type(screen.getByRole("textbox", { name: "" }), "Create a product page{enter}");
    expect(streamChat).not.toHaveBeenCalled();
    expect(screen.getByRole("alert").textContent).toContain("named, fetchable reference");
    await user.type(screen.getByRole("textbox", { name: "Gauntlet quality bar" }), "Stripe's pricing page");
    await user.click(screen.getByRole("button", { name: "Send" }));
    expect(vi.mocked(streamChat).mock.calls[0][0]).toMatchObject({
      mode: "gauntlet", gauntletBar: "Stripe's pricing page", modeFlags: { swarm_mode: true, gauntlet_mode: true },
    });
  });

  it("keeps the selected model when Product Design or Sites locks design mode", async () => {
    useStore.setState({ selectedModel: "gemma3:12b" });
    const user = userEvent.setup();
    render(<InputBar lockMode="design" experience="sites" />);
    await user.type(screen.getByRole("textbox"), "Create a responsive launch page{enter}");

    const request = vi.mocked(streamChat).mock.calls[0][0];
    const siteSession = useStore.getState().activeSession("sites");
    expect(request).toMatchObject({
      mode: "design",
      model: "gemma3:12b",
      modeFlags: { design_mode: true },
    });
    expect(request.sessionId).toBe(siteSession?.id);
  });

  it("keeps Shift+Enter as a newline and allows another send after stream failure", async () => {
    const user = userEvent.setup();
    render(<InputBar />);
    const input = screen.getByRole("textbox");
    await user.type(input, "First{Shift>}{Enter}{/Shift}Second");
    expect(streamChat).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Send" }));
    const request = vi.mocked(streamChat).mock.calls[0][0] as StreamOptions;
    expect(request.messages.at(-1)!.content).toBe("First\nSecond");
    act(() => request.onError(new Error("Test transport failure")));
    await user.type(input, "Retry explicitly{enter}");
    expect(streamChat).toHaveBeenCalledTimes(2);
  });

  it("switches only scoped sessions without cancelling another thread's stream", async () => {
    const store = useStore.getState();
    const first = store.createSession("code", "C:/alpha");
    store.addMessage(first, { id: "first", role: "user", content: "Alpha first", events: [], timestamp: 1, mode: "swarm" });
    const second = store.createSession("code", "C:/alpha");
    store.addMessage(second, { id: "second", role: "user", content: "Alpha second", events: [], timestamp: 2, mode: "swarm" });
    const other = store.createSession("code", "C:/beta");
    store.setStreaming(second, true, stop);
    render(<SessionList experience="code" workspaceKey="C:/alpha" />);
    await userEvent.setup().click(screen.getByRole("button", { name: "Alpha first" }));
    expect(store.activeSession("code", "C:/alpha")!.id).toBe(first);
    expect(store.activeSession("code", "C:/beta")!.id).toBe(other);
    expect(useStore.getState().streamingSessions[second]).toBe(true);
    expect(stop).not.toHaveBeenCalled();
  });

  it("requires distinct explicit approve/reject actions in diff review", async () => {
    const approve = vi.fn(), reject = vi.fn();
    render(<DiffReviewModal filePath="example.txt" oldContent="old" newContent="new" onApprove={approve} onReject={reject} />);
    expect(approve).not.toHaveBeenCalled();
    await userEvent.setup().click(screen.getByRole("button", { name: "Reject" }));
    expect(reject).toHaveBeenCalledOnce();
    expect(approve).not.toHaveBeenCalled();
    await userEvent.setup().click(screen.getByRole("button", { name: "Approve write" }));
    expect(approve).toHaveBeenCalledOnce();
  });

  it("captures shortcuts and lets Escape cancel rebinding", async () => {
    const change = vi.fn();
    render(<ShortcutCapture value="Control+K" onChange={change} />);
    const button = screen.getByRole("button");
    await userEvent.setup().click(button);
    fireEvent.keyDown(button, { key: "Escape" });
    expect(change).not.toHaveBeenCalled();
    await userEvent.setup().click(button);
    fireEvent.keyDown(button, { key: "j", ctrlKey: true, shiftKey: true });
    expect(change).toHaveBeenCalledWith("Control+Shift+J");
  });

  it("switches generated HTML between preview/source and expands its pane", async () => {
    const user = userEvent.setup();
    render(<MessageOutputs events={[{ type: "artifact", content: "", data: { type: "design_artifact", content: { filename: "test.html", html: "<h1>Preview test</h1>" } } }]} />);
    expect(screen.getByTitle("test.html preview").getAttribute("sandbox")).toBe("allow-scripts");
    await user.click(screen.getByRole("button", { name: "Source" }));
    expect(screen.queryByTitle("test.html preview")).toBeNull();
    expect(screen.getByText("<h1>Preview test</h1>")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Preview" }));
    await user.click(screen.getByRole("button", { name: "Expand preview" }));
    expect(screen.getByRole("button", { name: "Compact preview" }).getAttribute("aria-expanded")).toBe("true");
  });

  it("uses the native save dialog for HTML output when running in Desktop", async () => {
    const saveText = vi.fn().mockResolvedValue({ canceled: false, path: "C:/Users/Memex/Downloads/test.html" });
    window.memex = { isDesktop: true, dialog: { saveText } } as never;
    render(<MessageOutputs events={[{ type: "artifact", content: "", data: { type: "design_artifact", content: { filename: "test.html", html: "<h1>Native save</h1>" } } }]} />);
    await userEvent.setup().click(screen.getByRole("button", { name: "Download HTML" }));
    await waitFor(() => expect(saveText).toHaveBeenCalledWith("test.html", "<h1>Native save</h1>", "text/html"));
    expect(screen.getByRole("status").textContent).toContain("Saved C:/Users/Memex/Downloads/test.html.");
  });

  it("renders live audio, video, and downloadable file outputs without inventing a preview", () => {
    const event = (type: string, content: Record<string, unknown>) => ({ type: "artifact" as const, content: "", data: { type, content } });
    const { container } = render(<MessageOutputs events={[
      event("media_attachment", { filename: "voice.wav", mimeType: "audio/wav", url: "/delivered_artifacts/voice.wav", downloadUrl: "/delivered_artifacts/voice.wav?dl=1" }),
      event("media_attachment", { filename: "clip.mp4", mimeType: "video/mp4", url: "/delivered_artifacts/clip.mp4", downloadUrl: "/delivered_artifacts/clip.mp4?dl=1" }),
      event("artifact", { filename: "report.pdf", mimeType: "application/pdf", url: "/delivered_artifacts/report.pdf", downloadUrl: "/delivered_artifacts/report.pdf?dl=1" }),
    ]} />);
    expect(container.querySelector("audio")?.getAttribute("src")).toContain("/delivered_artifacts/voice.wav");
    expect(container.querySelector("video")?.getAttribute("src")).toContain("/delivered_artifacts/clip.mp4");
    expect(screen.getByText("Use Open / download to view this file.")).toBeTruthy();
    expect(screen.getAllByRole("link", { name: "Open / download" })).toHaveLength(3);
  });

  it.each(["Daily", "Repeating", "One-time"])("serializes Collective schedules with swarm_mode for %s", async (schedule) => {
    vi.mocked(createTrigger).mockResolvedValue({ status: 200 });
    const user = userEvent.setup();
    render(<ScheduledTasks />);
    await user.click(screen.getByRole("button", { name: "+ New scheduled task" }));
    await user.type(screen.getByPlaceholderText("Task name"), "QA only");
    await user.type(screen.getByPlaceholderText("Prompt to run when this fires…"), "Test prompt");
    await user.click(screen.getByRole("button", { name: schedule }));
    await user.click(screen.getByRole("checkbox", { name: "Run in Collective mode" }));
    await user.click(screen.getByRole("button", { name: "Create" }));
    expect(createTrigger).toHaveBeenCalledWith(expect.objectContaining({ task_config: { prompt: "Test prompt", swarm_mode: true } }));
  });

  it("retries a failed schedule load and resumes only the selected schedule", async () => {
    vi.mocked(listTriggers).mockResolvedValueOnce({ status: 0, triggers: [] }).mockResolvedValue({ status: 200, triggers: [{ trigger_id: "qa", name: "QA", state: "paused", trigger_type: "interval", interval_seconds: 60, fire_count: 0, created_at: 0 }] });
    vi.mocked(resumeTrigger).mockResolvedValue(true);
    render(<ScheduledTasks />);
    await userEvent.setup().click(await screen.findByRole("button", { name: "Retry" }));
    await userEvent.setup().click(await screen.findByRole("button", { name: "Resume" }));
    await waitFor(() => expect(resumeTrigger).toHaveBeenCalledWith("qa"));
  });
});
