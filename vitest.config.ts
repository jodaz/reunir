import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

/**
 * Minimal Vitest config. Tests (raw-fixture → Person mapping, status edge cases, and
 * mojibake repair) land in Cycle 1; the runner + `@/` path alias are wired now.
 */
export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.{test,spec}.ts"],
  },
});
