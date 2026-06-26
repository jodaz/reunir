# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project status

Scaffold (Cycle 0 / Milestone 1) has landed: Next.js (App Router, TypeScript, `src/` dir, CSS Modules) with the canonical `Person` type, Zod schemas, the three `/api/sources/*` routes (Source B = "not connected" stub), the `withGateway`/`fetchUpstream` protection seams (placeholders), and a TanStack Query provider. Live Source A/C data, encoding repair, cache, and the token gate land in later cycles. The full design lives in `PRD.md` ("Reunir — Workplan"); ADRs are in `docs/adr/`.

### Commands

This repo uses **pnpm** (pinned via `packageManager` in `package.json`); do not use npm/yarn.

```bash
pnpm install        # install deps
pnpm dev            # start the dev server (http://localhost:3000)
pnpm build          # production build
pnpm start          # serve the production build
pnpm lint           # ESLint (eslint-config-next)
pnpm typecheck      # tsc --noEmit (type-check only, no emit)
pnpm format         # Prettier (writes in place; planning docs are ignored)
pnpm test           # Vitest (unit tests)
```

## What this project is

**Reunir** — a unified, read-only search across three independent Venezuela 2026 earthquake missing-persons registries. One search box fans out to all sources in parallel; each source loads independently (one failing never blanks the page); every result links back to its original record.

**Guiding principle (from the PRD, applies to every decision):** expose nothing in the aggregate that wasn't already public at the source, link back rather than re-publish, and never centralize sensitive identifiers (cédulas, reporter emails/phones). This is read-only discovery — reporting still happens on the source apps.

**Explicitly out of scope:** deduplication / entity resolution — duplicates render as separate cards *by design* (Milestone 7, "later"). Do not build name-matching/merge logic unless the PRD's dedup milestone is explicitly in play. No write access, no bulk/export endpoint, no heavy normalization beyond field-mapping + encoding repair.

## Planned stack (decided in PRD §2)

Next.js (App Router) + TypeScript · TanStack Query (`useQueries` for parallel per-source loading) · Zod (typed boundary at each adapter) · CSS Modules · Upstash Redis or `unstable_cache` (server-side politeness cache) · Cloudflare Turnstile (issues the session token the API requires) · **Cloudflare** hosting — Workers via the OpenNext adapter (`@opennextjs/cloudflare`), see ADR 0003. A datastore (Postgres + `pg_trgm` / D1) is **not** a day-one dependency — add only when moving off live fan-out.

## Architecture

### Canonical model
The single `Person` type all adapters map to (PRD §3.1). IDs are **namespaced by source**: `"a:<id>"`, `"b:<id>"`, `"c:<id>"`; `source` is `"a" | "b" | "c"`; `status` is `"missing" | "found"`. Sensitive fields (cédula, reporter email/phone) are **deliberately absent** — if used for matching they stay server-side and are never serialized to the client.

### Per-source proxy endpoints
One handler per source, all behind one protected gateway (keeps independent-loading UX while centralizing protection):
```
GET /api/sources/desaparecidos?q=&page=&pageSize=   (Source A)
GET /api/sources/terremoto?q=&page=&pageSize=        (Source C)
GET /api/sources/vtb?q=&page=&pageSize=              (Source B)
```
Each handler pipeline: fetch upstream → repair encoding → Zod-validate the *raw upstream shape* → map to `Person` → strip sensitive fields → cap `pageSize` (max ~48) → return `{ items: Person[], page, totalPages }`.

### The three sources (raw upstream samples in the per-source `.md` files)

| Letter | Name / doc | Upstream | Shape & status mapping |
|---|---|---|---|
| **A** | desaparecidos (`DesaparecidosTerremotoVenezuela.md`) | `desaparecidos-terremoto-api.theempire.tech/api/personas` | **reCAPTCHA-gated → "not connected"** (ADR 0004): returns `403 "Verificación reCAPTCHA requerida"`. Adapter (`mapToPerson`, `estado: localizado → found`) kept for a future sanctioned feed; route serves a `NotConnectedResponse`. |
| **C** | terremotovenezuela (`tERREMOTOENvENEZULEA.md`) | `terremotovenezuela.app/api/missing` | **Primary source.** Clean JSON `{people,total,…}`; English fields (`name,age,lastSeen,photoUrl…`); epoch-ms `createdAt`. `resolvedAt` present → `found`, else `missing`. Federates the shared `reconexion` pool. |
| **B** | venezuelatebusca (`VenezuelaTeBusca.md`) | `venezuela-te-busca-app.hellogafaro.workers.dev/_root.data` | **Live, PII-stripped** (ADR 0004): **Remix turbo-stream** (index-referenced flat array) decoded in `src/lib/turbostream.ts`; reads are open (Turnstile only guards submission). `firstName`+`lastName` → name; **cédula + `reporter` contact dropped at the boundary**. |

