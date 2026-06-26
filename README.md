# Reunir

A unified, **read-only** search across three independent Venezuela 2026 earthquake
missing-persons registries. One search box fans out to all sources in parallel; each source
loads independently (one failing never blanks the page); every result links back to its
original record.

See [`PRD.md`](./PRD.md) for the full design and [`docs/adr/`](./docs/adr) for key decisions.

## Prerequisites

- **Node.js** ≥ 20
- **pnpm** (this repo is pinned to pnpm via the `packageManager` field — do not use npm/yarn)

## Getting started

```bash
pnpm install
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000).

## Scripts

```bash
pnpm dev          # start the dev server
pnpm build        # production build
pnpm start        # serve the production build
pnpm lint         # ESLint (eslint-config-next)
pnpm typecheck    # tsc --noEmit (type-check only)
pnpm format       # Prettier (planning docs are ignored)
pnpm test         # Vitest unit tests
```

## Deployment

Cloudflare (Workers via the OpenNext adapter) — see
[`docs/adr/0003-deploy-target-cloudflare.md`](./docs/adr/0003-deploy-target-cloudflare.md) and
[`docs/GO-LIVE.md`](./docs/GO-LIVE.md).

## Guiding principle

Expose nothing in the aggregate that wasn't already public at the source, link back rather than
re-publish, and never centralize sensitive identifiers (cédulas, reporter emails/phones).
