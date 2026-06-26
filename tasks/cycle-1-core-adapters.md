# Cycle 1 — Core adapters (A & C)

**PRD milestone:** M2 (Adapters A & C live)
**Exit criterion:** Real upstream data flows through the proxy, encoding-repaired and
Zod-validated, mapped to `Person`, with sensitive fields stripped.

Adapter pipeline (every source): fetch upstream → repair encoding → Zod-validate *raw shape*
→ map to `Person` → strip sensitive fields → cap `pageSize` (max ~48) → return
`{ items: Person[], page, totalPages }`.

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
