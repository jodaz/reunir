"use client";

import type { Person } from "@/lib/types";
import { SOURCES, type SourceKey } from "./sources";
import { Avatar } from "./Avatar";
import styles from "./card.module.css";

const SOURCE_LABEL: Record<SourceKey, string> = Object.fromEntries(
  SOURCES.map((s) => [s.key, s.label]),
) as Record<SourceKey, string>;

/** Spanish status copy (Venezuelan tuteo / neutral). */
const STATUS_TEXT = {
  missing: "Sin contacto",
  found: "Localizado",
} as const;

/**
 * A single result. Renders ONLY canonical `Person` fields (no cédula / reporter contact, by
 * design — PRD §3.1). Links back to the original record on its source rather than
 * re-publishing it. One `Person` = one card; duplicates across sources are separate cards.
 */
export function ResultCard({ person }: { person: Person }) {
  const ageText =
    person.age !== null ? `${person.age} años` : null;

  return (
    <article className={styles.card}>
      <div className={styles.cardHeader}>
        <Avatar name={person.name} photoUrl={person.photoUrl} />
        <div className={styles.cardHeading}>
          <h3 className={styles.name}>{person.name}</h3>
          <span
            className={`${styles.pill} ${
              person.status === "found" ? styles.pillFound : styles.pillMissing
            }`}
          >
            {STATUS_TEXT[person.status]}
          </span>
        </div>
      </div>

      <dl className={styles.meta}>
        {ageText && (
          <div className={styles.metaRow}>
            <dt className={styles.metaLabel}>Edad</dt>
            <dd className={styles.metaValue}>{ageText}</dd>
          </div>
        )}
        {person.location && (
          <div className={styles.metaRow}>
            <dt className={styles.metaLabel}>Visto por última vez</dt>
            <dd className={styles.metaValue}>{person.location}</dd>
          </div>
        )}
      </dl>

      {person.description && (
        <p className={styles.description}>{person.description}</p>
      )}

      <div className={styles.cardFooter}>
        <span className={styles.badge}>{SOURCE_LABEL[person.source]}</span>
        {person.sourceUrl && (
          <a
            className={styles.sourceLink}
            href={person.sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
          >
            Ver en la fuente
            <span className={styles.srOnly}> — {person.name}</span>
            <span aria-hidden="true"> ↗</span>
          </a>
        )}
      </div>
    </article>
  );
}
