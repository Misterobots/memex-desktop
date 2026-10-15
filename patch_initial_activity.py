from pathlib import Path
path = Path(__file__).parent / "src" / "components" / "layout" / "InputBar.tsx"
text = path.read_text(encoding="utf-8")
old = '''    if (experience === "code") {
      appendEvent(sessionId, assistantId, {
        type: "status",
        content: "Starting Code agent…",
      });
    }
'''
new = '''    const activityLabel = experience === "code" ? "Starting Code agent…"
      : experience === "sites" ? "Request sent — preparing the site workspace…"
      : experience === "product_design" ? "Request sent — preparing the design workspace…"
      : experience === "research" ? "Request sent — preparing research…"
      : "Request sent — preparing Memex…";
    appendEvent(sessionId, assistantId, { type: "status", content: activityLabel });
'''
if old not in text: raise SystemExit("initial Code activity block missing")
path.write_text(text.replace(old, new, 1), encoding="utf-8")
