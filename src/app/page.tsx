import { SearchExperience } from "@/components/search/SearchExperience";
import styles from "./page.module.css";

/**
 * Search page. The interactive experience (debounced search, status filter, per-source lamps
 * incl. Source B "no conectado", and the merged result grid) lives in `SearchExperience`,
 * which fans out to the three `/api/sources/*` proxies via `useQueries` (PRD §4).
 */
export default function Home() {
  return (
    <main className={styles.main}>
      <SearchExperience />
    </main>
  );
}
