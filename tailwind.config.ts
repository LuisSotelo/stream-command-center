import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}", // <-- ESTA LÍNEA ES CRÍTICA
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        background: "#0A0A0A",
        brand: {
          purple: "#9146FF",
          cyan: "#00F5FF",
          emerald: "#10B981",
          red: "#F87171",
        },
      },
      fontFamily: {
        // Geist para títulos, JetBrains para números y comandos
        sans: ["var(--font-geist-sans)", "Inter", "sans-serif"],
        mono: ["var(--font-jetbrains-mono)", "Fira Code", "monospace"],
      },
      backgroundImage: {
        "gradient-radial": "radial-gradient(var(--tw-gradient-stops))",
        "gradient-conic": "conic-gradient(from 180deg at 50% 50%, var(--tw-gradient-stops))",
      },
      boxShadow: {
        // Efectos de resplandor para la barra de progreso y botones
        "glow-purple": "0 0 20px rgba(145, 70, 255, 0.6)",
        "glow-cyan": "0 0 20px rgba(0, 245, 255, 0.6)",
      },
      keyframes: {
        // Animación de brillo que recorre la barra de progreso
        shimmer: {
          "100%": { transform: "translateX(200%)" },
        },
        pulseCustom: {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0.5" },
        },
      },
      animation: {
        shimmer: "shimmer 2s infinite",
        "pulse-slow": "pulseCustom 3s infinite",
      },
    },
  },
  plugins: [],
};
export default config;