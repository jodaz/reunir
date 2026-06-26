# Reunir — Workplan

A unified search across the three Venezuela earthquake missing-persons registries
(`desaparecidos-terremoto.theempire.tech`, `venezuelatebusca.com`, `terremotovenezuela.app`).
One search box, results from every source, with clear provenance back to the original record.

> **Guiding principle:** expose nothing in the aggregate that wasn't already public at the
> source, link back rather than re-publish, and never centralize sensitive identifiers
> (cédulas, reporter emails/phones) on any public surface.

---

## 1. Requirements

### Functional
- Single name search that fans out to all sources in parallel.
- Each source loads independently; one source failing never blanks the page.
- Per-source status indicator (searching / N results / offline).
- Result card: photo (with initials fallback), name, age, last-seen location, description,
  status pill (sin contacto / localizado), source badge, link back to the source record.
- Filter by status (all / missing / found).
- Mobile-first, keyboard accessible, reduced-motion respected.

### Non-functional
- **Politeness to upstreams:** rate-limit and cache outbound calls so a wave of searches
  never knocks a volunteer's app offline. Identify the client with a descriptive User-Agent
  and contact URL.
- **Resilience:** per-source timeouts, retries with backoff, circuit breaker on repeated 5xx.
- **Privacy:** sensitive fields are match-only, never rendered or served in bulk.
- **Self-protection:** the app's own API is not a free scraping target (see §5).
- **Sunsettable:** as formal response (Red Cross / OCHA) scales up, integrate or wind down
  rather than leaving stale data behind.

### Out of scope (for now)
- Deduplication / entity resolution (duplicates render as separate cards by design).
- Normalization beyond minimal field-mapping and encoding repair.
- Write access — this is read-only discovery; reports still happen on the source apps.

---

## 2. Stack

| Layer | Choice | Why |
|---|---|---|
| Framework | **Next.js (App Router) + TypeScript** | Proxy + UI in one repo/deploy |
| Data fetching | **TanStack Query** (`useQueries`) | Parallel per-source loading, retry, cache for free |
| Validation | **Zod** | Typed boundary at each adapter; catches upstream redeploys |
| Styling | **CSS Modules** | Port existing CSS as-is, no rewrite churn |
| Cache | **Upstash Redis** (or `unstable_cache`) | Server-side politeness cache |
| Bot gate | **Cloudflare Turnstile** | Issues the session token the API requires (see §5) |
| Hosting | **Vercel** (or Cloudflare Pages + Workers) | Edge, cron later for scheduled sync |

Add a datastore (Postgres + `pg_trgm`, or Cloudflare D1) **only** when you move from live
fan-out to a cached/aggregated store. Not a day-one dependency.

---

## 3. API structure

### 3.1 Canonical model

```ts
type Status = "missing" | "found";

interface Person {
  id: string;          // namespaced: "a:<id>", "b:<id>", "c:<id>"
  source: "a" | "b" | "c";
  name: string;
  age: number | null;
  location: string;    // last seen
  description: string;
  photoUrl: string | null;
  status: Status;
  contact: string;     // public contact as published at source
  sourceUrl: string;   // deep link back to the original record
}
```

Sensitive fields (`cédula`, reporter email/phone) are **deliberately absent** from `Person`.
If used at all, they live server-side for matching only and are never serialized to the client.

### 3.2 Proxy endpoints (one per source, same protected gateway)

Keeping per-source endpoints preserves the independent-loading UX; putting them behind one
middleware layer keeps protection in a single place.

```
GET /api/sources/desaparecidos?q=&page=&pageSize=   → { items: Person[], page, totalPages }
GET /api/sources/terremoto?q=&page=&pageSize=        → { items: Person[], page, totalPages }
GET /api/sources/vtb?q=&page=&pageSize=              → { items: Person[], page, totalPages }
```

Each handler: fetch upstream → repair encoding → Zod-validate raw shape → map to `Person`
→ strip sensitive fields → cap `pageSize` → return. No "dump everything" endpoint exists.

### 3.3 Adapter responsibilities (per source)

| Source | Shape | Notes |
|---|---|---|
| **A — desaparecidos** | Clean JSON, `q`, paginated | `estado: localizado → found`, else `missing` |
| **B — venezuelatebusca** | Remix turbo-stream + Turnstile | Parse server-side **only**; needs an authorized feed. Do **not** automate past Turnstile. Returns "not connected" until sorted. |
| **C — terremotovenezuela** | Clean JSON, `q`, paginated | `resolvedAt` present → `found`, else `missing` |

### 3.4 Encoding repair
The mojibake (`JosÃ©`, `DÃ­az`) is double-decoded UTF-8. Fix it at the byte boundary —
decode upstream bytes with the correct charset via `TextDecoder('utf-8')` — rather than a
magic-fixup library. Only fall back to a repair pass for already-corrupted stored strings.

---

## 4. UI flow

