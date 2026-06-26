/**
 * Inbound protection chokepoint (PRD §5 / ADR 0002 §6).
 *
 * `withGateway(handler)` wraps EVERY `/api/sources/*` route so protection lives in one
 * place and cannot drift per-endpoint. Order of operations (rejects short-circuit BEFORE
 * any cache lookup or upstream fetch — a 401/429 does ZERO downstream work):
 *   0. CORS preflight (OPTIONS) answered first — preflight carries no cookie.   (Cycle 4)
 *   1. Turnstile session-token check  → 401                                      (Cycle 4)
 *   2. CORS allowlist / Origin check  → 403                                      (Cycle 4)
 *   3. per-IP / per-token rate limit   → 429 + Retry-After                       (Cycle 4)
 *   4. server-side cache lookup/store, keyed on normalized query                 (Cycle 3)
 *   5. pageSize cap + non-empty `q` enforcement via QuerySchema                  (M1)
 *
 * Steps 1–3 are implemented in `lib/security/*` and wired here WITHOUT touching the Cycle 3
 * cache wiring (step 4) below them.
 */

import { NextRequest, NextResponse } from "next/server";
import { QuerySchema, type Query } from "@/schemas/proxy";
import { buildCacheKey, getCachedBody, setCachedBody } from "@/lib/cache";
import { gateDecision, isProduction } from "@/lib/security/config";
import { verifySessionToken, tokenFingerprint, SESSION_COOKIE } from "@/lib/security/token";
import { rateLimit, assertLimiterBackend } from "@/lib/security/ratelimit";
import {
  clientIp,
  isCrossOrigin,
  preflightResponse,
  withCors,
} from "@/lib/security/origin";
import { env } from "@/lib/env";

/** A source handler: receives the validated query and returns the proxy response. */
export type GatewayHandler = (
  req: NextRequest,
  query: Query,
) => Promise<Response> | Response;

/**
 * A protection hook. Returns a `Response` to short-circuit (deny), or `null` to
 * continue down the chain.
 */
type GuardHook = (
  req: NextRequest,
) => Promise<Response | null> | Response | null;

// --- 1. Turnstile session-token gate (PRD §5.1) --------------------------------------

/**
 * Require a valid, unexpired session token (the Turnstile verify route issues it as an
 * httpOnly cookie). Missing/invalid/expired → 401. In dev with no secrets the gate is
 * DISABLED (fail-open); in prod with no secrets `gateDecision()` throws (fail-closed).
 */
const checkToken: GuardHook = async (req) => {
  const decision = gateDecision();
  if (decision.mode === "disabled") return null;

  const token = req.cookies.get(SESSION_COOKIE)?.value;
  const ok = await verifySessionToken(decision.sessionSecret, token);
  if (!ok) {
    return NextResponse.json(
      { error: "unauthorized" },
      { status: 401, headers: { "WWW-Authenticate": "Turnstile" } },
    );
  }
  return null;
};

// --- 2. CORS allowlist / Origin check (PRD §5.2) -------------------------------------

const checkCors: GuardHook = (req) => {
  // Origin enforcement is a PROD protection (the token gate is the primary control). In dev the
  // port varies (e.g. :3001 when :3000 is taken) so a strict origin 403 just blocks local work —
  // skip it. Prod still rejects any non-allowlisted origin.
  if (isProduction() && isCrossOrigin(req)) {
    return NextResponse.json({ error: "forbidden_origin" }, { status: 403 });
  }
  return null;
};

// --- 3. Per-IP / per-token rate limit (PRD §5.3) -------------------------------------

const WINDOW_MS = 60_000;
/** Real users rarely page past 2–3; deeper paging gets a much tighter cap (§5.3). */
const DEEP_PAGE_THRESHOLD = 3;

function pageFromReq(req: NextRequest): number {
  const raw = Number(req.nextUrl.searchParams.get("page"));
  return Number.isFinite(raw) && raw >= 1 ? Math.floor(raw) : 1;
}

