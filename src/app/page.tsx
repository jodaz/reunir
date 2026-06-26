import styles from "./page.module.css";

/**
 * Search page shell. The full UI — debounced search box, status filter, per-source
 * lamps (incl. Source B "no conectado"), and the merged result grid — lands in Cycle 3.
 */
export default function Home() {
  return (
    <main className={styles.main}>
      <h1 className={styles.title}>Reunir</h1>
      <p className={styles.tagline}>
        Búsqueda unificada de personas — terremoto Venezuela 2026.
      </p>
      <p className={styles.note}>
        Scaffold (M1). La búsqueda en vivo llega en el Ciclo 3.
      </p>
    </main>
  );
}
