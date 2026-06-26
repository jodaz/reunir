# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project status

Scaffold (Cycle 0 / Milestone 1) has landed: Next.js (App Router, TypeScript, `src/` dir, CSS Modules) with the canonical `Person` type, Zod schemas, the three `/api/sources/*` routes (Source B = "not connected" stub), the `withGateway`/`fetchUpstream` protection seams (placeholders), and a TanStack Query provider. Live Source A/C data, encoding repair, cache, and the token gate land in later cycles. The full design lives in `PRD.md` ("Reunir — Workplan"); ADRs are in `docs/adr/`.

### Commands

```bash
npm install        # install deps
npm run dev        # start the dev server (http://localhost:3000)
npm run build      # production build
npm run start      # serve the production build
npm run lint       # ESLint (eslint-config-next)
npm run format     # Prettier (writes in place; planning docs are ignored)
npm run test       # Vitest (unit tests; mapping/fixtures land in Cycle 1)
```

## What this project is

**Reunir** — a unified, read-only search across three independent Venezuela 2026 earthquake missing-persons registries. One search box fans out to all sources in parallel; each source loads independently (one failing never blanks the page); every result links back to its original record.

**Guiding principle (from the PRD, applies to every decision):** expose nothing in the aggregate that wasn't already public at the source, link back rather than re-publish, and never centralize sensitive identifiers (cédulas, reporter emails/phones). This is read-only discovery — reporting still happens on the source apps.

**Explicitly out of scope:** deduplication / entity resolution — duplicates render as separate cards *by design* (Milestone 7, "later"). Do not build name-matching/merge logic unless the PRD's dedup milestone is explicitly in play. No write access, no bulk/export endpoint, no heavy normalization beyond field-mapping + encoding repair.

## Planned stack (decided in PRD §2)

Next.js (App Router) + TypeScript · TanStack Query (`useQueries` for parallel per-source loading) · Zod (typed boundary at each adapter) · CSS Modules · Upstash Redis or `unstable_cache` (server-side politeness cache) · Cloudflare Turnstile (issues the session token the API requires) · Vercel or Cloudflare Pages. A datastore (Postgres + `pg_trgm` / D1) is **not** a day-one dependency — add only when moving off live fan-out.

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
| **A** | desaparecidos (`DesaparecidosTerremotoVenezuela.md`) | `desaparecidos-terremoto-api.theempire.tech/api/personas` | Clean JSON `{items,total,page,pageSize,totalPages,counts}`; **Spanish** fields (`nombre,edad,ubicacion,foto,estado…`); epoch-ms timestamps. `estado: localizado → found`, else `missing`. |
| **C** | terremotovenezuela (`tERREMOTOENvENEZULEA.md`) | `terremotovenezuela.app/api/missing` | Clean JSON `{people,total,page,pageSize,totalPages}`; English fields (`name,age,lastSeen,photoUrl…`); epoch-ms `createdAt`. `resolvedAt` present → `found`, else `missing`. |
| **B** | venezuelatebusca (`VenezuelaTeBusca.md`) | `venezuela-te-busca-app.hellogafaro.workers.dev/_root.data` | **Remix turbo-stream** (index-referenced flat array, not plain JSON) **behind Cloudflare Turnstile**. Split `firstName`/`lastName`. |

**Source B is blocked by design (PRD Milestone 0).** Do **not** automate past its Turnstile — respecting their bot-gate is the same protection Reunir asserts for itself. B returns "not connected" in the UI until an *authorized* feed is obtained or B is scoped out. Before building a B scraper, check the open question: the three apps appear to share a `reconexion` S3 photo bucket — confirm whether they share a canonical upstream first.

### Encoding repair
Mojibake like `JosÃ©` / `DÃ­az` is double-decoded UTF-8. Fix at the **byte boundary** — decode upstream bytes with `TextDecoder('utf-8')` — not with a magic-fixup library. Only fall back to a repair pass for already-corrupted stored strings.

### UI flow (PRD §4)
Debounced (~280ms) search + status filter → `useQueries` fires the 3 proxy requests in parallel → each source has its own loading/error/"not connected" lamp → results merge **without dedup** → filter by status → grid. Empty state is an instruction ("probá con menos letras / quitá el filtro"), not a dead end. Mobile-first, keyboard accessible, reduced-motion respected.

## Self-protection (PRD §5) — relevant whenever touching `/api/*`

The app's own API must not become a free scraping target, *and* must not over-fortify a panicked relative on a cheap phone out. The intended floor: Turnstile token gate (no token → 401), CORS allowlist of own origin only, per-IP/per-token rate limits (~30 searches/min, tighter on deep pagination → 429 + `Retry-After`), `pageSize` cap, require non-empty/min-length `q` (no "return everything"), 30–60s server cache keyed on normalized query, robots.txt disallowing `/api/*`. The strongest protection is **data minimization** — even a full scrape yields only what was already public. Heavier auth only if real abuse appears.

## Politeness to upstreams
These are volunteers' apps. Rate-limit and cache outbound calls, use per-source timeouts + backoff + a circuit breaker on repeated 5xx, and identify the client with a descriptive User-Agent + contact URL. A wave of searches must never knock a source offline.

## Sensitivity

Real personal data about missing/found disaster victims (names, phones, photos, ID numbers). Don't commit scraped dumps, keep contact details and cédulas out of logs and sample fixtures, and keep them out of the canonical `Person` served to clients.
