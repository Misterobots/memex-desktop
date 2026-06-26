/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Memex near-black palette with teal brand accent
        canvas:   "#0a0a0d",   // app background (near black)
        surface:  "#111114",   // raised surfaces (sidebar, cards)
        surface2: "#1c1c21",   // hover / nested / elevated
        border:   "#26262b",   // subtle neutral border
        text:     "#ededf0",   // off-white
        muted:    "#8b8b94",   // neutral gray
        faint:    "#5b5b66",   // very muted / tertiary
        accent:   "#00cca8",   // Memex teal (brand)
        accentdim:"#00a88c",   // teal pressed
        accent2:  "#9580ff",   // secondary accent (purple)
        green:    "#34d399",   // emerald (connected)
        yellow:   "#e0b341",   // amber (warning / checking)
        red:      "#f06d6d",   // red (error)
        userbubble:"#16161a",  // user message bubble
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
