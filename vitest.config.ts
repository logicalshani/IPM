import { defineConfig } from "vitest/config";
import { resolve } from "node:path";

export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
    testTimeout: 10000
  },
  resolve: {
    alias: {
      "@": resolve(__dirname, "src")
    }
  }
});
