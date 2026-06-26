import { useEffect, useRef, useCallback } from "react";
import { Terminal } from "xterm";
import { FitAddon } from "@xterm/addon-fit";
import { WebLinksAddon } from "@xterm/addon-web-links";
import "xterm/css/xterm.css";
import { desktop } from "../../lib/desktop";

interface Props {
  id: string;
  cwd?: string;
  className?: string;
}

export function TerminalPane({ id, cwd, className = "" }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const termRef      = useRef<Terminal | null>(null);
  const fitRef       = useRef<FitAddon | null>(null);
  const cleanupRef   = useRef<Array<() => void>>([]);

  const fit = useCallback(() => {
    if (!fitRef.current || !termRef.current) return;
    try {
      fitRef.current.fit();
      const { cols, rows } = termRef.current;
      desktop()?.pty.resize(id, cols, rows);
    } catch {}
  }, [id]);

  useEffect(() => {
    if (!containerRef.current) return;

    const term = new Terminal({
      theme: {
        background:  "#1a1917",
        foreground:  "#e8e6e0",
        cursor:      "#d97757",
        cursorAccent:"#1a1917",
        selectionBackground: "rgba(217,119,87,0.3)",
        black:   "#1a1917", brightBlack:   "#6f6d66",
        red:     "#d97066", brightRed:     "#e88077",
        green:   "#7cae7a", brightGreen:   "#8dbe8b",
        yellow:  "#d4a85f", brightYellow:  "#e4b86f",
        blue:    "#7a9fc2", brightBlue:    "#8bafd2",
        magenta: "#b48ead", brightMagenta: "#c49ebd",
        cyan:    "#7ec8c8", brightCyan:    "#8ed8d8",
        white:   "#e8e6e0", brightWhite:   "#f5f4ef",
      },
      fontFamily: "'Cascadia Code', 'Fira Code', 'SF Mono', Consolas, monospace",
      fontSize: 13,
      lineHeight: 1.4,
      cursorBlink: true,
      cursorStyle: "bar",
      scrollback: 5000,
      allowTransparency: true,
    });

    const fitAddon  = new FitAddon();
    const linkAddon = new WebLinksAddon();
    term.loadAddon(fitAddon);
    term.loadAddon(linkAddon);
    term.open(containerRef.current);

    termRef.current = term;
    fitRef.current  = fitAddon;

    // Slight delay to let the container settle before fitting
    setTimeout(fit, 50);

    const bridge = desktop();
    if (bridge) {
      bridge.pty.create(id, cwd).then(() => {
        const offData = bridge.pty.onData(id, (data: string) => term.write(data));
        const offExit = bridge.pty.onExit(id, () => {
          term.write("\r\n\x1b[90m[process exited]\x1b[0m\r\n");
        });
        cleanupRef.current.push(offData, offExit);
      });

      // onData captures all input including paste and control sequences,
      // unlike onKey which only fires for single keystrokes.
      const onData = term.onData((data) => bridge.pty.write(id, data));
      cleanupRef.current.push(() => onData.dispose());
    } else {
      term.write("\x1b[90mTerminal requires the Memex Desktop app.\x1b[0m\r\n");
    }

    const ro = new ResizeObserver(fit);
    ro.observe(containerRef.current);
    cleanupRef.current.push(() => ro.disconnect());

    return () => {
      cleanupRef.current.forEach((fn) => fn());
      cleanupRef.current = [];
      desktop()?.pty.kill(id);
      term.dispose();
      termRef.current = null;
      fitRef.current  = null;
    };
  }, [id, cwd]);

  return (
    <div
      ref={containerRef}
      className={`bg-[#1a1917] ${className}`}
      style={{ padding: "8px 4px" }}
    />
  );
}
