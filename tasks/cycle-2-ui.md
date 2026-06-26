# Cycle 2 — Search UI

**PRD milestone:** M3 (UI wired to `useQueries`)
**Exit criterion:** One search box fans out to all sources in parallel; each loads
independently; status filter works; every loading/error/empty state is handled.

## Search & fan-out
- [ ] Search input, debounced ~280ms.
- [ ] `useQueries` firing the 3 proxy requests in parallel (A, C, B-stub).
- [ ] Each source has its **own** loading/error/"not connected" state — one failing never
      blanks the page.
- [ ] Merge results **without dedup** (duplicates as separate cards by design).
- [ ] Status filter: all / missing (sin contacto) / found (localizado).

## Result card
- [ ] Photo with initials fallback; name; age; last-seen location; description.
- [ ] Status pill (sin contacto / localizado); source badge; link back to source record.

## Source-status strip ("lamps")
- [ ] Per-source indicator: searching / N results / offline (*sin conexión*) / not connected.
- [ ] Summary line of total results across sources.

## States
- [ ] Skeletons while loading → cards on arrival.
- [ ] Empty state is an *instruction* ("probá con menos letras / quitá el filtro"), not a dead end.
- [ ] Per-source error shows in its lamp without removing other sources' results.

## Accessibility & responsiveness
- [ ] Mobile-first layout.
- [ ] Keyboard accessible (focus order, search, filter, card links).
- [ ] `prefers-reduced-motion` respected.

**Done when:** searching shows partial results as each source resolves, the filter works, and
no source's failure degrades the others.
