/**
 * Origin / transport helpers (PRD §5.2).
 *
 * CORS allowlist = `ALLOWED_ORIGIN` ONLY (no wildcard). We reflect that single origin back
 * (never `*`, never the caller's arbitrary origin) and reject cross-origin browser calls. The
 * server-side `Origin`/`Referer` check is a SECONDARY signal — spoofable, so it raises cost
 * rather than being a hard wall; a missing `Origin` (same-origin GET, curl) is allowed so the
 * token gate + rate limit remain the primary controls and we don't block legitimate clients.
 */

import { NextResponse } from "next/server";
import { env } from "@/lib/env";
import { isProduction } from "@/lib/security/config";

const DEV_ORIGIN_FALLBACK = "http://localhost:3000";

/**
 * The allowlisted origin. REQUIRED in production: an unset `ALLOWED_ORIGIN` there throws rather
 * than falling back to a localhost default (which would 403 every real same-origin relative).
 * In dev it falls back to localhost. Evaluated at REQUEST time so `next build` never trips it.
 */
export function allowedOrigin(): string {
  if (env.ALLOWED_ORIGIN) return env.ALLOWED_ORIGIN;
  if (isProduction()) {
    throw new Error(
      "ALLOWED_ORIGIN is REQUIRED in production (no localhost default). " +
        "Set it to the app's public origin before deploy.",
    );
  }
  return DEV_ORIGIN_FALLBACK;
}

/** Origin of the request, derived from `Origin` or (fallback) the `Referer`'s origin. */
export function requestOrigin(req: Request): string | null {
  const origin = req.headers.get("origin");
  if (origin) return origin;
  const referer = req.headers.get("referer");
  if (referer) {
    try {
      return new URL(referer).origin;
    } catch {
      return null;
    }
  }
  return null;
}

/** True when the request carries an origin that is NOT our allowlisted origin. */
export function isCrossOrigin(req: Request): boolean {
  const origin = requestOrigin(req);
  if (origin === null) return false; // no origin header → not a cross-origin browser call
  return origin !== allowedOrigin();
}

/** CORS response headers — reflect the allowlisted origin ONLY when the caller matches it. */
export function corsHeaders(req: Request): Record<string, string> {
  const headers: Record<string, string> = { Vary: "Origin" };
  const origin = req.headers.get("origin");
  if (origin && origin === allowedOrigin()) {
    headers["Access-Control-Allow-Origin"] = allowedOrigin();
    headers["Access-Control-Allow-Credentials"] = "true";
  }
  return headers;
}

/** Apply CORS headers onto an existing response (mutates and returns it). */
export function withCors(res: Response, req: Request): Response {
  for (const [k, v] of Object.entries(corsHeaders(req))) {
    res.headers.set(k, v);
  }
  return res;
}

/**
 * Preflight (OPTIONS) handler. Allowed origin → 204 with CORS headers; anything else → 403.
 * Preflight never carries cookies, so it MUST be answered before the token gate.
 */
export function preflightResponse(req: Request): Response {
  const origin = req.headers.get("origin");
  if (!origin || origin !== allowedOrigin()) {
    return new NextResponse(null, { status: 403 });
  }
  return new NextResponse(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": allowedOrigin(),
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Allow-Credentials": "true",
      "Access-Control-Max-Age": "600",
      Vary: "Origin",
    },
  });
}

/**
 * Client IP used for rate-limit keying.
 *
 * DEPLOY ASSUMPTION (ADR 0003 — Cloudflare/OpenNext): in production the ONLY trustworthy source
 * is `cf-connecting-ip`, which Cloudflare's edge sets from the real TCP peer and a client cannot
 * forge. `x-forwarded-for` / `x-real-ip` are attacker-controlled off-CF, so in production we
 * IGNORE them entirely — trusting them would let a scraper rotate the rate-limit key per request
 * with a spoofed header. If `cf-connecting-ip` is somehow absent in prod we bucket as "unknown"
 * (shared) rather than trust a forgeable header. In dev we accept the proxy headers so local
 * testing behind a dev proxy still keys sensibly.
 */
export function clientIp(req: Request): string {
  const cf = req.headers.get("cf-connecting-ip");
  if (cf) return cf;
  if (isProduction()) return "unknown";
  return (
    req.headers.get("x-real-ip") ??
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    "unknown"
  );
}
