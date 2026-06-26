"use client";

import { useId } from "react";
import styles from "./search.module.css";

export type StatusFilter = "all" | "missing" | "found";

const FILTERS: { value: StatusFilter; label: string }[] = [
  { value: "all", label: "Todos" },
  { value: "missing", label: "Sin contacto" },
  { value: "found", label: "Localizados" },
];

/**
 * Search input (controlled by the parent; debounced upstream) + status filter. The filter is
 * a radiogroup of segmented buttons so it's reachable by keyboard with arrow keys and the
 * active option is announced. First in focus order: search, then filter, then results.
 */
export function SearchControls({
  query,
  onQueryChange,
  status,
  onStatusChange,
}: {
  query: string;
  onQueryChange: (value: string) => void;
  status: StatusFilter;
  onStatusChange: (value: StatusFilter) => void;
}) {
  const inputId = useId();

  return (
    <div className={styles.controls}>
      <div className={styles.searchField}>
        <label htmlFor={inputId} className={styles.srOnly}>
          Buscar persona por nombre
        </label>
        <input
          id={inputId}
          className={styles.searchInput}
          type="search"
          inputMode="search"
          autoComplete="off"
          autoCapitalize="words"
          spellCheck={false}
          placeholder="Buscar por nombre…"
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
        />
      </div>

      <div
        className={styles.filter}
        role="radiogroup"
        aria-label="Filtrar por estado"
      >
        {FILTERS.map((f) => {
          const active = status === f.value;
          return (
            <button
              key={f.value}
              type="button"
              role="radio"
              aria-checked={active}
              className={`${styles.filterButton} ${active ? styles.filterButtonActive : ""}`}
              onClick={() => onStatusChange(f.value)}
            >
              {f.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
