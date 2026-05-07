import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        bg: {
          base: "#0a0a14",
          panel: "#11111c",
          card: "#161624",
          hover: "#1d1d2e",
          border: "#252538",
        },
        brand: {
          50: "#f3eeff",
          100: "#e2d4ff",
          200: "#c5a8ff",
          300: "#a87dff",
          400: "#8b52ff",
          500: "#7c3aed",
          600: "#6d28d9",
          700: "#5b21b6",
        },
        accent: {
          green: "#22c55e",
          red: "#ef4444",
          amber: "#f59e0b",
          blue: "#3b82f6",
          cyan: "#06b6d4",
        },
        ink: {
          primary: "#f5f5fa",
          secondary: "#9b9bb5",
          tertiary: "#6e6e85",
        },
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
      },
      backgroundImage: {
        "gradient-brand":
          "linear-gradient(135deg, #7c3aed 0%, #a87dff 100%)",
        "gradient-card":
          "linear-gradient(135deg, rgba(124,58,237,0.08) 0%, rgba(168,125,255,0.04) 100%)",
      },
      boxShadow: {
        glow: "0 0 32px -8px rgba(124,58,237,0.4)",
      },
    },
  },
  plugins: [],
};
export default config;
