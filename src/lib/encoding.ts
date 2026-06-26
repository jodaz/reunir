/**
 * Encoding repair (PRD encoding section / ADR 0002 §3).
 *
 * Mojibake like `JosÃ©` / `DÃ­az` is double-decoded UTF-8. The correct fix is at the
 * BYTE boundary: decode the upstream bytes with `TextDecoder('utf-8')` rather than
 * relying on a magic-fixup library. A string-level repair pass is only a fallback for
 * already-corrupted *stored* strings where the original bytes are no longer available.
 *
 * M1 ships typed placeholders; full implementation lands in Cycle 1 alongside the
 * adapter mapping + fixture tests.
 */

/** Decode raw upstream bytes as UTF-8 at the byte boundary (the correct primary fix). */
export function decodeUtf8(bytes: ArrayBuffer | Uint8Array): string {
  return new TextDecoder("utf-8").decode(bytes);
}

/**
 * Fallback only: repair an already-corrupted string whose original bytes are lost.
 * Placeholder — Cycle 1 implements the latin1↔utf-8 round-trip repair and tests it
 * against the mojibake fixtures. For now it is a no-op so call sites can be wired.
 */
export function repairMojibake(value: string): string {
  // TODO(Cycle 1): re-encode as latin1 then decode as utf-8 to undo double-decoding,
  // guarded so it only runs when mojibake markers are present.
  return value;
}
