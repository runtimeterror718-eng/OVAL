import type { Config } from "tailwindcss";
import colors from "tailwindcss/colors";

const config: Config = {
  darkMode: "class",
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
    // Tremor needs its own package scanned for Tailwind classes
    "./node_modules/@tremor/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    transparent: "transparent",
    current: "currentColor",
    extend: {
      colors: {
        background: "var(--background)",
        foreground: "var(--foreground)",
        // Brand colors as DEFAULT, spreading the built-in scales so
        // utilities like fill-amber-400 / text-purple-600 keep working
        purple: { ...colors.purple, DEFAULT: "#534AB7" },
        teal: { ...colors.teal, DEFAULT: "#1D9E75" },
        coral: "#D85A30",
        pink: { ...colors.pink, DEFAULT: "#D4537E" },
        brandblue: "#378ADD",
        amber: { ...colors.amber, DEFAULT: "#BA7517" },
        danger: "#E24B4A",
        healthy: "#639922",
        // Tremor color system
        tremor: {
          brand: {
            faint: "#eff6ff",
            muted: "#bfdbfe",
            subtle: "#60a5fa",
            DEFAULT: "#3b82f6",
            emphasis: "#1d4ed8",
            inverted: "#ffffff",
          },
          background: {
            muted: "#f9fafb",
            subtle: "#f3f4f6",
            DEFAULT: "var(--background)",
            emphasis: "#374151",
          },
          border: {
            DEFAULT: "var(--border, #e5e7eb)",
          },
          ring: {
            DEFAULT: "#3b82f6",
          },
          content: {
            subtle: "#9ca3af",
            DEFAULT: "var(--foreground, #6b7280)",
            emphasis: "#374151",
            strong: "#111827",
            inverted: "#ffffff",
          },
        },
      },
      boxShadow: {
        "tremor-input": "0 1px 2px 0 rgb(0 0 0 / 0.05)",
        "tremor-card": "0 1px 3px 0 rgb(0 0 0 / 0.1), 0 1px 2px -1px rgb(0 0 0 / 0.1)",
        "tremor-dropdown": "0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)",
      },
      borderRadius: {
        "tremor-small": "0.375rem",
        "tremor-default": "0.5rem",
        "tremor-full": "9999px",
      },
      fontSize: {
        "tremor-label": ["0.75rem", { lineHeight: "1rem" }],
        "tremor-default": ["0.875rem", { lineHeight: "1.25rem" }],
        "tremor-title": ["1.125rem", { lineHeight: "1.75rem" }],
        "tremor-metric": ["1.875rem", { lineHeight: "2.25rem" }],
      },
      fontFamily: {
        sans: ["var(--font-sans)", "Outfit", "ui-sans-serif", "system-ui", "sans-serif"],
        serif: ["var(--font-sans)", "Outfit", "ui-sans-serif", "system-ui", "sans-serif"],
      },
    },
  },
  safelist: [
    // Tremor chart colors
    {
      pattern:
        /^(bg|border|ring|stroke|fill|text)-(slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-(50|100|200|300|400|500|600|700|800|900|950)$/,
      variants: ["hover", "ui-selected"],
    },
    {
      pattern: /(bg|border|ring|stroke|fill|text)-(tremor)/,
    },
  ],
  plugins: [],
};
export default config;