function tooMany(retryAfterSeconds: number): Response {
  return NextResponse.json(
    { error: "rate_limited" },
    {
      status: 429,
      headers: { "Retry-After": String(retryAfterSeconds) },
    },
  );
}

const checkRateLimit: GuardHook = async (req) => {
  // Refuse to serve if the gate is active in prod but the limiter is silently in-memory.
  const gateActive = gateDecision().mode === "active";
  assertLimiterBackend(gateActive);

  const base = env.RATE_LIMIT_PER_MIN;
  const page = pageFromReq(req);
  const deep = page > DEEP_PAGE_THRESHOLD;
  // Deep pagination is the bulk-extraction signal → an order-of-magnitude tighter, on its
  // OWN counter so it can't borrow budget from shallow searches. The deep bucket fails CLOSED
  // on a limiter-store error (it's the anti-scrape control); the shallow bucket fails OPEN.
  const limit = deep ? Math.max(1, Math.floor(base / 6)) : base;
  const bucket = deep ? "deep" : "page";
  const opts = { failClosed: deep };

  const ip = clientIp(req);
  const ipResult = await rateLimit(`ip:${ip}:${bucket}`, limit, WINDOW_MS, opts);
  if (!ipResult.allowed) return tooMany(ipResult.retryAfterSeconds);

  // Per-token limit (only when a session token is present — i.e. gate active).
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  if (token) {
    const fp = await tokenFingerprint(token);
    const tokResult = await rateLimit(
      `tok:${fp}:${bucket}`,
      limit,
      WINDOW_MS,
      opts,
    );
    if (!tokResult.allowed) return tooMany(tokResult.retryAfterSeconds);
  }

  return null;
};

const HOOKS: readonly GuardHook[] = [checkToken, checkCors, checkRateLimit];

function parseQuery(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  return QuerySchema.safeParse({
    q: sp.get("q") ?? undefined,
    page: sp.get("page") ?? undefined,
    pageSize: sp.get("pageSize") ?? undefined,
  });
}

/** Wrap a source handler with the shared protection chain. */
export function withGateway(handler: GatewayHandler) {
  return async function gatewayRoute(req: NextRequest): Promise<Response> {
    // 0: CORS preflight — answered before the token gate (preflight has no cookie).
    if (req.method === "OPTIONS") return preflightResponse(req);

    // 1–3: protection hooks. A denial here short-circuits BEFORE any cache/upstream work.
    for (const hook of HOOKS) {
      const denied = await hook(req);
      if (denied) return withCors(denied, req);
    }

    // 5: validate + cap query params.
    const parsed = parseQuery(req);
    if (!parsed.success) {
      return withCors(
        NextResponse.json(
          { error: "invalid_query", issues: parsed.error.flatten() },
          { status: 400 },
        ),
        req,
      );
    }

    // 4: server-side politeness cache (Cycle 3). Keyed on the normalized query + source
    // path, so a scraper hammering OUR API turns into ZERO upstream calls on a HIT. The
    // route path (`/api/sources/<source>`) namespaces the key per source.
    const cacheKey = buildCacheKey(req.nextUrl.pathname, parsed.data);

    const hit = await getCachedBody(cacheKey);
    if (hit) {
      return withCors(
        NextResponse.json(hit.body, {
          status: 200,
          headers: { "x-reunir-cache": "HIT" },
        }),
        req,
      );
    }

    const response = await handler(req, parsed.data);

    // Only cache successful proxy bodies — never 502s / breaker fast-fails (a transient
    // upstream outage must not get pinned in cache and hide recovery).
    if (response.status === 200) {
      try {
        const body = await response.clone().json();
        await setCachedBody(cacheKey, { body });
      } catch {
        // Non-JSON or read failure → skip caching, return the live response untouched.
      }
    }

    return withCors(response, req);
  };
}
