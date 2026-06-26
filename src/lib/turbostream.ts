/**
 * Minimal Remix single-fetch (`turbo-stream`) decoder.
 *
 * Source B (`venezuela-te-busca-app.hellogafaro.workers.dev/_root.data`) answers data
 * requests as a Remix `turbo-stream` payload: ONE flat JSON array whose entries reference
 * each other by integer index, rather than a nested object. Hydration starts at index 0:
 *
 *   - a primitive entry (string/number/boolean) is itself the value;
 *   - an array entry holds references — each element is an index to hydrate;
 *   - an object entry is `{ "_<keyIndex>": <valueIndex>, ... }`: every key is `"_"` + the
 *     index of the KEY STRING, and its value is the index of the VALUE to hydrate.
 *
 * Negative references are sentinels (turbo-stream constants): -5 null, -7 undefined, -1 hole.
 * Shared / back-referenced indices are resolved once and memoized, so a value reused across
 * records (or a cyclic reference) hydrates to a single shared object instead of looping.
 *
 * This is a READ-ONLY decoder for the subset of the format B emits. It never solves a
 * Turnstile or replays a token — B's `_root.data` read path is open; only report SUBMISSION
 * is gated (which we never touch).
 */

const SENTINEL_NULL = -5;
const SENTINEL_UNDEFINED = -7;
const SENTINEL_HOLE = -1;

/** Hydrate a turbo-stream flat array into its nested JS value (root is index 0). */
export function decodeTurboStream(flat: unknown): unknown {
  if (!Array.isArray(flat)) {
    throw new Error("turbo-stream payload is not an array");
  }
  const rows = flat as unknown[];
  const cache = new Map<number, unknown>();

  function hydrate(index: number): unknown {
    if (index === SENTINEL_NULL) return null;
    if (index === SENTINEL_UNDEFINED || index === SENTINEL_HOLE) return undefined;
    // Any other negative sentinel (NaN/±Infinity/-0) is irrelevant to B's record fields;
    // collapse to undefined so the Zod boundary, not the decoder, decides field validity.
    if (index < 0) return undefined;
    if (index >= rows.length) {
      throw new Error(`turbo-stream reference out of range: ${index}`);
    }
    if (cache.has(index)) return cache.get(index);

    const raw = rows[index];

    if (raw === null || typeof raw !== "object") {
      cache.set(index, raw);
      return raw;
    }

    if (Array.isArray(raw)) {
      const arr: unknown[] = [];
      cache.set(index, arr); // memoize BEFORE recursing so cycles terminate
      for (const ref of raw) arr.push(hydrate(toIndex(ref)));
      return arr;
    }

    const obj: Record<string, unknown> = {};
    cache.set(index, obj); // memoize BEFORE recursing so cycles terminate
    for (const [encKey, valueRef] of Object.entries(raw)) {
      const keyName = resolveKey(rows, encKey);
      obj[keyName] = hydrate(toIndex(valueRef));
    }
    return obj;
  }

  return hydrate(0);
}

/** A reference must be an integer index (or sentinel). Reject anything else loudly. */
function toIndex(ref: unknown): number {
  if (typeof ref !== "number" || !Number.isInteger(ref)) {
    throw new Error("turbo-stream reference is not an integer index");
  }
  return ref;
}

/** Object keys are `"_<keyStringIndex>"`; resolve the index to the actual key string. */
function resolveKey(rows: unknown[], encKey: string): string {
  if (encKey[0] !== "_") {
    throw new Error(`turbo-stream object key is not index-encoded: ${encKey}`);
  }
  const keyIndex = Number(encKey.slice(1));
  if (!Number.isInteger(keyIndex) || keyIndex < 0 || keyIndex >= rows.length) {
    throw new Error(`turbo-stream key index out of range: ${encKey}`);
  }
  const key = rows[keyIndex];
  if (typeof key !== "string") {
    throw new Error("turbo-stream key index does not point to a string");
  }
  return key;
}
