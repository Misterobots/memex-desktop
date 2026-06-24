/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Anthropic warm-dark palette
        canvas:   "#262624",   // app background (warm dark)
        surface:  "#30302e",   // raised surfaces (sidebar, cards)
        surface2: "#3a3937",   // hover / nested
        border:   "#403e3c",   // subtle warm border
        text:     "#f5f4ef",   // warm off-white
        muted:    "#a3a096",   // warm gray
        faint:    "#6f6d66",   // very muted
        accent:   "#d97757",   // Claude coral
        accentdim:"#bd6248",   // coral pressed
        green:    "#7cae7a",   // muted sage (connected)
        yellow:   "#d4a85f",   // warm amber
        red:      "#d97066",   // warm red
        userbubble:"#3a3937",  // user message bubble
      },
      fontFamily: {
        sans: ["ui-sans-serif", "system-ui", "-apple-system", "'Segoe UI'", "sans-serif"],
        mono: ["'Cascadia Code'", "'Fira Code'", "'SF Mono'", "Consolas", "monospace"],
      },
      maxWidth: {
        conversation: "768px",
      },
    },
  },
  plugins: [],
};
