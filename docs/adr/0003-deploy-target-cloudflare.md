# ADR 0003 — Deploy target = Cloudflare (Workers via OpenNext)

- **Status:** Accepted
- **Date:** 2026-06-26
- **Decider:** Reunir maintainer
- **Author:** devops-specialist
- **Depends on:** ADR 0002 (scaffold: Next.js App Router route handlers behind one gateway)

## Context

PRD §2 left hosting as an open either-or: **"Vercel (or Cloudflare Pages + Workers)."** This
ADR settles it. The decision matters now (Cycle 0) because the deploy runtime constrains how
Cycle 1+ writes the `/api/sources/*` route handlers — a Workers target forbids Node-only APIs
that a Vercel/Node target would tolerate, so backend code must be written runtime-aware from the
first adapter, not retrofitted.

Reunir's protection model (PRD §5) and several of its dependencies already live in the
Cloudflare ecosystem:

- **Turnstile** (the bot gate that issues the session token the API requires, PRD §5.1 / Cycle 4)
  is Cloudflare-native.
- **WAF + Bot Management** (Cycle 5 hardening) are Cloudflare products.
- Two of the three upstreams already run on Cloudflare — Source B is a
  `*.workers.dev` Worker behind Turnstile; the shared media/photo hosts sit behind Cloudflare.
- Edge execution close to Venezuelan users (the audience is panicked relatives, often on cheap
  phones / poor connectivity) favours a global edge runtime.

Consolidating hosting, the bot gate, and the WAF/Bot rules under **one** Cloudflare account
removes a cross-vendor seam (e.g. validating Turnstile tokens issued by Cloudflare on a Vercel
edge function, or correlating WAF events across two dashboards) and gives one place to reason
about the §5 posture end-to-end.

## Decision

**Host Reunir on Cloudflare**, running the Next.js App Router app on **Cloudflare Workers** via
the **OpenNext Cloudflare adapter (`@opennextjs/cloudflare`)**.

### Adapter: OpenNext (`@opennextjs/cloudflare`), not `@cloudflare/next-on-pages`

As of 2026 the OpenNext Cloudflare adapter is the **recommended and actively-maintained** way to
run Next.js on Cloudflare; the older Pages-based `@cloudflare/next-on-pages` is **deprecated**
and Cloudflare's own docs steer new Next.js projects to OpenNext. Verified against:

- OpenNext Cloudflare docs — <https://opennext.js.org/cloudflare>
- Cloudflare Workers framework guide (Next.js) —
  <https://developers.cloudflare.com/workers/framework-guides/web-apps/nextjs/>
- Cloudflare blog, "Deploy your Next.js app to Cloudflare Workers with the Cloudflare adapter for
  OpenNext" — <https://blog.cloudflare.com/deploying-nextjs-apps-to-cloudflare-workers-with-the-opennext-adapter/>

The decisive technical difference for Reunir:

| | `@cloudflare/next-on-pages` (deprecated) | `@opennextjs/cloudflare` (chosen) |
|---|---|---|
| Runtime for routes | **Edge runtime only** | **Next.js Node.js runtime** on `workerd` |
| App Router / Route Handlers | partial | full support |
| Node APIs | mostly unavailable | available via `nodejs_compat` |
| Status | deprecated | recommended, Cloudflare-backed |

OpenNext lets route handlers use the **Node.js runtime** (on Cloudflare's `workerd` with the
`nodejs_compat` flag) rather than being forced onto the constrained Edge runtime. This is the
safer floor for our gateway/adapter code: `lib/http.ts`, `lib/gateway.ts`, the Zod boundary, and
the Upstash REST clients all run without us having to hand-audit every line against the Edge
runtime's smaller API surface.

### What this means for how Cycle 1+ writes route handlers

The constraint is mild but real — write **Web-standard, Workers-compatible** code:

- Use the global **`fetch`**, `AbortController`/`AbortSignal`, `TextDecoder`, `URL`, Web Crypto
  (`crypto.subtle`) — all already what the scaffold uses (`lib/http.ts` is `fetch` + `TextDecoder`
  + `AbortController`; nothing to change).
- **Do not** introduce Node-only built-ins casually (`fs`, raw `net`/`tls`, native addons). Where
  a Node API is genuinely needed, it must work under `nodejs_compat` — confirm before adopting.
