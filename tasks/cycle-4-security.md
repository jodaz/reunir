# Cycle 4 — Security baseline

**PRD milestone:** M5 (Security baseline)
**Exit criterion:** The app's own API is no longer a free scraping target, *without* blocking a
panicked relative on a cheap phone. Turnstile + rate limits + minimization is the floor.

## Human-proof token gate
- [ ] Cloudflare Turnstile on first load; on pass, issue a short-lived signed token
      (httpOnly cookie or JWT, ~15–30 min).
- [ ] `/api/sources/*` **require** the token; no token → 401.

## Origin & transport
- [ ] CORS allowlist = own origin only (no wildcard).
- [ ] Server-side `Origin`/`Referer` check as a secondary signal.
- [ ] HTTPS only; HSTS.

## Rate limiting
- [ ] Sliding-window limits per IP **and** per token (~30 searches/min, burst smoothing).
- [ ] Tighter caps on deep pagination.
- [ ] Return `429` + `Retry-After`; don't leak internal details.

## Shape the surface
- [ ] `pageSize` capped server-side (max ~48) regardless of request.
- [ ] Require non-empty, minimum-length `q` (no "return everything" query).
- [ ] Confirm IDs stay opaque/non-sequential (no `?id=1,2,3` enumeration).
- [ ] Verify **no** bulk/export endpoint exists.

## Data minimization (most important)
- [ ] Audit every served field: no cédula, no reporter email/phone on the wire.
- [ ] Photos: proxy or hotlink to source; never re-host on a bulk-downloadable path.

## Policy & legal
- [ ] `robots.txt` disallowing crawlers on `/api/*`.
- [ ] Terms of Use: prohibit automated collection + re-identification; state humanitarian,
      non-commercial purpose.
- [ ] Contact + opt-out path for source projects and listed individuals.

**Done when:** an unauthenticated `curl` to `/api/sources/*` is blocked, limits return 429, and
a full successful scrape would yield only already-public fields.
