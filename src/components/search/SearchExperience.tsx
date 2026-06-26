"use client";

import { useMemo, useState } from "react";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { MIN_QUERY_LENGTH } from "./sources";
import { useSourceQueries } from "./useSourceQueries";
import { SearchControls, type StatusFilter } from "./SearchControls";
import { SourceLamps } from "./SourceLamps";
import { ResultGrid } from "./ResultGrid";
import styles from "./search.module.css";

/**
 * Orchestrates the search experience (PRD §4):
 *   debounced search + status filter → useQueries fan-out to the 3 proxies in parallel →
 *   merge WITHOUT dedup → filter by status → lamps + summary + result grid.
 *
 * The status filter runs purely client-side over already-fetched items, so toggling it never
 * refetches and never blanks results that are still arriving from other sources.
 */
export function SearchExperience() {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<StatusFilter>("all");

  const debounced = useDebouncedValue(query.trim(), 280);
  const hasQuery = debounced.length >= MIN_QUERY_LENGTH;

  const { states, items, isSearching, totalResults } =
    useSourceQueries(debounced);

  const visibleItems = useMemo(
    () =>
      status === "all" ? items : items.filter((p) => p.status === status),
    [items, status],
  );

  // The filter is actively hiding results the sources did return.
  const statusFiltered = status !== "all" && items.length > visibleItems.length;

  return (
    <div className={styles.experience}>
      <header className={styles.header}>
        <h1 className={styles.title}>Reunir</h1>
        <p className={styles.tagline}>
          Búsqueda unificada de personas — terremoto Venezuela 2026.
        </p>
      </header>

      <SearchControls
        query={query}
        onQueryChange={setQuery}
        status={status}
        onStatusChange={setStatus}
      />

      <SourceLamps
        states={states}
        isSearching={isSearching}
        totalResults={totalResults}
        hasQuery={hasQuery}
      />

      <ResultGrid
        items={visibleItems}
        isSearching={isSearching}
        hasQuery={hasQuery}
        statusFiltered={statusFiltered}
      />
    </div>
  );
}
