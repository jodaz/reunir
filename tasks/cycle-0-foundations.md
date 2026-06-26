# Cycle 0 — Foundations

**PRD milestones:** M0 (Source B decision), M1 (Repo scaffold)
**Exit criterion:** App boots locally; canonical `Person` type + Zod schemas compile; the
Source B approach is explicitly decided (not left ambiguous).

## M0 — Source B decision (do this first; it's a blocker)
- [ ] Confirm whether the three apps share a canonical `reconexion` upstream (the shared S3
      photo bucket is a hint) — if so, a 4th scraper may be unnecessary.
- [ ] Reach out to the venezuelatebusca project for a sanctioned feed/webhook.
- [ ] **Decide & record** in the PRD: authorized feed obtained, OR Source B scoped out for now.
      No Turnstile bypass is an acceptable outcome — "not connected" lamp is fine.
- [ ] Document the decision and rationale at the top of `cycle-1`'s adapter notes.

## M1 — Repo scaffold
- [ ] `create-next-app` (App Router, TypeScript, ESLint). Confirm `npm run dev` boots.
- [ ] Wire CSS Modules; port any existing CSS as-is (no rewrite churn).
- [ ] Add dependencies: `@tanstack/react-query`, `zod`. Defer Upstash/Turnstile SDKs to their cycles.
- [ ] Define the canonical `Person` type (PRD §3.1): namespaced `id` (`a:`/`b:`/`c:`),
      `source: "a"|"b"|"c"`, `status: "missing"|"found"`, **no** cédula / reporter contact.
- [ ] Set up a TanStack Query provider at the app root.
- [ ] Establish folder layout: `app/api/sources/*`, adapters module, schemas module, UI components.
- [ ] Add `.env.example` documenting expected vars (cache URL, Turnstile keys — values later).
- [ ] Add lint/format scripts; verify `npm run lint` passes on the scaffold.
- [ ] Update `CLAUDE.md` "Project status" / commands section once `dev`/`build`/`lint`/`test` exist.

**Done when:** the app runs, the `Person` contract is the single source of truth other cycles
import, and Cycle 1 can start without re-litigating Source B.
