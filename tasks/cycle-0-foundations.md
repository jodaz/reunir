# Cycle 0 — Foundations

**PRD milestones:** M0 (Source B decision), M1 (Repo scaffold)
**Exit criterion:** App boots locally; canonical `Person` type + Zod schemas compile; the
Source B approach is explicitly decided (not left ambiguous).

## M0 — Source B decision (do this first; it's a blocker)
- [x] Confirm whether the three apps share a canonical `reconexion` upstream (the shared S3
      photo bucket is a hint) — if so, a 4th scraper may be unnecessary.
      → Strong circumstantial evidence yes (ADR 0001); confirm empirically in Cycle 1/2.
- [~] Reach out to the venezuelatebusca project for a sanctioned feed/webhook.
      → Maintainer task, async; does not gate the build. B stays "not connected" until obtained.
- [x] **Decide & record** in the PRD: authorized feed obtained, OR Source B scoped out for now.
      No Turnstile bypass is an acceptable outcome — "not connected" lamp is fine.
      → Decided: "not connected" stub (`docs/adr/0001-source-b-decision.md`); PRD §7 + §6 updated.
- [x] Document the decision and rationale at the top of `cycle-1`'s adapter notes.

## M1 — Repo scaffold
- [x] `create-next-app` (App Router, TypeScript, ESLint). Confirm `npm run dev` boots.
- [x] Wire CSS Modules; port any existing CSS as-is (no rewrite churn).
- [x] Add dependencies: `@tanstack/react-query`, `zod`. Defer Upstash/Turnstile SDKs to their cycles.
- [x] Define the canonical `Person` type (PRD §3.1): namespaced `id` (`a:`/`b:`/`c:`),
      `source: "a"|"b"|"c"`, `status: "missing"|"found"`, **no** cédula / reporter contact.
- [x] Set up a TanStack Query provider at the app root.
- [x] Establish folder layout: `app/api/sources/*`, adapters module, schemas module, UI components.
- [x] Add `.env.example` documenting expected vars (cache URL, Turnstile keys — values later).
- [x] Add lint/format scripts; verify `npm run lint` passes on the scaffold.
- [x] Update `CLAUDE.md` "Project status" / commands section once `dev`/`build`/`lint`/`test` exist.

**Done when:** the app runs, the `Person` contract is the single source of truth other cycles
import, and Cycle 1 can start without re-litigating Source B.
