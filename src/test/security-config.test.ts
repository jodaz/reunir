/**
 * Gate config decision (PRD §5.1, §5.9) — fail-CLOSED by default.
 *
 * The gate disables ONLY on an explicit opt-in; the absence of any signal must THROW (never
 * silently open).
 */

import { describe, it, expect } from "vitest";
import { evaluateGateConfig } from "@/lib/security/config";

describe("evaluateGateConfig", () => {
  it("is ACTIVE when both secrets are present (regardless of opt-in flag)", () => {
    expect(
      evaluateGateConfig({
        gateDisabled: false,
        turnstileSecret: "ts",
        sessionSecret: "ss",
      }),
    ).toEqual({ mode: "active", sessionSecret: "ss" });

    expect(
      evaluateGateConfig({
        gateDisabled: true,
        turnstileSecret: "ts",
        sessionSecret: "ss",
      }),
    ).toEqual({ mode: "active", sessionSecret: "ss" });
  });

  it("is DISABLED only on an EXPLICIT opt-in when secrets are missing", () => {
    expect(
      evaluateGateConfig({
        gateDisabled: true,
        turnstileSecret: "",
        sessionSecret: "",
      }),
    ).toEqual({ mode: "disabled" });
  });

  it("THROWS when secrets are missing and NOT explicitly disabled (fail-closed default)", () => {
    expect(() =>
      evaluateGateConfig({
        gateDisabled: false,
        turnstileSecret: "",
        sessionSecret: "",
      }),
    ).toThrow(/fail-closed/i);

    // Partial config without opt-in is still a hard fail.
    expect(() =>
      evaluateGateConfig({
        gateDisabled: false,
        turnstileSecret: "ts",
        sessionSecret: "",
      }),
    ).toThrow();
  });
});
