/**
 * Data-minimization re-audit (PRD §5.7) — the single most important protection.
 *
 * Asserts that the canonical, client-facing surface carries NONE of cédula / idNumber /
 * reporter email/phone, across ALL connected sources (A, C) and the Source B stub. Even a
 * fully successful scrape of `/api/sources/*` must yield only what was already public.
 */

import { describe, it, expect } from "vitest";
import { PersonSchema } from "@/schemas/person";
import { mapToPerson as mapA } from "@/adapters/desaparecidos";
import { mapToPerson as mapC } from "@/adapters/terremoto";
import { RawAResponseSchema } from "@/adapters/desaparecidos";
import { RawCResponseSchema } from "@/adapters/terremoto";
import { getNotConnected } from "@/adapters/vtb";
import fixtureA from "@/test/fixtures/desaparecidos.sample.json";
import fixtureC from "@/test/fixtures/terremoto.sample.json";

const PERSON_KEYS = [
  "id",
  "source",
  "name",
  "age",
  "location",
  "description",
  "photoUrl",
  "status",
  "contact",
  "sourceUrl",
].sort();

// No served field key may carry a sensitive identifier under any name/casing.
const FORBIDDEN_KEY_PATTERNS = [
  /c[ée]dula/i,
  /idnumber/i,
  /\bdni\b/i,
  /reporter/i,
  /email/i,
  /phone/i,
  /tel[eé]fono/i,
];

function assertMinimal(person: Record<string, unknown>) {
  // Exactly the canonical keys — nothing more.
  expect(Object.keys(person).sort()).toEqual(PERSON_KEYS);
  // The PersonSchema is the outbound contract; it must accept the mapped object.
  expect(() => PersonSchema.parse(person)).not.toThrow();
  for (const key of Object.keys(person)) {
    for (const pattern of FORBIDDEN_KEY_PATTERNS) {
      expect(key).not.toMatch(pattern);
    }
  }
}

describe("served Person carries no sensitive fields (PRD §5.7)", () => {
  it("PersonSchema itself declares no sensitive keys", () => {
    expect(Object.keys(PersonSchema.shape).sort()).toEqual(PERSON_KEYS);
    for (const key of Object.keys(PersonSchema.shape)) {
      for (const pattern of FORBIDDEN_KEY_PATTERNS) {
        expect(key).not.toMatch(pattern);
      }
    }
  });

  it("Source A: every mapped Person is minimal", () => {
    const people = RawAResponseSchema.parse(fixtureA).items.map(mapA);
    expect(people.length).toBeGreaterThan(0);
    for (const p of people) assertMinimal(p as unknown as Record<string, unknown>);
  });

  it("Source C: every mapped Person is minimal", () => {
    const people = RawCResponseSchema.parse(fixtureC).people.map(mapC);
    expect(people.length).toBeGreaterThan(0);
    for (const p of people) assertMinimal(p as unknown as Record<string, unknown>);
  });

  it("Source B stub leaks nothing (not connected, no fields)", () => {
    const b = getNotConnected();
    expect(b).toEqual({
      status: "not_connected",
      source: "b",
      reason: "Fuente no conectada",
    });
  });
});
