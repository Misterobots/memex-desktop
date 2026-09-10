import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { activityDetail, activityEvents, activityLabel, activityPresentation, outputsFromEvents, safeOutputUrl } from "../workspace-outputs";
import { normalizeSSEDelta } from "../sse-stream";
import { MessageBubble } from "../../components/chat/MessageBubble";
import type { ChatDisplayMode, ChatMessage, MessageEvent } from "../../types/memex";

vi.mock("../../components/views/ChatView", () => ({ useInspector: () => null }));

const delta = { type: "design_artifact", content: { html: "<h1>Real generated site</h1>", filename: "site.html" } };
const event = normalizeSSEDelta(delta)!;
const message: ChatMessage = { id: "answer", role: "assistant", content: "Design ready.", mode: "design", timestamp: 0, events: [event] };

describe("workspace output delivery", () => {
  it("recovers HTML from both new SSE and saved legacy log events", () => {
    expect(outputsFromEvents([event])[0].html).toBe(delta.content.html);
    const legacy: MessageEvent = { type: "log", content: JSON.stringify(delta.content), data: delta };
    expect(outputsFromEvents([legacy])[0].html).toBe(delta.content.html);
  });
  it.each<ChatDisplayMode>(["summary", "normal", "thought"])("keeps preview and source accessible in %s", (displayMode) => {
    const markup = renderToStaticMarkup(<MessageBubble message={message} displayMode={displayMode} />);
    expect(markup).toContain('sandbox="allow-scripts"');
    expect(markup).not.toContain("allow-same-origin");
    expect(markup).toContain("Real generated site");
    expect(markup).toContain("Download HTML");
    expect(markup).toContain(">Source<");
  });
  it("shows failure even in Brief and does not claim completion", () => {
    const failure = { ...message, content: "", events: [normalizeSSEDelta({ type: "error", content: "GPU unavailable" })!] };
    const markup = renderToStaticMarkup(<MessageBubble message={failure} displayMode="summary" />);
    expect(markup).toContain('role="alert"');
    expect(markup).toContain("GPU unavailable");
    expect(markup).not.toContain("Activity complete");
  });
  it("exposes a missing design artifact instead of silently succeeding", () => {
    const markup = renderToStaticMarkup(<MessageBubble message={{ ...message, events: [] }} />);
    expect(markup).toContain("delivered no preview");
  });
  it("renders research links, tables and code while leaving raw HTML inert", () => {
    const markup = renderToStaticMarkup(<MessageBubble message={{ ...message, mode: "research", events: [], content:
      '[Source](https://example.com)\n\n| Name | Value |\n| --- | --- |\n| Test | 1 |\n\n<script>alert(1)</script>' }} />);
    expect(markup).toContain('href="https://example.com"');
    expect(markup).toContain("<table");
    expect(markup).not.toContain("<script>");
  });
  it("normalizes known media URLs and rejects active/local URL schemes", () => {
    expect(safeOutputUrl("/api/backend/delivered_artifacts/result.png")).toBe("/delivered_artifacts/result.png");
    for (const url of ["javascript:alert(1)", "file:///secret", "//example.com", "/\\example.com"]) expect(safeOutputUrl(url)).toBeUndefined();
  });
  it("keeps progress concise without losing the Detailed history", () => {
    const events: MessageEvent[] = [
      { type: "status", content: "Design Studio: Generating HTML — 100 characters" },
      { type: "status", content: "Runtime is still waiting (10s)" },
      { type: "status", content: "Design Studio: Generating HTML — 500 characters" },
      event,
    ];
    expect(activityEvents(events, false).map((e) => e.content)).toEqual(["Design Studio: Generating HTML — 500 characters"]);
    expect(activityEvents(events, true)).toHaveLength(3);
  });
  it("turns raw runtime emoji logs into compact product activity labels", () => {
    expect(activityLabel("🎨 Design Studio: Generating HTML — 500 characters")).toBe("Generating design");
    expect(activityLabel("🧠 Neural Cortex: Analyzing intent...")).toBe("Choosing approach");
    expect(activityLabel("Request sent — preparing Memex…")).toBe("Preparing request");
    expect(activityDetail("Router started this turn.", "log")).toBe("Router started");
    expect(activityDetail("RESEARCH (95% confidence) forcing RESEARCH intent", "log")).toBe("Research route selected");
    expect(activityDetail("private scratchpad text", "thought")).toBe("Considering response");
    expect(activityDetail("unclassified runtime diagnostic", "log")).toBe("Runtime update");
    expect(activityDetail(" responding.\n", "status")).toBe("Streaming response");
    const activity: MessageEvent = { type: "status", content: "💬 Hive Mind: Thinking..." };
    const markup = renderToStaticMarkup(<MessageBubble message={{ ...message, content: "", events: [activity] }} />);
    expect(markup).toContain("Thinking");
    expect(markup).not.toContain("💬");
    expect(markup).not.toContain("Hive Mind");
    expect(renderToStaticMarkup(<MessageBubble message={{ ...message, content: "", events: [{ type: "status", content: "Turn complete" }] }} />)).not.toContain("Ready");
  });
  it("shows the detailed work trace rather than collapsing it into runtime disclosures", () => {
    const trace: MessageEvent[] = [
      { type: "log", content: "Router started this turn." },
      { type: "thought", content: "→ Research mode activated: forcing RESEARCH intent" },
      { type: "log", content: "Librarian started this turn." },
      { type: "log", content: "Response stream ended." },
    ];
    const markup = renderToStaticMarkup(<MessageBubble displayMode="thought" message={{ ...message, content: "", events: trace }} />);
    expect(markup).toContain("Reasoning and activity");
    expect(markup).toContain("Router started");
    expect(markup).toContain("Research route selected");
    expect(markup).toContain("Research agent started");
    expect(markup).toContain("Response complete");
    expect(markup).not.toContain("Runtime detail");
  });
  it("presents intent, commands, and progress as distinct user-readable channels", () => {
    expect(activityPresentation({ type: "thought", content: "Checking the project requirements", agent_name: "Coordinator" })).toMatchObject({
      tone: "intent", title: "Coordinator is assessing the task", detail: "Considering response",
    });
    expect(activityPresentation({ type: "tool_call_start", content: "run_command started.", data: { type: "tool_start", tool_name: "run_command", tool_input: { command: "npm test" } } })).toMatchObject({
      tone: "tool", title: "Running run_command", command: "npm test",
    });
    expect(activityPresentation({ type: "tool_call_result", content: "SECRET=value", data: { type: "tool_result", tool_name: "read_file", tool_output: "SECRET=value" } })).toMatchObject({
      tone: "tool", title: "read_file completed", detail: "Result received.", command: undefined,
    });
    expect(activityPresentation({ type: "status", content: "Coordinator updated the worker plan.", data: { type: "swarm_task_list" } })).toMatchObject({
      tone: "progress", title: "Coordinator updated the worker plan.",
    });
    const markup = renderToStaticMarkup(<MessageBubble displayMode="thought" message={{ ...message, content: "", events: [
      { type: "thought", content: "Checking the project requirements", agent_name: "Coordinator" },
      { type: "tool_call_start", content: "run_command started.", data: { type: "tool_start", tool_name: "run_command", tool_input: { command: "npm test" } } },
      { type: "status", content: "Coordinator updated the worker plan.", data: { type: "swarm_task_list" } },
    ] }} />);
    expect(markup).toContain("Intent");
    expect(markup).toContain("Command");
    expect(markup).toContain("Progress");
    expect(markup).toContain("border-pink-400/60");
  });
  it("shows runtime-marked execution summaries while keeping unmarked thought private", () => {
    expect(activityPresentation({ type: "thought", content: "I’m reviewing the selected workspace before making changes.", data: { type: "thought", safe_summary: true } })).toMatchObject({
      tone: "intent", title: "I’m reviewing the selected workspace before making changes.",
    });
    expect(activityPresentation({ type: "thought", content: "private scratchpad text" })).toMatchObject({
      tone: "intent", title: "Thinking", detail: "Considering response",
    });
  });
  it.each<ChatDisplayMode>(["summary", "normal", "thought"])("keeps real media and cancellation visible in %s", (displayMode) => {
    const media = normalizeSSEDelta({ type: "media_attachment", content: { filename: "test.png", mimeType: "image/png", url: "/api/backend/delivered_artifacts/test.png", downloadUrl: "/api/backend/delivered_artifacts/test.png?dl=1" } })!;
    const markup = renderToStaticMarkup(<MessageBubble displayMode={displayMode} message={{ ...message, content: "", events: [media, { type: "status", content: "Stopped by you.", data: { type: "cancelled" } }] }} />);
    expect(markup).toContain('src="/delivered_artifacts/test.png"');
    expect(markup).toContain('href="/delivered_artifacts/test.png?dl=1"');
    expect(markup).toContain("partial output is preserved");
  });
  it("warns about a disconnected partial response but not a completed stream", () => {
    const partial = { ...message, content: "Partial answer", events: [{ type: "status" as const, content: "Started", data: { type: "stream_started" } }] };
    expect(renderToStaticMarkup(<MessageBubble message={partial} displayMode="summary" />)).toContain("connection may have been interrupted");
    partial.events.push({ type: "status", content: "Ended", data: { type: "stream_complete" } });
    expect(renderToStaticMarkup(<MessageBubble message={partial} />)).not.toContain("connection may have been interrupted");
  });
  it("makes file-only references explicit instead of inventing a link", () => {
    const file = normalizeSSEDelta({ type: "artifact", content: { name: "model.stl", path: "/runtime/model.stl" } })!;
    const markup = renderToStaticMarkup(<MessageBubble message={{ ...message, content: "", events: [file] }} />);
    expect(markup).toContain("without a downloadable URL");
    expect(markup).not.toContain('href="/runtime/model.stl"');
  });
});
