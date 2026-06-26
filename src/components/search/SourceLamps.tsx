"use client";

import type { SourceState } from "./useSourceQueries";
import styles from "./lamps.module.css";

/** Lamp copy per phase (Venezuelan tuteo / neutral Spanish). */
function lampText(state: SourceState): string {
  switch (state.phase) {
    case "idle":
      return "En espera";
    case "searching":
      return "Buscando…";
    case "results":
      return state.count === 1 ? "1 resultado" : `${state.count} resultados`;
    case "not_connected":
      return state.reason || "No conectado";
    case "error":
      return "Sin conexión";
  }
}

/**
 * Per-source status strip ("lamps") + a summary line. Each lamp reflects one source's own
 * state independently. The strip is a polite live region so screen-reader users hear results
 * arriving as each source resolves.
 */
export function SourceLamps({
  states,
  isSearching,
  totalResults,
  hasQuery,
}: {
  states: SourceState[];
  isSearching: boolean;
  totalResults: number;
  hasQuery: boolean;
}) {
  const summary = !hasQuery
    ? "Escribe un nombre para buscar en las tres fuentes a la vez."
    : isSearching
      ? "Buscando en las fuentes…"
      : totalResults === 0
        ? "Sin resultados por ahora."
        : totalResults === 1
          ? "1 resultado en total."
          : `${totalResults} resultados en total.`;

  return (
    <section className={styles.strip} aria-label="Estado de las fuentes">
      <ul className={styles.lamps}>
        {states.map((state) => (
          <li
            key={state.key}
            className={`${styles.lamp} ${styles[state.phase]}`}
          >
            <span className={styles.dot} aria-hidden="true" />
            <span className={styles.lampLabel}>{state.label}</span>
            <span className={styles.lampStatus}>{lampText(state)}</span>
          </li>
        ))}
      </ul>
      <p className={styles.summary} role="status" aria-live="polite">
        {summary}
      </p>
    </section>
  );
}
