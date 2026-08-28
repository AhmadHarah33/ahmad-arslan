import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Mars brand-ish palette: warm rust accent on a clean neutral base.
        brand: {
          50: "#fef3f0",
          100: "#fde3dc",
          200: "#facabd",
          300: "#f5a48d",
          400: "#ee7355",
          500: "#e14e2c",
          600: "#cf3a1c",
          700: "#ac2c19",
          800: "#8d271b",
          900: "#75261c",
        },
        ink: {
          DEFAULT: "#1f2430",
          muted: "#5b6472",
          faint: "#8a93a3",
        },
        surface: {
          DEFAULT: "#ffffff",
          soft: "#f7f8fa",
          border: "#e6e8ec",
        },
      },
      fontFamily: {
        sans: [
          "-apple-system",
          "BlinkMacSystemFont",
          "Segoe UI",
          "Roboto",
          "Helvetica Neue",
          "Arial",
          "sans-serif",
        ],
      },
      boxShadow: {
        card: "0 1px 2px rgba(16,24,40,0.04), 0 1px 3px rgba(16,24,40,0.08)",
        pop: "0 8px 24px rgba(16,24,40,0.12)",
      },
      borderRadius: {
        xl: "0.875rem",
        "2xl": "1.125rem",
      },
    },
  },
  plugins: [],
};

export default config;
