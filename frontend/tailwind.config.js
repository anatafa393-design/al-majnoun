/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        border: "rgba(255, 255, 255, 0.08)",
        input: "rgba(255, 255, 255, 0.08)",
        ring: "#8b5cf6",
        background: "#070913",
        foreground: "#f3f4f6",
        primary: {
          DEFAULT: "#8b5cf6",
          foreground: "#ffffff",
        },
        secondary: {
          DEFAULT: "rgba(255, 255, 255, 0.06)",
          foreground: "#f3f4f6",
        },
        destructive: {
          DEFAULT: "#ef4444",
          foreground: "#ffffff",
        },
        muted: {
          DEFAULT: "rgba(255, 255, 255, 0.04)",
          foreground: "#9ca3af",
        },
        accent: {
          DEFAULT: "#06b6d4",
          foreground: "#ffffff",
        },
        popover: {
          DEFAULT: "rgba(13, 17, 39, 0.95)",
          foreground: "#f3f4f6",
        },
        card: {
          DEFAULT: "rgba(13, 17, 39, 0.55)",
          foreground: "#f3f4f6",
        },
      },
    },
  },
  plugins: [],
}