```
            ┌─────────────── Search input (debounced ~280ms) ───────────────┐
            │                          + status filter                       │
            └───────────────────────────────┬────────────────────────────────┘
                                            │ on change
                        ┌───────────────────┴───────────────────┐
                        │     useQueries: 3 parallel requests     │
                        └───┬──────────────┬──────────────┬───────┘
                       /sources/a     /sources/c     /sources/b
                            │              │              │
                  ┌─────────▼─────┐  ┌─────▼─────┐  ┌──────▼──────┐
                  │ loading│ok│err │  │loading│…  │  │ not connected│
                  └─────────┬─────┘  └─────┬─────┘  └──────┬──────┘
                            └──────────────┴───────────────┘
                                           │ merge (no dedup)
                                  ┌────────▼─────────┐
                                  │ filter by status  │
                                  └────────┬─────────┘
                                           │
        ┌──────────────────────────────────▼──────────────────────────────────┐
        │ Source-status strip (lamps)  ·  summary line  ·  results grid         │
        │ States: skeletons → cards → empty ("sin coincidencias") / per-src err │
        └───────────────────────────────────────────────────────────────────────┘
```

**State rules**
- Each source has its own loading/error state; the grid shows whatever has arrived.
- Empty state is an instruction ("probá con menos letras / quitá el filtro"), not a dead end.
- A source error shows in its lamp as *sin conexión* without removing other results.

---

## 5. Security — protecting your own API

The goal: serve real families freely while making **bulk extraction** of your aggregate
expensive and detectable. Defense in depth, ordered by impact.

> **Consistency note:** the protections below are exactly what Source B is asserting with its
> Turnstile. Respect theirs the way you want yours respected — get an authorized feed rather
> than bypassing it.

### 5.1 Gate access behind a human-proof token
- **Cloudflare Turnstile on first load.** On pass, issue a short-lived signed token
  (httpOnly cookie or JWT, ~15–30 min). The `/api/sources/*` routes **require** it.
- No token → 401. This alone stops the trivial `curl`/script scraper that hits your JSON
  directly.

### 5.2 Strict origin + transport
- **CORS allowlist of your own origin only.** No wildcard. Browsers from other origins
  can't call your API.
- Check `Origin`/`Referer` server-side as a secondary signal (spoofable, but raises cost).
- HTTPS only; HSTS.

### 5.3 Rate limiting
- Sliding-window limits **per IP and per token**, with low caps (e.g. 30 searches/min,
  with burst smoothing). Upstash Redis or Vercel's rate-limit primitives.
- Tighter caps on deep pagination — most real users never go past page 2–3.
- Return `429` with `Retry-After`; don't leak internal details.

### 5.4 Shape the surface so bulk is hard
- **No bulk/export endpoint.** Ever.
- **Cap `pageSize`** (e.g. max 48) server-side regardless of what's requested.
- **Opaque, non-sequential IDs** (you already namespace them) — no `?id=1,2,3…` enumeration.
- Require a non-empty, minimum-length `q` for results — no "return everything" query.

### 5.5 Caching as a shield
- Server-side cache (30–60s) in front of upstreams. A scraper hammering you can't translate
  into hammering the source apps, and they mostly get cached responses anyway.
- Cache keyed on normalized query so probing variations is cheap for you, not amplifying.

### 5.6 Bot detection & monitoring
- Put **Cloudflare WAF / Bot Management** in front; enable known-bot and anomaly rules.
- **Honeypot:** an invisible field or unused param that only bots fill — flag and throttle.
- Alert on abnormal patterns: high distinct-query volume per token, sequential paging to the
  end, identical timing intervals.
- **Canary records:** seed a few uniquely-named fake entries; if they appear on another site,
  you have proof of republication and a takedown basis.

### 5.7 Data minimization (the most important one)
- The canonical `Person` carries **no cédula, no reporter email/phone**. Even a fully
  successful scrape of your API yields only what was already public at the source.
- Photos: proxy or hotlink to source, don't re-host sensitive imagery on a bulk-downloadable path.

### 5.8 Policy & legal layer
- **`robots.txt`** disallowing crawlers on `/api/*` — a deterrent and a legal marker.
- **Terms of Use** prohibiting automated collection and re-identification, and stating the
  humanitarian, non-commercial purpose.
- A clear contact + opt-out path for the source projects and for listed individuals.

### 5.9 The tension to hold
Don't over-fortify. A login wall or aggressive challenge that blocks a panicked relative on a
cheap phone defeats the point. Turnstile + rate limits + minimization is the right floor;
heavier auth only if you see real abuse.

---

## 6. Milestones

| # | Milestone | Definition of done |
|---|---|---|
| 0 | **Source B decision** | Authorized feed obtained, or B scoped out. No Turnstile bypass. Check for a shared `reconexion` upstream first. |
| 1 | Repo scaffold | Next.js + TS, CSS Modules, canonical `Person` type, Zod schemas |
| 2 | Adapters A & C live | Real data through proxy, encoding repaired, Zod-validated |
| 3 | UI wired to `useQueries` | Independent loading, lamps, filter, all states |
| 4 | Politeness layer | Per-source timeout/backoff/circuit-breaker + 60s cache |
| 5 | Security baseline | Turnstile token gate, CORS allowlist, rate limits, pageSize caps, robots + ToS |
| 6 | Hardening | WAF/bot rules, honeypot, canary records, monitoring/alerts |
| 7 | (Later) Dedup | Entity-resolution service; duplicates collapse with review queue |

---

## 7. Open questions
- Is there a canonical `reconexion` upstream the three apps already share? (Found shared S3
  photo buckets — worth confirming before building a fourth scraper.)
- Can any source project give you a sanctioned feed or webhook instead of polling?
- Photo handling: hotlink vs proxy-and-cache — privacy vs reliability tradeoff.
- When to introduce the datastore (trigger: moving off pure live fan-out).
