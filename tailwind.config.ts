import type { Config } from "tailwindcss";

// Palette from the pond-monitoring mockups: a dark, green-tinted ground with a
// single teal accent. Status colours are reserved for status, never decoration.
const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./lib/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: {
          950: "#0B1210", // page ground
          900: "#0D1513", // side panels
          850: "#0E1614", // sunken wells, inputs
          800: "#121A18", // cards
          750: "#16211E", // raised bars
        },
        line: {
          faint: "#141E1B",
          soft: "#1A2421",
          DEFAULT: "#1F2B27",
          strong: "#26332F",
          dash: "#2A3833",
        },
        tx: {
          strong: "#F4FAF8",
          DEFAULT: "#E7EEEC",
          soft: "#C9D6D2",
          muted: "#9AABA6",
          dim: "#8A9A95",
          faint: "#6B7C77",
          ghost: "#4C5B56",
          off: "#34413D",
        },
        accent: { DEFAULT: "#2DD4BF", ink: "#06110E", hover: "#7FF4DC" },
        warn: "#FBBF24",
        bad: { DEFAULT: "#F87171", soft: "#FCA5A5" },
        good: "#4ADE80",
        violet: "#C084FC",
        sky: "#38BDF8",
        rose: "#F9A8D4",
        moon: "#F5E6B8",
      },
      fontFamily: {
        sans: ["var(--font-grotesk)", "system-ui", "sans-serif"],
        mono: ["var(--font-plex-mono)", "ui-monospace", "monospace"],
      },
    },
  },
  plugins: [],
};

export default config;
