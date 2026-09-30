import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}", "./node_modules/@databricks/appkit-ui/dist/react/ui/dialog.js"],
  theme: {
    extend: {
      colors: {
        canvas: "var(--canvas)",
        "canvas-subtle": "var(--canvas-subtle)",
        surface: "var(--surface)",
        "surface-glass": "var(--surface-glass)",
        ink: "var(--ink)",
        muted: "var(--muted)",
        line: "var(--line)",
        brand: "var(--brand)",
        "on-brand": "var(--on-brand)",
        "brand-ink": "var(--brand-ink)",
        accent: "var(--accent)",
        "accent-soft": "var(--accent-soft)",
        negative: "var(--negative)",
        positive: "var(--positive)",
        "data-purple": "var(--data-purple)",
        "data-slate": "var(--data-slate)",
        "data-neutral": "var(--data-neutral)",
        "chart-brand": "var(--chart-brand)",
        "chart-positive": "var(--chart-positive)",
        "chart-negative": "var(--chart-negative)",
        "chart-purple": "var(--chart-purple)",
        "chart-slate": "var(--chart-slate)",
        "chart-neutral": "var(--chart-neutral)",
        "positive-ink": "var(--positive-ink)",
        "negative-ink": "var(--negative-ink)",
        "data-purple-ink": "var(--data-purple-ink)",
        "data-slate-ink": "var(--data-slate-ink)",
        "positive-soft": "var(--positive-soft)",
        "positive-border": "var(--positive-border)",
        "on-positive": "var(--on-positive)",
        "negative-soft": "var(--negative-soft)",
        "negative-border": "var(--negative-border)",
        "neutral-soft": "var(--neutral-soft)",
        tooltip: "var(--tooltip)",
      },
      fontFamily: {
        sans: ["Outfit Variable", "Outfit", "ui-sans-serif", "system-ui", "sans-serif"],
      },
      boxShadow: {
        panel: "var(--shadow-panel)",
        floating: "var(--shadow-floating)",
      },
    },
  },
  plugins: [],
};

export default config;
