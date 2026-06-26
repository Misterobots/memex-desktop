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
        background:  "#111114",
        foreground:  "#ededf0",
        cursor:      "#00cca8",
        cursorAccent:"#111114",
        selectionBackground: "rgba(0,204,168,0.3)",
        black:   "#111114", brightBlack:   "#5b5b66",
        red:     "#f06d6d", brightRed:     "#ff8080",
        green:   "#34d399", brightGreen:   "#5ee9b5",
        yellow:  "#e0b341", brightYellow:  "#f0c95e",
        blue:    "#7a9fc2", brightBlue:    "#8bafd2",
        magenta: "#9580ff", brightMagenta: "#ad9bff",
        cyan:    "#00cca8", brightCyan:    "#00eed0",
        white:   "#ededf0", brightWhite:   "#ffffff",
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
      className={`bg-surface ${className}`}
      style={{ padding: "8px 4px" }}
    />
  );
}
