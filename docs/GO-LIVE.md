# Reunir — Go-Live checklist (human-only prep)

Manual steps a human must perform to reach production on **Cloudflare** (Workers via the OpenNext
adapter — see ADR 0003). These are **not** automatable from CI: they require account access,
issuing real secrets, DNS, and judgement calls. Each item is mapped to the cycle that needs it.
Keep this file in the repo and tick boxes as they land.

> **Guardrail (PRD §5.9):** the floor is Turnstile + rate limits + data minimization. Do **not**
> add a login wall, an aggressive challenge that blocks a panicked relative on a cheap phone, or
> any export/admin dump endpoint. Heavier auth only on evidence of real abuse.
> **Never** stand up automation that bypasses Source B's Turnstile.

---

## Cycle 0/1 — account + project foundation

- [ ] Create / designate the **Cloudflare account** that will own Reunir.
- [ ] Create the **Workers project** (OpenNext output: `main = .open-next/worker.js`) and link it
      to this Git repo for **Workers Builds** (preview per PR, promote on green).
- [ ] Confirm the deployment-cycle follow-up from ADR 0003 is done before first deploy:
      `@opennextjs/cloudflare` + `wrangler` added, `wrangler.jsonc` (with
      `compatibility_flags: ["nodejs_compat"]` and a `compatibility_date` ≥ 2024-09-23),
      `open-next.config.ts`, and `preview`/`deploy` scripts present.
- [ ] Verify `opennextjs-cloudflare build` succeeds and the app runs in `workerd` preview.

## Cycle 4 — security baseline (Turnstile, cache, CORS, HTTPS)

- [ ] **Turnstile:** create a Turnstile widget in the Cloudflare dashboard for the production
      hostname (+ localhost for dev). Record:
  - [ ] `TURNSTILE_SITE_KEY` (public, client widget)
  - [ ] `TURNSTILE_SECRET_KEY` (server-side siteverify — **secret**)
- [ ] **Upstash Redis:** create a Redis database (politeness cache + later rate-limit store).
      Record:
  - [ ] `UPSTASH_REDIS_REST_URL`
  - [ ] `UPSTASH_REDIS_REST_TOKEN` (**secret**)
  - [ ] Confirm `CACHE_TTL_SECONDS` (default 60) is acceptable.
  - **Note:** the Cycle 3 cache + circuit breaker already work *without* Upstash (in-memory
    per-isolate fallback). Upstash is **required for production correctness** on Cloudflare
    Workers — without it, cache/breaker state is per-isolate so the politeness guarantees and
    (Cycle 4) rate limits won't hold across the fleet. Provision before real traffic.
- [ ] **Session token secret:** generate a strong random `SESSION_TOKEN_SECRET`
      (e.g. `openssl rand -base64 32`) — **secret**, never committed.
- [ ] **Domain + DNS + TLS:** point the production domain at the Worker; enable
      **Always Use HTTPS** and **HSTS** in the Cloudflare zone.
  - [ ] Set `ALLOWED_ORIGIN` to the production origin (CORS allowlist = own origin only).
- [ ] **robots.txt** disallowing `/api/*` is served (verify after deploy).
- [ ] **Set secrets** in the Worker via `wrangler secret put <NAME>` (or dashboard →
      Variables and Secrets). For build-time vars, set them in **Workers Builds → Build variables
      and secrets**. Secrets: `TURNSTILE_SECRET_KEY`, `UPSTASH_REDIS_REST_TOKEN`,
      `SESSION_TOKEN_SECRET`. Non-secret config (`TURNSTILE_SITE_KEY`, `ALLOWED_ORIGIN`,
      `RATE_LIMIT_PER_MIN`, `MAX_PAGE_SIZE`, `UPSTASH_REDIS_REST_URL`, source base URLs, UA/contact)
      can be plain Workers vars.
- [ ] Confirm **per-IP / per-token rate limiting** returns `429 + Retry-After` once wired
      (tighter on deep pagination) — `RATE_LIMIT_PER_MIN` default 30.

## Cycle 5 — hardening (WAF, Bot Management, monitoring)

- [ ] **WAF rules** in front of the Worker (Cloudflare zone): block obvious abuse without
      challenging ordinary searchers. Keep it light per the §5.9 guardrail.
- [ ] **Bot Management / Bot Fight Mode** tuned so it does not break legitimate mobile traffic.
- [ ] **Honeypot** wiring verified (decoy field/endpoint flags scrapers, never trips real users).
- [ ] **Canary records** seeded and documented (a marked record that, if it surfaces off-platform,
      proves a bulk scrape) — keep the list of canaries out of the public repo.
- [ ] **Monitoring / alerts** on abnormal patterns:
  - [ ] high distinct-query volume per token
  - [ ] sequential paging to the end of results
  - [ ] identical timing intervals between requests
- [ ] Alert destination configured (email to **jesus@jodaz.xyz** and/or a chat webhook).

## Legal / trust surface

- [ ] **Terms of Use** page published (read-only discovery, links back, no re-publication).
- [ ] **Opt-out / abuse** page published, contact **jesus@jodaz.xyz** (a dedicated mailbox can
      replace it later). Describes how a source/subject requests removal.
- [ ] Privacy note: confirm no sensitive identifiers (cédulas, reporter email/phone) are ever
      served — verified against the canonical `Person` contract (ADR 0002).

## Source B (venezuelatebusca)

- [x] Source B ships as a **"not connected"** stub (ADR 0001) — no Turnstile automation, ever.
- [ ] **Outreach to venezuelatebusca — IN PROGRESS.** Draft ready at
      `docs/outreach/venezuelatebusca.md`, to be sent from jesus@jodaz.xyz, requesting a
      sanctioned feed OR confirming reachability via the shared `reconexion` / Source C upstream.
- [ ] Revisit B only when (1) an authorized feed exists, or (2) overlap analysis shows B adds
      unique coverage reachable through a sanctioned path.
