/**
 * Token-gate configuration decision (PRD §5.1, §5.9) — fail-CLOSED by default.
 *
 * The gate is OPEN (disabled) ONLY when explicitly opted in; the absence of a signal is NEVER
 * treated as "open" (that was the original fail-open-dev hazard). Rules:
 *   - Secrets present (TURNSTILE_SECRET_KEY + SESSION_TOKEN_SECRET) → gate ACTIVE.
 *   - Secrets absent + `GATE_DISABLED=1` (explicit local-dev opt-in) → gate DISABLED.
 *   - Secrets absent + no explicit opt-in → THROW (fail-closed). This is the default, so a
 *     mis-provisioned prod (or any env that simply forgot the secrets) refuses to serve rather
 *     than silently shipping an ungated API.
 *
 * The throw happens at REQUEST time (via `gateDecision()` in the gateway hook / verify route),
 * NOT at module import: `next build` (NODE_ENV=production, no secrets) only imports the route
 * modules, it never invokes the handler, so the build stays green. The pure `evaluateGateConfig`
 * is exported so each branch is unit-tested without mutating real env.
 */

import { env } from "@/lib/env";

export type GateDecision =
  | { mode: "active"; sessionSecret: string }
  | { mode: "disabled" };

export interface GateConfigInput {
  /** Explicit dev opt-in to run WITHOUT the gate (from `GATE_DISABLED`). */
  gateDisabled: boolean;
  turnstileSecret: string;
  sessionSecret: string;
}

/** Pure decision: ACTIVE when configured, DISABLED only on explicit opt-in, else THROW. */
export function evaluateGateConfig(input: GateConfigInput): GateDecision {
  const configured = Boolean(input.turnstileSecret && input.sessionSecret);
  if (configured) {
    return { mode: "active", sessionSecret: input.sessionSecret };
  }
  if (input.gateDisabled) {
    return { mode: "disabled" };
  }
  throw new Error(
    "Security gate not configured: set TURNSTILE_SECRET_KEY + SESSION_TOKEN_SECRET, " +
      "or set GATE_DISABLED=1 to explicitly run ungated in local dev. " +
      "Refusing to serve ungated by default (fail-closed).",
  );
}

export function isProduction(): boolean {
  return process.env.NODE_ENV === "production";
}

/** Whether the explicit dev opt-in to disable the gate is set. */
export function isGateExplicitlyDisabled(): boolean {
  const v = env.GATE_DISABLED.trim().toLowerCase();
  return v === "1" || v === "true";
}

/** Runtime decision read from validated env. Throws when neither configured nor opted-out. */
export function gateDecision(): GateDecision {
  return evaluateGateConfig({
    gateDisabled: isGateExplicitlyDisabled(),
    turnstileSecret: env.TURNSTILE_SECRET_KEY,
    sessionSecret: env.SESSION_TOKEN_SECRET,
  });
}
