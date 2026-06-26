"use client";

import type { Person } from "@/lib/types";
import { ResultCard } from "./ResultCard";
import styles from "./grid.module.css";

function SkeletonCard() {
  return (
    <div className={styles.skeleton} aria-hidden="true">
      <div className={styles.skeletonHeader}>
        <div className={styles.skeletonAvatar} />
        <div className={styles.skeletonLines}>
          <div className={`${styles.skeletonLine} ${styles.skeletonLineWide}`} />
          <div className={`${styles.skeletonLine} ${styles.skeletonLinePill}`} />
        </div>
      </div>
      <div className={styles.skeletonLine} />
      <div className={`${styles.skeletonLine} ${styles.skeletonLineWide}`} />
    </div>
  );
}

/**
 * The merged result grid. Shows skeletons while sources are still resolving, then the cards
 * that have arrived (partial results render as each source resolves). The empty state is an
 * instruction, never a dead end.
 */
export function ResultGrid({
  items,
  isSearching,
  hasQuery,
  statusFiltered,
}: {
  items: Person[];
  isSearching: boolean;
  hasQuery: boolean;
  /** True when a non-"all" status filter is hiding otherwise-present results. */
  statusFiltered: boolean;
}) {
  // Show skeletons while loading and nothing has arrived yet.
  if (isSearching && items.length === 0) {
    return (
      <div className={styles.grid} aria-busy="true">
        {Array.from({ length: 4 }).map((_, i) => (
          <SkeletonCard key={i} />
        ))}
      </div>
    );
  }

  if (items.length === 0) {
    if (!hasQuery) {
      return (
        <div className={styles.empty}>
          <p className={styles.emptyTitle}>Empieza tu búsqueda</p>
          <p className={styles.emptyHint}>
            Escribe el nombre de la persona que buscas. Consultamos las tres
            fuentes al mismo tiempo.
          </p>
        </div>
      );
    }
    return (
      <div className={styles.empty}>
        <p className={styles.emptyTitle}>Sin coincidencias</p>
        <p className={styles.emptyHint}>
          {statusFiltered
            ? "Prueba con menos letras o quita el filtro de estado."
            : "Prueba con menos letras o revisa la ortografía del nombre."}
        </p>
      </div>
    );
  }

  return (
    <>
      <div className={styles.grid}>
        {items.map((person, i) => (
          // Composite key: no-dedup means the same id could legitimately appear twice.
          <ResultCard key={`${person.id}::${i}`} person={person} />
        ))}
      </div>
      {isSearching && (
        <p className={styles.partial} role="status">
          Algunas fuentes siguen respondiendo…
        </p>
      )}
    </>
  );
}
