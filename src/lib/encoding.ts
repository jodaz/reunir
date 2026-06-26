/**
 * Encoding repair (PRD encoding section / ADR 0002 §3).
 *
 * Mojibake like `JosÃ©` / `DÃ­az` is double-decoded UTF-8. The correct fix is at the
 * BYTE boundary: decode the upstream bytes with `TextDecoder('utf-8')` rather than
 * relying on a magic-fixup library. A string-level repair pass is only a fallback for
 * already-corrupted *stored* strings where the original bytes are no longer available.
 */

/** Decode raw upstream bytes as UTF-8 at the byte boundary (the correct primary fix). */
export function decodeUtf8(bytes: ArrayBuffer | Uint8Array): string {
  return new TextDecoder("utf-8").decode(bytes);
}

/**
 * Markers of double-decoded UTF-8 (mojibake): a UTF-8 lead byte (`Â`-`ß` for
 * 2-byte sequences, e.g. `Ã`/`Â`) followed by a continuation byte (``-`¿`).
 * E.g. `é` (C3 A9) misread as latin1 becomes `Ã©`. The guard keeps the repair a strict
 * no-op for already-correct text so it is safe to apply defensively to every field.
 */
const MOJIBAKE_RE = /[Â-ß][-¿]/;

/**
 * Fallback only: repair an already-corrupted string whose original bytes are lost
 * (e.g. mojibake stored upstream). The correct primary fix is `decodeUtf8()` at the byte
 * boundary; this undoes a latin1<->utf-8 double-decode by re-encoding each char as a byte
 * and decoding the byte run as UTF-8. Runs only when mojibake markers are present and the
 * round-trip is lossless; otherwise returns the input unchanged. No magic-fixup library.
 */
export function repairMojibake(value: string): string {
  if (!value || !MOJIBAKE_RE.test(value)) return value;

  // Latin1 round-trip is only valid if every code unit fits in a single byte; bail if a
  // genuine higher-plane character is present (masking would corrupt it).
  for (let i = 0; i < value.length; i++) {
    if (value.charCodeAt(i) > 0xff) return value;
  }

  try {
    const bytes = Uint8Array.from(value, (ch) => ch.charCodeAt(0));
    // `fatal` ensures we only accept the repair when the bytes are valid UTF-8.
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return value;
  }
}
