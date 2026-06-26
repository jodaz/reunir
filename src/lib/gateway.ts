/**
 * Inbound protection chokepoint (PRD §5 / ADR 0002 §6).
 *
 * `withGateway(handler)` wraps EVERY `/api/sources/*` route so protection lives in one
 * place and cannot drift per-endpoint. Order of operations:
 *   1. Turnstile session-token check  → 401            (Cycle 5)
 *   2. CORS allowlist / Origin check                    (Cycle 5)
 *   3. per-IP / per-token rate limit   → 429 + Retry-After (Cycle 5)
 *   4. server-side cache lookup/store, keyed on normalized query (Cycle 3 — WIRED)
 *   5. pageSize cap + non-empty `q` enforcement via QuerySchema (active from M1)
 *
 * Steps 1–3 remain typed no-op hooks (Cycle 4 fills them WITHOUT touching this file's
 * cache wiring); step 4 is wired in Cycle 3; step 5 enforces the §5.4 caps today.
 */

import { NextRequest, NextResponse } from "next/server";
import { QuerySchema, type Query } from "@/schemas/proxy";
import { buildCacheKey, getCachedBody, setCachedBody } from "@/lib/cache";

/** A source handler: receives the validated query and returns the proxy response. */
export type GatewayHandler = (
  req: NextRequest,
  query: Query,
) => Promise<Response> | Response;

/**
 * A protection hook. Returns a `Response` to short-circuit (deny), or `null` to
 * continue down the chain. M1 implementations always return `null`.
 */
type GuardHook = (
  req: NextRequest,
) => Promise<Response | null> | Response | null;

// --- Placeholder hooks (Cycles 4/5 implement these without touching routes) ---

const checkToken: GuardHook = () => {
  // TODO(Cycle 5): verify Turnstile-issued session token; 401 when absent/invalid.
  return null;
};

const checkCors: GuardHook = () => {
  // TODO(Cycle 5): allowlist own origin only; reject cross-origin.
  return null;
};

const checkRateLimit: GuardHook = () => {
  // TODO(Cycle 5): per-IP/per-token limit; 429 + Retry-After when exceeded.
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
    // 1–3: protection hooks (no-ops in M1).
    for (const hook of HOOKS) {
      const denied = await hook(req);
      if (denied) return denied;
    }

    // 5: validate + cap query params (active in M1).
    const parsed = parseQuery(req);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "invalid_query", issues: parsed.error.flatten() },
        { status: 400 },
      );
    }

    // 4: server-side politeness cache (Cycle 3). Keyed on the normalized query + source
    // path, so a scraper hammering OUR API turns into ZERO upstream calls on a HIT. The
    // route path (`/api/sources/<source>`) namespaces the key per source.
    const cacheKey = buildCacheKey(req.nextUrl.pathname, parsed.data);

    const hit = await getCachedBody(cacheKey);
    if (hit) {
      return NextResponse.json(hit.body, {
        status: 200,
        headers: { "x-reunir-cache": "HIT" },
      });
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

    return response;
  };
}
