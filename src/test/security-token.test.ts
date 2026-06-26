/**
 * Session-token signing/verification (PRD §5.1) — Web Crypto HMAC round-trip, expiry, and
 * tamper/forgery rejection. No `node:crypto`, no `jsonwebtoken`.
 */

import { describe, it, expect } from "vitest";
import {
  signSessionToken,
  verifySessionToken,
  tokenFingerprint,
} from "@/lib/security/token";

const SECRET = "unit-test-session-secret";

describe("signSessionToken / verifySessionToken", () => {
  it("round-trips: a freshly signed token verifies", async () => {
    const token = await signSessionToken(SECRET, 900);
    expect(await verifySessionToken(SECRET, token)).toBe(true);
  });

  it("rejects an expired token", async () => {
    const t0 = 1_000_000_000_000;
    const token = await signSessionToken(SECRET, 60, t0);
    // 61s later → past the 60s TTL.
    expect(await verifySessionToken(SECRET, token, t0 + 61_000)).toBe(false);
    // still valid one second before expiry.
    expect(await verifySessionToken(SECRET, token, t0 + 59_000)).toBe(true);
  });

  it("rejects a tampered signature", async () => {
    const token = await signSessionToken(SECRET, 900);
    const [payload, sig] = token.split(".");
    const flipped = sig.slice(0, -1) + (sig.endsWith("A") ? "B" : "A");
    expect(await verifySessionToken(SECRET, `${payload}.${flipped}`)).toBe(
      false,
    );
  });

  it("rejects a tampered payload (signature no longer matches)", async () => {
    const token = await signSessionToken(SECRET, 900);
    const sig = token.split(".")[1];
    const forgedPayload = btoa(JSON.stringify({ iat: 0, exp: 9_999_999_999 }))
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");
    expect(await verifySessionToken(SECRET, `${forgedPayload}.${sig}`)).toBe(
      false,
    );
  });

  it("rejects a token signed with a different secret", async () => {
    const token = await signSessionToken("other-secret", 900);
    expect(await verifySessionToken(SECRET, token)).toBe(false);
  });

  it("rejects malformed / empty input", async () => {
    expect(await verifySessionToken(SECRET, undefined)).toBe(false);
    expect(await verifySessionToken(SECRET, "")).toBe(false);
    expect(await verifySessionToken(SECRET, "no-dot")).toBe(false);
    expect(await verifySessionToken(SECRET, ".")).toBe(false);
    expect(await verifySessionToken(SECRET, "a.")).toBe(false);
  });
});

describe("tokenFingerprint", () => {
  it("is stable and does not echo the raw token", async () => {
    const token = await signSessionToken(SECRET, 900);
    const fp1 = await tokenFingerprint(token);
    const fp2 = await tokenFingerprint(token);
    expect(fp1).toBe(fp2);
    expect(fp1).toMatch(/^[0-9a-f]{16}$/);
    expect(token).not.toContain(fp1);
  });
});
