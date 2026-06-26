"use client";

import { useMemo } from "react";
import { useQueries } from "@tanstack/react-query";
import type { Person } from "@/lib/types";
import {
  fetchSource,
  isNotConnected,
  MIN_QUERY_LENGTH,
  SOURCES,
  type SourceKey,
  type SourceMeta,
} from "./sources";

/**
 * Per-source lamp state, derived from each parallel query. Discriminated by `phase`:
 *   - `idle`          — query disabled (no/too-short search yet).
 *   - `searching`     — request in flight.
 *   - `results`       — succeeded with N `Person` items.
 *   - `not_connected` — upstream we can't lawfully consume (currently Source A; see ADR 0004).
 *   - `error`         — request failed (e.g. an upstream 502) → *sin conexión*.
 */
export type SourcePhase =
  | "idle"
  | "searching"
  | "results"
  | "not_connected"
  | "error";

export interface SourceState {
  key: SourceKey;
  label: string;
  phase: SourcePhase;
  count: number;
  /** Short user-facing reason, e.g. a not-connected source's "Fuente no conectada". */
  reason?: string;
}

export interface FanOut {
  /** Per-source state, in display order — drives the lamp strip. */
  states: SourceState[];
  /** All `Person` items merged across sources, WITHOUT dedup (duplicates by design). */
  items: Person[];
  /** True while at least one source is still in flight. */
  isSearching: boolean;
  /** Total results across every source that returned items. */
  totalResults: number;
}

/**
 * Fans out the debounced query to the three proxies in parallel via `useQueries`. Each
 * source owns its own loading/error/not-connected state; one failing never affects another.
 * Merges results without dedup. Disabled until `q` reaches `MIN_QUERY_LENGTH`.
 */
export function useSourceQueries(q: string): FanOut {
  const enabled = q.trim().length >= MIN_QUERY_LENGTH;

  const results = useQueries({
    queries: SOURCES.map((source: SourceMeta) => ({
      queryKey: ["source", source.key, q] as const,
      queryFn: ({ signal }: { signal: AbortSignal }) =>
        fetchSource(source.endpoint, q, signal),
      enabled,
    })),
  });

  return useMemo<FanOut>(() => {
    const states: SourceState[] = [];
    const items: Person[] = [];

    results.forEach((result, i) => {
      const meta = SOURCES[i];
      let phase: SourcePhase = "idle";
      let count = 0;
      let reason: string | undefined;

      if (!enabled) {
        phase = "idle";
      } else if (result.isPending || result.isFetching) {
        phase = "searching";
      } else if (result.isError) {
        phase = "error";
      } else if (result.data) {
        if (isNotConnected(result.data)) {
          phase = "not_connected";
          reason = result.data.reason;
        } else {
          phase = "results";
          count = result.data.items.length;
          items.push(...result.data.items);
        }
      }

      states.push({ key: meta.key, label: meta.label, phase, count, reason });
    });

    return {
      states,
      items,
      isSearching: states.some((s) => s.phase === "searching"),
      totalResults: states.reduce((sum, s) => sum + s.count, 0),
    };
  }, [results, enabled]);
}
