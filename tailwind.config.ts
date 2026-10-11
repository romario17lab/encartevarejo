import type { Config } from "tailwindcss";

// Tokens da interface da plataforma (não dos modelos de encarte). Valores em src/app/globals.css.
// Documentação e contrastes: docs/03-design.md.
export default {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: { DEFAULT: "rgb(var(--ev-brand) / <alpha-value>)", strong: "rgb(var(--ev-brand-strong) / <alpha-value>)", soft: "rgb(var(--ev-brand-soft) / <alpha-value>)" },
        accent: "rgb(var(--ev-accent) / <alpha-value>)",
        highlight: "rgb(var(--ev-highlight) / <alpha-value>)",
        ink: { DEFAULT: "rgb(var(--ev-ink) / <alpha-value>)", muted: "rgb(var(--ev-ink-muted) / <alpha-value>)" },
        surface: { DEFAULT: "rgb(var(--ev-surface) / <alpha-value>)", alt: "rgb(var(--ev-surface-alt) / <alpha-value>)" },
        line: { DEFAULT: "rgb(var(--ev-line) / <alpha-value>)", strong: "rgb(var(--ev-line-strong) / <alpha-value>)" },
        success: "rgb(var(--ev-success) / <alpha-value>)",
        warning: "rgb(var(--ev-warning) / <alpha-value>)",
        danger: "rgb(var(--ev-danger) / <alpha-value>)",
      },
      fontFamily: { sans: ["Inter", "system-ui", "sans-serif"], display: ["Montserrat", "Inter", "sans-serif"] },
      borderRadius: { xl: "12px", "2xl": "20px" },
      boxShadow: { card: "var(--ev-shadow)" },
      spacing: { 13: "3.25rem", 18: "4.5rem" },
      minHeight: { tap: "44px" },
    },
  },
  plugins: [],
} satisfies Config;