- Prefer **`@upstash/redis`'s REST client** (HTTP-based, Workers-friendly) over any TCP/`pg`-style
  driver. This already matches ADR 0002's "live fan-out, no datastore day-one" stance.
- **No `export const runtime = "edge"`** pinning is required (OpenNext uses the Node runtime);
  and Node.js middleware (Next 15.2+) is not supported on this adapter — keep middleware logic in
  the gateway wrapper, which is where ADR 0002 already centralizes it.

These are conventions for Cycle 1+, captured here so the backend-specialist does not write code
that only runs on a Node host and then breaks at first deploy.

### Where the pieces live (described — NOT implemented in this cycle)

- **Cache / rate-limit store: Upstash Redis (unchanged).** Still the politeness cache (Cycle 4)
  and the rate-limit counter store (Cycle 5), accessed via its **REST API** (`@upstash/redis`,
  `@upstash/ratelimit`) — works cleanly from Workers. `unstable_cache` remains the no-dependency
  fallback for local dev. Wiring stays behind the `lib/gateway.ts` hooks per ADR 0002.
- **Bot gate: Cloudflare Turnstile (native).** Site key (client widget) + secret key (server-side
  siteverify) — Cycle 4. Same vars already stubbed in `.env.example`.
- **WAF + Bot Management:** Cloudflare zone rules in front of the Worker — Cycle 5. Configured in
  the Cloudflare dashboard / via API, captured as a runbook (see `docs/GO-LIVE.md`).
- **Secrets:** set with **`wrangler secret put`** (or the Workers/Pages dashboard → "Variables and
  Secrets"); for build-time vars consumed by `next build`, set them in **Workers Builds → Build
  variables and secrets**. `.env.example` stays the documented, secret-free template; real values
  never land in the repo.
- **Config files (to be added in the deployment cycle, NOT now):**
  - `wrangler.jsonc` — `main: ".open-next/worker.js"`,
    `assets: { directory: ".open-next/assets", binding: "ASSETS" }`,
    `compatibility_date` (a 2024-09-23-or-later date), and
    `compatibility_flags: ["nodejs_compat"]`.
  - `open-next.config.ts` — OpenNext adapter config (cache/queue overrides as needed).
  - `package.json` scripts — roughly
    `"preview": "opennextjs-cloudflare build && opennextjs-cloudflare preview"` and
    `"deploy": "opennextjs-cloudflare build && opennextjs-cloudflare deploy"`.
  - Dependencies `@opennextjs/cloudflare` (runtime) + `wrangler` (devDep).

## Scope of this ADR (important)

This is a **documentation-only** decision. We deliberately **do not** add `@opennextjs/cloudflare`,
`wrangler`, a `wrangler.jsonc`, an `open-next.config.ts`, or any deploy script in this cycle —
introducing the adapter and config is a self-contained **deployment-cycle implementation task**,
and doing it now risks the currently-green scaffold build. The decision is recorded so Cycle 1+
codes to the Workers runtime; the wiring follows in its own task.

## Consequences

- **Positive:** one ecosystem for hosting + Turnstile + WAF/Bot Management; edge proximity to
  users; Node.js runtime via OpenNext keeps gateway/adapter code straightforward; Upstash plan
  (ADR 0002) is unchanged.
- **Cost:** a build/transform step (`opennextjs-cloudflare build`) sits between `next build` and
  deploy; preview runs in `workerd`, which differs subtly from the Next dev server — CI must build
  through the adapter, not just `next build`, before promoting.
- **Watch:** Workers bundle size limits (3 MiB free / 10 MiB paid, gzipped) — keep server deps
  lean. Node.js middleware is unsupported — keep cross-cutting logic in `lib/gateway.ts`.

## Follow-ups (deployment cycle)

1. Add `@opennextjs/cloudflare` + `wrangler`, `wrangler.jsonc`, `open-next.config.ts`, and the
   `preview`/`deploy` scripts; verify `opennextjs-cloudflare build` succeeds locally and in
   `workerd` preview.
2. **CI build gate:** extend the pipeline beyond `lint`/`typecheck`/`test`/`next build` to run the
   OpenNext build so a Workers-incompatible change fails CI, not production.
3. **Preview deploys:** wire Cloudflare Workers Builds (or CI) to publish a preview per PR;
   promote on green.
4. Provision the Cloudflare account, Pages/Workers project, Turnstile keys, Upstash instance,
   domain/DNS/HSTS, and secrets — tracked as the human checklist in `docs/GO-LIVE.md`.
