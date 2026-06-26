# Cycle 1 — Core adapters (A & C)

**PRD milestone:** M2 (Adapters A & C live)
**Exit criterion:** Real upstream data flows through the proxy, encoding-repaired and
Zod-validated, mapped to `Person`, with sensitive fields stripped.

Adapter pipeline (every source): fetch upstream → repair encoding → Zod-validate *raw shape*
→ map to `Person` → strip sensitive fields → cap `pageSize` (max ~48) → return
`{ items: Person[], page, totalPages }`.

## M0 decision carried in (see `docs/adr/0001-source-b-decision.md`)
Cycle 0 settled Source B: **ship a well-formed "not connected" stub now, no Turnstile bypass
ever.** Rationale that affects this cycle:
- **Build A and C live; B is a deterministic stub** (`/api/sources/vtb` → `not_connected`).
- **Shared `reconexion` upstream is likely.** Source C's JSON already embeds Source B's media
  URLs *and* the same `reconexion-api-images` S3 bucket (AWS acct `147455119818`) that Source A
  uses. So B's records may already surface through C — **measure C's coverage against known B
  records during this cycle** before anyone considers a fourth scraper (open follow-up).
- **Never ingest B's `idNumber` (cédula) or `reporter` {name,phone,email}** — the very fields
  `Person` must never carry. This is also why `mapToPerson` is the single strip point for A/C.
- Outreach for a sanctioned B feed proceeds asynchronously (maintainer task); it does not gate
  this cycle.

## Shared adapter infrastructure
- [ ] Zod schemas for each raw upstream response (catch upstream redeploys at the boundary).
- [ ] `mapToPerson()` per source; central place to strip sensitive fields.
- [ ] Encoding repair via `TextDecoder('utf-8')` at the **byte boundary** (fixes `JosÃ©`/`DÃ­az`);
      no magic-fixup library. Add a fallback repair pass only for already-corrupted strings.
- [ ] Shared proxy response type `{ items, page, totalPages }`; enforce `pageSize` cap server-side.

## Source A — desaparecidos (`/api/sources/desaparecidos`)
- [ ] Fetch `desaparecidos-terremoto-api.theempire.tech/api/personas?q=&page=&pageSize=`.
- [ ] Map Spanish fields: `nombre→name`, `edad→age`, `ubicacion→location`, `foto→photoUrl`,
      `descripcion→description`, `contacto→contact`, epoch-ms timestamps.
- [ ] Status: `estado: "localizado" → "found"`, else `"missing"`.
- [ ] `id` namespaced `a:<id>`; `sourceUrl` deep-links back to the record.

## Source C — terremotovenezuela (`/api/sources/terremoto`)
- [ ] Fetch `terremotovenezuela.app/api/missing?q=&page=&pageSize=`.
- [ ] Map English fields: `name`, `age`, `lastSeen→location`, `photoUrl`, `description`, `contact`.
- [ ] Status: `resolvedAt` present → `"found"`, else `"missing"`.
- [ ] `id` namespaced `c:<id>`; `sourceUrl` deep-links back to the record.

## Source B — stub
- [ ] `/api/sources/vtb` returns a structured "not connected" response per the M0 decision
      (no live fetch, no Turnstile automation).

## Validation
- [ ] Unit tests: raw-fixture → `Person` mapping for A and C, including status edge cases and
      mojibake repair.
- [ ] Manual: hit each endpoint with a real query, confirm shape + no sensitive fields leak.

**Done when:** A and C return clean `Person[]` and B returns a well-formed "not connected".
