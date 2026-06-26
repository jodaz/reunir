# Reunir — Task Cycles

Work plan broken into development cycles, derived from `PRD.md` §6 (Milestones). Each cycle
is a self-contained chunk with a clear exit criterion; cycles are ordered by dependency.

| Cycle | Theme | PRD milestone(s) | Exit criterion |
|---|---|---|---|
| [0](cycle-0-foundations.md) | Foundations | M0 Source B decision · M1 Repo scaffold | App boots; `Person` type + Zod schemas exist; Source B path decided |
| [1](cycle-1-core-adapters.md) | Core adapters | M2 Adapters A & C live | Real data flows through `/api/sources/{desaparecidos,terremoto}` |
| [2](cycle-2-ui.md) | Search UI | M3 UI wired to `useQueries` | Search box fans out, per-source lamps, status filter, all states |
| [3](cycle-3-resilience.md) | Resilience & politeness | M4 Politeness layer | Per-source timeout/backoff/circuit-breaker + cache in place |
| [4](cycle-4-security.md) | Security baseline | M5 Security baseline | Turnstile gate, CORS, rate limits, pageSize caps, robots + ToS |
| [5](cycle-5-hardening.md) | Hardening | M6 Hardening | WAF/bot rules, honeypot, canary records, monitoring |
| [6](cycle-6-dedup.md) | Dedup (later) | M7 Dedup | Entity resolution behind a review queue — **deferred** |

## Conventions
- `[ ]` open · `[~]` in progress · `[x]` done · `[-]` dropped/n-a
- Source letters per PRD: **A** = desaparecidos (theempire.tech), **B** = venezuelatebusca
  (Turnstile-gated), **C** = terremotovenezuela.
- Hard rule across all cycles: never bypass Source B's Turnstile; never serve cédula /
  reporter email/phone to the client; no bulk/export endpoint.
