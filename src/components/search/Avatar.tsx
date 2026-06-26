"use client";

import { useState } from "react";
import styles from "./card.module.css";

/** Two-letter initials from a name, for the photo fallback. */
function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/**
 * Photo with an initials fallback. Falls back when `photoUrl` is null OR the image fails to
 * load (broken upstream link). Decorative: the name is already the card heading, so the
 * avatar is `aria-hidden` and `alt=""`.
 */
export function Avatar({
  name,
  photoUrl,
}: {
  name: string;
  photoUrl: string | null;
}) {
  const [failed, setFailed] = useState(false);
  const showImage = photoUrl && !failed;

  return (
    <div className={styles.avatar} aria-hidden="true">
      {showImage ? (
        // eslint-disable-next-line @next/next/no-img-element -- upstream photos are remote/unoptimized; no Image config on day one.
        <img
          className={styles.avatarImg}
          src={photoUrl}
          alt=""
          loading="lazy"
          onError={() => setFailed(true)}
        />
      ) : (
        <span className={styles.avatarInitials}>{initials(name)}</span>
      )}
    </div>
  );
}
