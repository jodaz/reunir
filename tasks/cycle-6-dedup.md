# Cycle 6 — Dedup (deferred)

**PRD milestone:** M7 (Later — Dedup)
**Status:** **Deferred — do not start unless explicitly prioritized.**

Per PRD §1, deduplication / entity resolution is *out of scope for now*: duplicates render as
separate cards by design. This cycle exists only to capture the eventual approach so it isn't
re-invented. Until then, the merge step in the UI must stay dedup-free.

## When triggered (not before)
- [ ] Entity-resolution service matching across sources (name + location + age; names are messy —
      mojibake, multiple people per field, variant spellings).
- [ ] Duplicates collapse into a single card **with a review queue** (human-in-the-loop, not
      auto-merge) to avoid wrongly merging distinct people.
- [ ] Preserve provenance: a merged card still links back to every source record.
- [ ] Likely trigger for this + a datastore (Postgres + `pg_trgm` / D1): moving off pure live
      fan-out to a cached/aggregated store.

## Sunset consideration (PRD non-functional)
- [ ] As formal response (Red Cross / OCHA) scales up, plan to integrate or wind down rather
      than leaving stale data behind.