**Source status was corrected empirically (ADR 0004).** The original "B blocked by Turnstile / A clean JSON" framing was wrong: **A** is the human-gated one (reCAPTCHA → "not connected"), while **B**'s reads are open (Turnstile only guards report submission) and are now consumed live with **cédula + reporter contact stripped at the adapter boundary** (our view is more private than B's own app). **Never** automate past a real human-verification gate (A's reCAPTCHA), and **never** read cédula/`reporter` into `Person`. The shared `reconexion` S3 pool is confirmed — C federates A's and B's records, so C is the primary source.

### Encoding repair
Mojibake like `JosÃ©` / `DÃ­az` is double-decoded UTF-8. Fix at the **byte boundary** — decode upstream bytes with `TextDecoder('utf-8')` — not with a magic-fixup library. Only fall back to a repair pass for already-corrupted stored strings.

### UI flow (PRD §4)
Debounced (~280ms) search + status filter → `useQueries` fires the 3 proxy requests in parallel → each source has its own loading/error/"not connected" lamp → results merge **without dedup** → filter by status → grid. Empty state is an instruction ("probá con menos letras / quitá el filtro"), not a dead end. Mobile-first, keyboard accessible, reduced-motion respected.

## Self-protection (PRD §5) — relevant whenever touching `/api/*`

The app's own API must not become a free scraping target, *and* must not over-fortify a panicked relative on a cheap phone out. The intended floor: Turnstile token gate (no token → 401), CORS allowlist of own origin only, per-IP/per-token rate limits (~30 searches/min, tighter on deep pagination → 429 + `Retry-After`), `pageSize` cap, require non-empty/min-length `q` (no "return everything"), 30–60s server cache keyed on normalized query, robots.txt disallowing `/api/*`. The strongest protection is **data minimization** — even a full scrape yields only what was already public. Heavier auth only if real abuse appears.

**Implemented (Cycle 4).** All `/api/sources/*` go through `withGateway` (`src/lib/gateway.ts`), hooks in order: token → CORS → rate-limit → cache → query caps; a 401/403/429 short-circuits before any cache/upstream work. Pieces: `src/lib/security/token.ts` (HMAC-SHA256 session cookie via Web Crypto, constant-time verify), `config.ts` (**fail-CLOSED by default** — gate active when secrets present, disabled only on explicit `GATE_DISABLED=1`, else throws; never open-on-`NODE_ENV`-misread), `ratelimit.ts` (per-IP + per-token sliding window, Upstash REST / in-memory; the **deep-pagination bucket fails closed** so the anti-scrape control can't evaporate; in prod IP is keyed on `cf-connecting-ip` only), `origin.ts` (exact-match CORS, required `ALLOWED_ORIGIN` in prod). `src/app/api/auth/turnstile/route.ts` verifies siteverify **success + hostname** (+ optional `TURNSTILE_ACTION`). `src/app/robots.ts` disallows `/api/`; `/terminos` + `/contacto` (jesus@jodaz.xyz) carry the ToS + opt-out. Adversarial audit passed (no field leak; HIGH/MEDIUM findings fixed). Deferred to Cycle 5: WAF/bot rules, honeypot, monitoring, canaries, throttling `/api/auth/turnstile`.

## Politeness to upstreams
These are volunteers' apps. Rate-limit and cache outbound calls, use per-source timeouts + backoff + a circuit breaker on repeated 5xx, and identify the client with a descriptive User-Agent + contact URL. A wave of searches must never knock a source offline.

**Implemented (Cycle 3).** All outbound calls go through `src/lib/http.ts` (the single chokepoint): per-attempt timeout, bounded retry with exponential backoff + jitter on transient failures only (network/timeout/5xx/429, honors `Retry-After`; never retries 4xx except 429), and a per-source circuit breaker (`src/lib/breaker.ts`) that fast-fails when OPEN so a dead source surfaces as its "offline" lamp without stalling the others. `src/lib/cache.ts` (wired via the `withGateway` cache step) caches by **normalized query** — Upstash Redis REST when `UPSTASH_*` env is set, in-memory TTL+LRU fallback otherwise — so hammering *our* API never amplifies to the upstreams. Tunables live in `env.ts` (`UPSTREAM_TIMEOUT_MS`, `UPSTREAM_MAX_ATTEMPTS`, `UPSTREAM_BACKOFF_*`, `BREAKER_*`, `CACHE_TTL_SECONDS`). Breaker + in-memory cache state are per-isolate on Workers (best-effort); the durable-via-Upstash seam is in place for when scale warrants it.

## Sensitivity

Real personal data about missing/found disaster victims (names, phones, photos, ID numbers). Don't commit scraped dumps, keep contact details and cédulas out of logs and sample fixtures, and keep them out of the canonical `Person` served to clients.
