/**
 * POST /api/auth/turnstile — exchange a Cloudflare Turnstile response token for a short-lived
 * signed session cookie (PRD §5.1).
 *
 * Flow: client widget solves Turnstile → posts `{ token }` here → we verify it server-side via
 * Cloudflare **siteverify** (using `TURNSTILE_SECRET_KEY`) → on success we sign a session token
 * (Web Crypto HMAC, `SESSION_TOKEN_SECRET`) and set it as an httpOnly, Secure, SameSite=Lax
 * cookie. Subsequent same-origin `/api/sources/*` calls carry the cookie and pass the gate.
 *
 * Dev with no secrets: the gate is disabled, so this route is a no-op `{ ok: true,
 * gate: "disabled" }` — searches work without a cookie. Prod with no secrets: `gateDecision()`
 * throws (fail-closed), surfaced as 500.
 *
 * Workers/OpenNext (ADR 0003): `fetch` to siteverify + Web Crypto signing only.
 */

import { NextRequest, NextResponse } from "next/server";
import { env } from "@/lib/env";
import { gateDecision } from "@/lib/security/config";
import {
  signSessionToken,
  SESSION_COOKIE,
  SESSION_TTL_SECONDS,
} from "@/lib/security/token";
import { allowedOrigin, clientIp } from "@/lib/security/origin";

const SITEVERIFY_URL =
  "https://challenges.cloudflare.com/turnstile/v0/siteverify";

interface SiteverifyResponse {
  success: boolean;
  /** Host the widget ran on (Cloudflare-attested) — must match our allowed origin's host. */
  hostname?: string;
  /** Action the widget declared — must match `TURNSTILE_ACTION` when configured. */
  action?: string;
  challenge_ts?: string;
  "error-codes"?: string[];
}

/** Allowed hostnames the Turnstile widget may legitimately have run on. */
function allowedHostnames(): Set<string> {
  const hosts = new Set<string>();
  try {
    hosts.add(new URL(allowedOrigin()).hostname);
  } catch {
    // allowedOrigin() throws in prod-without-config; let it surface as 500 upstream.
    throw new Error("ALLOWED_ORIGIN missing/invalid for Turnstile hostname check");
  }
  return hosts;
}

export async function POST(req: NextRequest): Promise<Response> {
  const decision = gateDecision(); // throws in prod-without-secrets (fail-closed)

  if (decision.mode === "disabled") {
    return NextResponse.json({ ok: true, gate: "disabled" });
  }

  let token: unknown;
  try {
    ({ token } = (await req.json()) as { token?: unknown });
  } catch {
    token = undefined;
  }
  if (typeof token !== "string" || token.length === 0) {
    return NextResponse.json({ error: "missing_token" }, { status: 400 });
  }

  // Verify the Turnstile token with Cloudflare siteverify.
  const form = new URLSearchParams();
  form.set("secret", env.TURNSTILE_SECRET_KEY);
  form.set("response", token);
  const ip = clientIp(req);
  if (ip !== "unknown") form.set("remoteip", ip);

  let verified: SiteverifyResponse;
  try {
    const res = await fetch(SITEVERIFY_URL, { method: "POST", body: form });
    verified = (await res.json()) as SiteverifyResponse;
  } catch {
    // Don't leak siteverify internals; this is a transient verification failure.
    return NextResponse.json({ error: "verification_failed" }, { status: 502 });
  }

  if (!verified.success) {
    return NextResponse.json({ error: "challenge_failed" }, { status: 403 });
  }

  // Bind the solved challenge to OUR site: a token solved against our sitekey but on a different
  // hostname (e.g. an attacker embedding our widget) must not yield a session here.
  if (verified.hostname && !allowedHostnames().has(verified.hostname)) {
    return NextResponse.json({ error: "hostname_mismatch" }, { status: 403 });
  }

  // When an action is configured, the widget declares it and siteverify must echo it.
  const expectedAction = env.TURNSTILE_ACTION.trim();
  if (expectedAction && verified.action !== expectedAction) {
    return NextResponse.json({ error: "action_mismatch" }, { status: 403 });
  }

  const sessionToken = await signSessionToken(
    decision.sessionSecret,
    SESSION_TTL_SECONDS,
  );

  const response = NextResponse.json({ ok: true });
  // Cookie is issued ONLY when the gate is active (we returned early otherwise), so it is always
  // Secure — tied to the gate being active, not merely to NODE_ENV. Browsers accept Secure
  // cookies on http://localhost, so local testing of an active gate still works.
  response.cookies.set(SESSION_COOKIE, sessionToken, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  });
  return response;
}
