# ADR 0002 — Repo scaffold design (M1)

- **Status:** Accepted
- **Date:** 2026-06-26
- **Cycle / Milestone:** Cycle 0 — M1 (Repo scaffold)
- **Author:** senior-architect
- **Implementer:** backend-specialist
- **Depends on:** ADR 0001 (Source B = "not connected" stub)

## Purpose

Pin down the scaffold concretely enough that the backend-specialist implements M1 without
re-deciding structure, types, validation strategy, dependencies, env, or where cross-cutting
protection lives. This is design only — no feature code here.

## 1. Folder layout (Next.js App Router + TypeScript, `src/` dir)

```
sismos-cycle-0/
├─ src/
│  ├─ app/
│  │  ├─ layout.tsx                # root layout; mounts <QueryProvider>
│  │  ├─ page.tsx                  # search page shell (full UI lands Cycle 3)
│  │  ├─ globals.css               # global resets only
│  │  └─ api/
│  │     └─ sources/
│  │        ├─ desaparecidos/route.ts   # Source A  (live in Cycle 1)
│  │        ├─ terremoto/route.ts       # Source C  (live in Cycle 1)
│  │        └─ vtb/route.ts             # Source B  ("not connected" stub)
│  │
│  ├─ lib/
│  │  ├─ types.ts                  # canonical Person + Status + ProxyResponse (single source of truth)
│  │  ├─ http.ts                   # placeholder: fetchUpstream() wrapper (timeout/UA/decode) — full impl Cycle 4
│  │  ├─ gateway.ts                # placeholder: withGateway() route wrapper (token/CORS/ratelimit/cache) — full impl Cycles 4/5
│  │  ├─ encoding.ts               # placeholder: decodeUtf8() / repairMojibake() — full impl Cycle 1
│  │  └─ env.ts                    # reads & validates process.env (Zod), exports typed config
│  │
│  ├─ adapters/
│  │  ├─ index.ts                  # re-exports; maps source letter → adapter
│  │  ├─ desaparecidos.ts          # raw Zod schema + mapToPerson() for A (Cycle 1)
│  │  ├─ terremoto.ts              # raw Zod schema + mapToPerson() for C (Cycle 1)
│  │  └─ vtb.ts                    # stub: returns the "not connected" marker (Cycle 1)
│  │
│  ├─ schemas/
│  │  ├─ person.ts                 # Zod schema mirroring the Person TS type (boundary out)
│  │  └─ proxy.ts                  # Zod schema for ProxyResponse + query-params (q/page/pageSize)
│  │
│  ├─ components/
│  │  ├─ providers/QueryProvider.tsx   # 'use client'; TanStack QueryClientProvider
│  │  └─ .gitkeep                  # SearchBox/ResultCard/SourceLamp land Cycle 3
│  │
│  └─ test/
│     └─ fixtures/                 # raw upstream sample JSON (NO sensitive fields) — for Cycle 1 unit tests
│
├─ docs/adr/                       # this file + 0001
├─ public/
├─ .env.example
├─ next.config.ts
├─ tsconfig.json
├─ eslint.config.mjs
├─ package.json
└─ CLAUDE.md
```

Notes:

- Keep `lib/` (cross-cutting, framework-agnostic helpers) separate from `adapters/` (per-source
  fetch+map) and `schemas/` (pure Zod). Routes stay thin: parse query → call adapter via the
  gateway wrapper → return.
- `schemas/` vs `adapters/`: `schemas/` holds the _canonical/outbound_ shapes (`Person`,
  `ProxyResponse`). Each adapter owns its own _raw upstream_ schema locally (co-located with its
  `mapToPerson`) because raw shapes are a per-source concern that changes when an upstream
  redeploys.

## 2. Canonical `Person` type (verbatim — PRD §3.1)

Put this in `src/lib/types.ts`. It is the single source of truth every cycle imports. Do **not**
add `cédula`, reporter email, or reporter phone — their absence is deliberate.

