/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        canvas:  "#0d1117",
        surface: "#161b22",
        border:  "#30363d",
        text:    "#e6edf3",
        muted:   "#8b949e",
        accent:  "#58a6ff",
        green:   "#3fb950",
        yellow:  "#d29922",
        red:     "#f85149",
        bubble:  "#1f2937",
      },
      fontFamily: {
        mono: ["'Cascadia Code'", "'Fira Code'", "Consolas", "monospace"],
      },
    },
  },
  plugins: [],
};
