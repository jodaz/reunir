# ADR 0001 — Source B (venezuelatebusca) decision

- **Status:** Accepted
- **Date:** 2026-06-26
- **Cycle / Milestone:** Cycle 0 — M0 (gates Cycle 1)
- **Author:** senior-architect
- **Deciders:** Reunir maintainers

## Context

Reunir fans a single name search out to three independent Venezuela 2026 earthquake
missing-persons registries:

| Letter | App                  | Upstream                                                    | Shape                                              |
| ------ | -------------------- | ----------------------------------------------------------- | -------------------------------------------------- |
| A      | desaparecidos        | `desaparecidos-terremoto-api.theempire.tech/api/personas`   | Clean JSON, Spanish fields                         |
| C      | terremotovenezuela   | `terremotovenezuela.app/api/missing`                        | Clean JSON, English fields                         |
| B      | **venezuelatebusca** | `venezuela-te-busca-app.hellogafaro.workers.dev/_root.data` | **Remix turbo-stream behind Cloudflare Turnstile** |

M0 must decide Source B's path before Cycle 1 builds adapters, and must do so **without
bypassing Turnstile**. Two questions drive the decision:

1. Do the three apps share a canonical upstream (the "open question" in PRD §7)?
2. Given that, what is the right Source B integration path?

## Evidence: a shared `reconexion` upstream

Reasoning strictly from the sample payloads already captured in the source docs (no live access
to B past its Turnstile):

- **Source A** serves every photo from one host:
  `reconexion-api-images-147455119818.s3.us-east-1.amazonaws.com/images/<id>.jpg`.
  The bucket name `reconexion-api-images` and AWS account `147455119818` are the tell.
- **Source C** serves photos from **two** hosts, interleaved within a single response page:
  - `reconexion-api-images-147455119818.s3.us-east-1.amazonaws.com/images/<id>.jpg` (the _same_
    bucket/account as A), and
  - `venezuelatebusca.com/media/photos/<uuid>.webp` (Source **B's** media host).
- **Source B** serves photos from `/media/photos/...` — i.e. `venezuelatebusca.com/media`, the
  exact host that also appears inside Source C's responses.

The cross-references are mutual and concrete: Source C's clean JSON already embeds Source B's
media URLs _and_ the shared `reconexion` S3 bucket that Source A uses. The most parsimonious
explanation is a **shared "reconexion" data backbone** (a common image/record pool, AWS account
`147455119818`) that the three front-end apps federate, each exposing its own API and UI over an
overlapping set of records. They are not three disjoint datasets; they are three windows onto a
substantially shared pool.

**Implication:** a dedicated Source B scraper is very likely **redundant** — much of B's content
appears to already surface through Source C's clean, Turnstile-free JSON (and the shared S3
pool). This should be confirmed empirically in Cycle 1/2 (compare C's coverage against known B
records) before anyone considers building a fourth scraper.

## Evidence: Source B's raw payload leaks exactly what we must never centralize

The B turbo-stream sample contains, per person, decoded fields including:

- `idNumber` (e.g. `"156772440"`, `"11919154"`) — the **cédula**.
- a `reporter` object: `name`, `phone`, `email`
  (e.g. `"04145442076"`, `"viccaroly2528@gmail.com"`).

These are precisely the sensitive identifiers PRD §3.1 / §5.7 say `Person` must **never** carry.
Integrating B by scraping its `_root.data` would force us to ingest, parse, and discard exactly
the data we have committed never to centralize — a needless privacy liability — and the payload
also exhibits double-decoded mojibake (`JosÃ©`, `NiÃ±o`, `cafÃ©`) confirming it is a raw,
unsanitized internal feed, not a curated public API.

## Decision

**Option (c): ship a well-formed "not connected" stub for Source B now, and revisit.**

`GET /api/sources/vtb` returns a structured, successful "not connected" response (no live fetch,
no Turnstile automation). The UI renders B's lamp as _no conectado_ without blanking the page.
In parallel, maintainers:

1. **Reach out to the venezuelatebusca project** for a sanctioned feed/webhook (the only path to
   B's data we will accept).
2. **Confirm the shared-`reconexion` hypothesis** in Cycle 1/2 — measure how much of B's content
   is already reachable through Source C. If coverage is high, a separate B adapter may never be
   needed.

Revisit when either (1) an authorized feed exists, or (2) the overlap analysis shows B adds
material unique coverage _and_ a sanctioned access path is found.

### Why not (a) authorized feed now

No sanctioned feed exists yet; we cannot block Cycle 0/1 on an external party's response. Pursue
it asynchronously rather than gating the scaffold.

### Why not (b) scope out for now

"Scope out" implies removing B from the design. That is premature and loses the affordance: the
three-lamp UX and the `vtb` endpoint should exist from day one so that wiring an authorized feed
later is a drop-in, and so users see honest provenance ("3 sources, 1 not yet connected") rather
than a silently missing source. A stub keeps the seam open at near-zero cost.

## Hard rule (non-negotiable)

**No Turnstile bypass for Source B, ever.** No headless-browser solving, no token replay, no
challenge automation, no third-party solver. Respecting their bot-gate is the same protection
Reunir asserts for its own API (PRD §5). The only acceptable ways B becomes "connected" are an
**authorized feed/webhook from the venezuelatebusca project**, or confirmation that B's records
are already lawfully reachable through the shared upstream / Source C. If neither materializes, B
stays "not connected" indefinitely — that is an acceptable, principled outcome.

## Consequences

- Cycle 1 is unblocked: build A and C live; B is a deterministic stub.
- The `Person` contract and the three-source UX are fixed now; B is a wiring change later.
- We avoid ingesting cédulas and reporter contact details entirely.
- Open follow-ups (tracked into Cycle 1 notes): the overlap/coverage analysis, and the outreach
  for a sanctioned feed.
