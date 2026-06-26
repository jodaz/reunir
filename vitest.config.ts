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
    // The gate is fail-closed by default (lib/security/config): without secrets it THROWS unless
    // explicitly opted out. Tests that exercise the disabled path opt in here; tests that need
    // the gate ACTIVE mock `gateDecision` per-file.
    env: {
      GATE_DISABLED: "1",
    },
  },
});
