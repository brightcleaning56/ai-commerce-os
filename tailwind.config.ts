import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  // Class-based dark mode — toggled by adding `.dark` to <html>.
  // Default theme is dark (applied in app/layout.tsx); user can switch via
  // the TopBar theme button. All `bg-bg-*`, `text-ink-*`, `accent-*` tokens
  // resolve via CSS variables defined in app/globals.css so the same class
  // names work in both modes.
  darkMode: ["class"],
  theme: {
    extend: {
      colors: {
        bg: {
          base: "var(--color-bg-base)",
          panel: "var(--color-bg-panel)",
          card: "var(--color-bg-card)",
          hover: "var(--color-bg-hover)",
          border: "var(--color-bg-border)",
        },
        brand: {
          50: "#f3eeff",
          100: "#e2d4ff",
          200: "var(--color-brand-200)",
          300: "var(--color-brand-300)",
          400: "var(--color-brand-400)",
          500: "var(--color-brand-500)",
          600: "var(--color-brand-600)",
          700: "var(--color-brand-700)",
        },
        accent: {
          green: "var(--color-accent-green)",
          red: "var(--color-accent-red)",
          amber: "var(--color-accent-amber)",
          blue: "var(--color-accent-blue)",
          cyan: "var(--color-accent-cyan)",
        },
        ink: {
          primary: "var(--color-ink-primary)",
          secondary: "var(--color-ink-secondary)",
          tertiary: "var(--color-ink-tertiary)",
        },
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
      },
      backgroundImage: {
        "gradient-brand":
          "linear-gradient(135deg, var(--color-brand-500) 0%, var(--color-brand-300) 100%)",
        "gradient-card": "var(--gradient-card)",
      },
      boxShadow: {
        glow: "0 0 32px -8px rgba(124,58,237,0.4)",
      },
    },
  },
  plugins: [],
};
export default config;
