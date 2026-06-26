/**
 * Data-minimization re-audit (PRD §5.7) — the single most important protection.
 *
 * Asserts that the canonical, client-facing surface carries NONE of cédula / idNumber /
 * reporter email/phone, across ALL live sources (B, C). Even a fully successful scrape of
 * `/api/sources/*` must yield only what was already public. Source A is currently a
 * "not connected" stub (its `/api/personas` requires a reCAPTCHA token we don't bypass), so
 * it serves no person fields at all.
 */

import { describe, it, expect } from "vitest";
import { PersonSchema } from "@/schemas/person";
import { mapToPerson as mapA } from "@/adapters/desaparecidos";
import { mapToPerson as mapC } from "@/adapters/terremoto";
import { mapToPerson as mapB, RawBDataSchema } from "@/adapters/vtb";
import { getNotConnected } from "@/adapters/desaparecidos";
import { RawAResponseSchema } from "@/adapters/desaparecidos";
import { RawCResponseSchema } from "@/adapters/terremoto";
import { decodeTurboStream } from "@/lib/turbostream";
import fixtureA from "@/test/fixtures/desaparecidos.sample.json";
import fixtureC from "@/test/fixtures/terremoto.sample.json";
import fixtureB from "@/test/fixtures/vtb.sample.json";

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

// Planted sensitive markers in the synthetic B fixture — none may survive into the output.
const B_SENSITIVE_MARKERS = [
  "FAKE-CEDULA-DO-NOT-USE",
  "FAKE-CEDULA-DO-NOT-USE-2",
  "FAKE-REPORTER-NAME",
  "FAKE-REPORTER-NAME-2",
  "FAKE-REPORTER-NAME-3",
  "reporter@example.test",
  "reporter2@example.test",
  "reporter3@example.test",
  "000-000-0000",
  "111-111-1111",
  "222-222-2222",
  "FAKE-HOSPITAL",
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

function decodeBPersons() {
  const root = decodeTurboStream(fixtureB) as Record<
    string,
    { data: unknown }
  >;
  return RawBDataSchema.parse(root["routes/_index"].data).persons.map(mapB);
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

  it("Source A adapter (kept for reconnection): every mapped Person is minimal", () => {
    // A's route is a stub today, but the adapter is retained + audited for when A offers a
    // sanctioned feed. Its mapping must still strip everything sensitive.
    const people = RawAResponseSchema.parse(fixtureA).items.map(mapA);
    expect(people.length).toBeGreaterThan(0);
    for (const p of people) assertMinimal(p as unknown as Record<string, unknown>);
  });

  it("Source B: every mapped Person is minimal (cédula + reporter stripped)", () => {
    const people = decodeBPersons();
    expect(people.length).toBeGreaterThan(0);
    for (const p of people) assertMinimal(p as unknown as Record<string, unknown>);
  });

  it("Source B: NO planted cédula/reporter marker survives into the served output", () => {
    const serialized = JSON.stringify(decodeBPersons());
    for (const marker of B_SENSITIVE_MARKERS) {
      expect(serialized).not.toContain(marker);
    }
  });

  it("Source C: every mapped Person is minimal", () => {
    const people = RawCResponseSchema.parse(fixtureC).people.map(mapC);
    expect(people.length).toBeGreaterThan(0);
    for (const p of people) assertMinimal(p as unknown as Record<string, unknown>);
  });

  it("Source A stub leaks nothing (not connected, no fields)", () => {
    const a = getNotConnected();
    expect(a).toEqual({
      status: "not_connected",
      source: "a",
      reason: "Fuente no conectada",
    });
  });
});
