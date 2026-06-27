import { useState } from "react";

/** Build an Electron accelerator string from a keydown event. */
function toAccelerator(e: React.KeyboardEvent): string | null {
  const key = e.key;
  if (["Control", "Meta", "Alt", "Shift"].includes(key)) return null; // modifier-only
  const parts: string[] = [];
  if (e.ctrlKey)  parts.push("Control");
  if (e.metaKey)  parts.push("Command");
  if (e.altKey)   parts.push("Alt");
  if (e.shiftKey) parts.push("Shift");
  let main = key;
  if (key === " ")          main = "Space";
  else if (key.length === 1) main = key.toUpperCase();
  // multi-char keys (ArrowUp, Enter, F1, …) pass through — Electron accepts them
  parts.push(main);
  return parts.join("+");
}

/** Press-to-rebind control. Click, then press the desired combo. */
export function ShortcutCapture({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [capturing, setCapturing] = useState(false);
  return (
    <button
      onClick={() => setCapturing(true)}
      onBlur={() => setCapturing(false)}
      onKeyDown={(e) => {
        if (!capturing) return;
        e.preventDefault();
        if (e.key === "Escape") { setCapturing(false); return; }
        const acc = toAccelerator(e);
        if (acc) { onChange(acc); setCapturing(false); }
      }}
      className={`px-3 py-1.5 rounded-lg border text-xs font-mono min-w-[170px] text-left transition-colors
        ${capturing
          ? "border-accent/60 text-accent bg-accent/10"
          : "border-border/60 text-text hover:bg-surface2/60"}`}
    >
      {capturing ? "Press keys… (Esc to cancel)" : value}
    </button>
  );
}
