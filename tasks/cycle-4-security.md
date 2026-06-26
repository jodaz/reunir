# Cycle 4 — Security baseline

**PRD milestone:** M5 (Security baseline)
**Exit criterion:** The app's own API is no longer a free scraping target, *without* blocking a
panicked relative on a cheap phone. Turnstile + rate limits + minimization is the floor.

**Status: DONE (merged to main).** 81 Vitest tests; adversarial security-reviewer audit passed
(no merge-blockers; HIGH-1/2 + MEDIUM-1/2/3 + LOW-2 fixed). Web Crypto / Workers-compatible,
no new deps. See ADR notes + `src/lib/security/*`, `src/lib/gateway.ts`.

## Human-proof token gate
- [x] Cloudflare Turnstile on first load; on pass, issue a short-lived signed token
      (httpOnly cookie, HMAC-SHA256 via Web Crypto, ~20 min). siteverify validates
      success + **hostname** (+ optional `TURNSTILE_ACTION`).
- [x] `/api/sources/*` **require** the token; no token → 401. **Fail-closed by default**
      (active when secrets set; disabled only on explicit `GATE_DISABLED=1`; else throws).

## Origin & transport
- [x] CORS allowlist = own origin only (exact-match `ALLOWED_ORIGIN`, **required in prod**).
- [x] Server-side `Origin`/`Referer` check as a secondary signal.
- [x] HTTPS only; HSTS (+ hardening headers in `next.config.ts`).

## Rate limiting
- [x] Sliding-window limits per IP **and** per token (~30/min). IP keyed on `cf-connecting-ip`
      only in prod (ignores spoofable XFF).
- [x] Tighter caps on deep pagination — the deep bucket **fails closed** on store error.
- [x] Return `429` + `Retry-After`; generic body (no internals). Refuses prod boot if gate
      active but limiter backend is in-memory (Upstash required in prod).

## Shape the surface
- [x] `pageSize` capped server-side (≤48) in `QuerySchema`.
- [x] Require non-empty, minimum-length `q`.
- [x] IDs stay opaque/namespaced; no fetch-by-id endpoint → not enumerable.
- [x] **No** bulk/export endpoint.

## Data minimization (most important)
- [x] Audited across all sources: no cédula/idNumber/reporter email/phone on any response,
      error, log, or cache entry (independently re-verified in the audit).
- [x] Photos hotlink to source; never re-hosted.

## Policy & legal
- [x] `app/robots.ts` disallows `/api/`.
- [x] Terms of Use (`/terminos`): prohibits automated collection + re-identification;
      humanitarian, non-commercial.
- [x] Contact + opt-out (`/contacto`, jesus@jodaz.xyz).

**Done when:** an unauthenticated `curl` to `/api/sources/*` is blocked, limits return 429, and
a full successful scrape would yield only already-public fields. ✅

## Deferred to Cycle 5 (hardening)
- Throttle `/api/auth/turnstile` (LOW-1); tighten deep-paging threshold / cumulative cap (LOW-3);
  gate the `x-reunir-cache` header behind a debug flag in prod (INFO).
