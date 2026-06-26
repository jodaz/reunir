/**
 * Turbo-stream decoder (Source B's Remix single-fetch wire format): a flat array whose
 * entries reference each other by integer index. Covers key-index resolution, array refs,
 * the null/undefined sentinels, SHARED / back-referenced indices (a value reused across the
 * tree hydrates once), and cyclic references (must terminate, not loop).
 */

import { describe, it, expect } from "vitest";
import { decodeTurboStream } from "@/lib/turbostream";

describe("decodeTurboStream", () => {
  it("resolves index-encoded object keys and array element refs", () => {
    // 0: { a: <2>, b: <4> }, 4: [ <2>, <2>, null ]  → "hello" is shared by key a AND the array.
    const flat = [
      { _1: 2, _3: 4 }, // 0
      "a", // 1 (key string)
      "hello", // 2 (value, shared)
      "b", // 3 (key string)
      [2, 2, -5], // 4 (array: two refs to index 2, then null sentinel)
    ];
    expect(decodeTurboStream(flat)).toEqual({
      a: "hello",
      b: ["hello", "hello", null],
    });
  });

  it("hydrates a shared/back-referenced object to a SINGLE instance", () => {
    // Both `x` and `y` reference the same object at index 1.
    const flat = [{ _2: 1, _3: 1 }, { _4: 5 }, "x", "y", "k", "v"];
    const out = decodeTurboStream(flat) as { x: unknown; y: unknown };
    expect(out.x).toEqual({ k: "v" });
    expect(out.x).toBe(out.y); // identity preserved → not duplicated
  });

  it("maps the undefined sentinel (-7) to undefined", () => {
    const flat = [{ _1: -7, _2: 3 }, "gone", "kept", "here"];
    const out = decodeTurboStream(flat) as Record<string, unknown>;
    expect(out.kept).toBe("here");
    expect("gone" in out).toBe(true);
    expect(out.gone).toBeUndefined();
  });

  it("terminates on a cyclic reference instead of looping forever", () => {
    // 0: { self: <0> } — references itself.
    const flat = [{ _1: 0 }, "self"];
    const out = decodeTurboStream(flat) as { self: unknown };
    expect(out.self).toBe(out);
  });

  it("throws on a non-array payload", () => {
    expect(() => decodeTurboStream({ not: "array" })).toThrow();
  });

  it("throws on an out-of-range reference", () => {
    expect(() => decodeTurboStream([{ _1: 99 }, "k"])).toThrow();
  });
});
