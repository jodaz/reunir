import { SearchExperience } from "@/components/search/SearchExperience";
import { TurnstileGate } from "@/components/security/TurnstileGate";
import { env } from "@/lib/env";
import styles from "./page.module.css";

/**
 * Search page. The interactive experience (debounced search, status filter, per-source lamps
 * incl. Source B "no conectado", and the merged result grid) lives in `SearchExperience`,
 * which fans out to the three `/api/sources/*` proxies via `useQueries` (PRD §4).
 *
 * `TurnstileGate` (PRD §5.1) sits above it: with a site key configured it obtains the session
 * cookie the API requires; with none (dev) it renders nothing and searches proceed ungated.
 */
export default function Home() {
  return (
    <main className={styles.main}>
      <TurnstileGate
        siteKey={env.TURNSTILE_SITE_KEY}
        action={env.TURNSTILE_ACTION || undefined}
      />
      <SearchExperience />
    </main>
  );
}
