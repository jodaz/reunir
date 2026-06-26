# ADR 0004 — Source landscape correction (A reCAPTCHA, B reads-open)

- **Status:** Accepted
- **Date:** 2026-06-26
- **Cycle / Milestone:** Follow-up to Cycle 1 (adapters) — amends ADR 0001
- **Author:** main + backend-specialist
- **Supersedes/Amends:** ADR 0001's premise that "Source B is blocked by Turnstile (reads)"

## Context

The original design (PRD §3.3, ADR 0001) assumed: **A** is a clean, freely-consumable JSON
API; **B** is blocked for reads by Cloudflare Turnstile; **C** is clean JSON. We empirically
probed all three live upstreams (observation only — no gate bypass). Two of those assumptions
were wrong.

## Findings (live probes, 2026-06)

| Source | Probe result | Reality |
|---|---|---|
| **A** — `desaparecidos-terremoto-api.theempire.tech/api/personas` | **HTTP 403** `{"error":"ForbiddenError","message":"Verificación reCAPTCHA requerida"}` for every UA/Origin | **reCAPTCHA-gated** (Caddy→Node/Helmet). Not IP/UA/origin specific — a hard human-verification gate. We never got data server-side. |
| **B** — `venezuela-te-busca-app.hellogafaro.workers.dev/_root.data` | **HTTP 200**, full Remix turbo-stream (`totalCount: 28011`), **no challenge** | Reads are **open**; Turnstile only guards report *submission* (its `turnstileSiteKey` ships in the payload). BUT the raw feed **leaks `idNumber` (cédula) + `reporter` {name,phone,email}**. |
| **C** — `terremotovenezuela.app/api/missing` | HTTP 200, clean JSON | Confirmed open + healthy. **Federates the shared `reconexion` pool**: of 500 records for `q=jesus`, 52% use A's exact S3 bucket/account, 23% use B's `venezuelatebusca.com/media`, 25% none. |

The shared-`reconexion` backbone hypothesis (ADR 0001) is **confirmed**: C is a near-superset view
over the pool A and B draw from. Exact per-record coverage of A via C is **not measurable** —
photo keys are per-upload (0/15 of A's sample keys appear in C) and name-matching is the deferred
entity-resolution problem (Cycle 6) — but the overlap is substantial.

## Decision

1. **Source A → "not connected" stub.** A requires reCAPTCHA; we do not bypass human-verification
   gates (same principle that governed B in ADR 0001). `/api/sources/desaparecidos` returns a
   `NotConnectedResponse` (no live fetch — also avoids re-hitting their gate). The adapter
   (`fetchPage`/`mapToPerson`/raw schema) and its tests are **kept** for an eventual sanctioned feed.

2. **Source B → implemented live, PII stripped.** Reads are lawfully reachable, so B is now a real
   adapter: decode the Remix turbo-stream → map to `Person`. We **strip `idNumber` (cédula) and the
   entire `reporter` object (name/phone/email)** at the adapter boundary — they are never read into
   `Person`, never logged, never in fixtures. Our served view is therefore *more* private than B's
   own app: only already-public info (name, age, last-seen, description, photo, status). This honors
   the project's hard rule (never centralize cédulas / reporter contact) while still surfacing B's
   missing-person records.

3. **Source C → primary source.** The broadest open feed; already federates A's and B's pools.

## Consequences

- The three-source UX is preserved: A lamps *no conectado*, B and C return results.
- No new dependency: the turbo-stream decoder is hand-written (`src/lib/turbostream.ts`),
  Workers-compatible, routed through `fetchUpstream` (Cycle 3 timeout/retry/breaker/cache apply).
- `NotConnectedResponse.source` widened to `"a" | "b"`; the `Person` contract is unchanged.
- B's `sourceUrl` is the site root (`venezuelatebusca.com`) — no confirmed stable per-record deep
  link; revisit if B exposes one.
- Open follow-up: A reconnects only via a sanctioned feed; B's status mapping is conservative
  (found only on a positive signal).