```ts
type Status = "missing" | "found";

interface Person {
  id: string; // namespaced: "a:<id>", "b:<id>", "c:<id>"
  source: "a" | "b" | "c";
  name: string;
  age: number | null;
  location: string; // last seen
  description: string;
  photoUrl: string | null;
  status: Status;
  contact: string; // public contact as published at source
  sourceUrl: string; // deep link back to the original record
}
```

Also export the shared proxy response shape (PRD §3.2) from `types.ts`:

```ts
interface ProxyResponse {
  items: Person[];
  page: number;
  totalPages: number;
}
```

For Source B's stub, model the "not connected" state explicitly so the UI can branch on it
without guessing (shape decided here, returned by `adapters/vtb.ts`):

```ts
interface NotConnectedResponse {
  status: "not_connected";
  source: "b";
  reason: string; // short, user-facing, e.g. "Fuente no conectada"
}
```

## 3. Zod boundary strategy

One **raw-upstream** schema per source, plus mapping to the canonical `Person`. Validate the raw
shape, then map — never validate against `Person` directly at the inbound boundary.

- **Per source (in `adapters/<source>.ts`):**
  - `RawAItem` / `RawAResponse` (Spanish fields), `RawCItem` / `RawCResponse` (English fields)
    Zod schemas describing exactly what the upstream returns. Be permissive on unknown extra
    keys (`.passthrough()` not required, but do **not** `.strict()` — upstreams add fields), and
    explicit on the fields we consume.
  - `mapToPerson(raw): Person` — the **only** place sensitive fields are dropped. Source A's
    `localizado*` fields, Source B's `idNumber`/`reporter`, etc. are simply never read into
    `Person`. Namespacing (`a:`/`b:`/`c:`) and `sourceUrl` construction happen here.
- **Canonical (in `schemas/person.ts`, `schemas/proxy.ts`):** a `PersonSchema` mirroring the TS
  type and a `ProxyResponseSchema`. Used to assert the _outbound_ contract in tests and
  (optionally) as a final safety net before serialization. The TS `interface` stays the
  human-facing source of truth; the Zod schema is derived to match it (`z.infer` must equal
  `Person`).
- **Query params (in `schemas/proxy.ts`):** a `QuerySchema` that parses/validates
  `q` (non-empty, min length), `page` (>=1), `pageSize` (clamped to max 48). Centralizes the
  PRD §5.4 caps so every route enforces them identically.

Status mapping lives in each adapter: A → `estado === "localizado" ? "found" : "missing"`;
C → `resolvedAt != null ? "found" : "missing"`.

Encoding repair (`lib/encoding.ts`): decode upstream **bytes** with `TextDecoder('utf-8')` at the
byte boundary; only fall back to a string-level mojibake repair for already-corrupted stored
strings. Placeholder signatures now, full impl in Cycle 1.

## 4. Dependencies

**Install now (M1 scaffold):**

| Package                                     | Why                                                                      |
| ------------------------------------------- | ------------------------------------------------------------------------ |
| `next`, `react`, `react-dom`                | framework (App Router)                                                   |
| `typescript`, `@types/react`, `@types/node` | TS                                                                       |
| `@tanstack/react-query`                     | parallel per-source fetching (`useQueries`)                              |
| `zod`                                       | typed boundary at each adapter                                           |
| `eslint`, `eslint-config-next`              | lint (via create-next-app)                                               |
| `prettier`                                  | format script                                                            |
| `vitest` (devDep)                           | unit tests for Cycle 1 mapping/fixtures (set up config now, tests later) |

**Defer (do NOT install in M1):**

| Package                                            | Defer to                                 | Reason                                                 |
| -------------------------------------------------- | ---------------------------------------- | ------------------------------------------------------ |
| `@upstash/redis`, `@upstash/ratelimit`             | Cycle 4 (cache) / Cycle 5 (rate limit)   | not day-one; `gateway.ts` exposes the seam             |
| Turnstile server SDK / `@marsidev/react-turnstile` | Cycle 5 (security baseline)              | token gate is a placeholder in `gateway.ts` until then |
| any datastore client (`pg`, D1)                    | not until we leave live fan-out (PRD §2) | live fan-out only for now                              |

