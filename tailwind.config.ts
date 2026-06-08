import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#17202a",
        steel: "#4a5568",
        mint: "#12b981",
        amber: "#d97706",
        signal: "#dc2626"
      }
    }
  },
  plugins: []
};

export default config;