CSS: **CSS Modules** only (PRD §2) — no Tailwind, no CSS-in-JS. Decline create-next-app's
Tailwind option.

## 5. `.env.example` (document vars; real values land in later cycles)

```bash
# --- App identity / politeness (Cycle 1+) ---
# Descriptive User-Agent + contact URL sent to upstreams (PRD politeness).
REUNIR_USER_AGENT="ReunirBot/0.1 (+https://reunir.example/about)"
REUNIR_CONTACT_URL="https://reunir.example/about"

# --- Upstream base URLs (Cycle 1) ---
SOURCE_A_BASE_URL="https://desaparecidos-terremoto-api.theempire.tech"
SOURCE_C_BASE_URL="https://terremotovenezuela.app"
# Source B is "not connected" by design (ADR 0001) — no base URL, no Turnstile automation.

# --- Server-side politeness cache (Cycle 4; unset = no cache in dev) ---
UPSTASH_REDIS_REST_URL=""
UPSTASH_REDIS_REST_TOKEN=""
CACHE_TTL_SECONDS="60"

# --- Self-protection: token gate / rate limit (Cycle 5; unset = gate disabled in dev) ---
TURNSTILE_SITE_KEY=""
TURNSTILE_SECRET_KEY=""
SESSION_TOKEN_SECRET=""
ALLOWED_ORIGIN="http://localhost:3000"
RATE_LIMIT_PER_MIN="30"

# --- Server-enforced caps (PRD §5.4) ---
MAX_PAGE_SIZE="48"
```

`lib/env.ts` parses these with Zod, treating cache/Turnstile vars as optional so the app boots
locally with none of them set (features degrade gracefully: no cache, gate disabled in dev).

## 6. Where cross-cutting protection lives (centralized, placeholders now)

PRD §5 protections must live in **one** place, not scattered per-route. The seam:

- **`src/lib/gateway.ts` — `withGateway(handler)`**: a single wrapper every `/api/sources/*`
  route is wrapped in. It is the one chokepoint for, in order:
  1. Turnstile session-token check → 401 (Cycle 5)
  2. CORS allowlist / Origin check (Cycle 5)
  3. per-IP/per-token rate limit → 429 + `Retry-After` (Cycle 5)
  4. server-side cache lookup/store, keyed on normalized query (Cycle 4)
  5. `pageSize` cap + non-empty `q` enforcement (via `QuerySchema`, available from M1)

  In M1 this is a **pass-through** that already wires `QuerySchema` (caps) and leaves typed
  no-op hooks for the rest. Cycles 4/5 fill the hooks without touching any route.

- **`src/lib/http.ts` — `fetchUpstream()`**: the one chokepoint for _outbound_ politeness —
  per-source timeout, retry/backoff, circuit breaker, descriptive User-Agent + contact URL,
  byte-level UTF-8 decode. M1 ships a thin `fetch` wrapper with the UA wired; backoff/breaker
  land in Cycle 4.

Routes therefore stay trivial and protection cannot drift per-endpoint:

```
route.ts  =  withGateway(async (req, {q, page, pageSize}) => adapter.fetchPage(...))
```

## 7. M1 done criteria (from tasks/cycle-0-foundations.md)

- `pnpm dev` boots; `pnpm lint` passes; `pnpm build` succeeds.
- `Person`/`Status`/`ProxyResponse` compile and are importable as the single source of truth.
- Zod `PersonSchema`/`ProxyResponseSchema`/`QuerySchema` compile; `z.infer<PersonSchema>` matches
  `Person`.
- TanStack Query provider mounted at the app root.
- The three `/api/sources/*` routes exist; `vtb` returns the well-formed "not connected" response;
  `desaparecidos`/`terremoto` return a typed `501`/empty placeholder (real data is Cycle 1).
- `.env.example` present; `lib/env.ts` boots with nothing set.
- `CLAUDE.md` "Project status" + commands section updated to the real `dev`/`build`/`lint`/`test`.
