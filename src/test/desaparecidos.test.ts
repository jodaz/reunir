import { describe, it, expect } from "vitest";
import {
  RawAResponseSchema,
  mapToPerson,
  type RawAItem,
} from "@/adapters/desaparecidos";
import { PersonSchema } from "@/schemas/person";
import fixture from "@/test/fixtures/desaparecidos.sample.json";

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

// Fake sensitive markers planted in the fixture; none may survive into a mapped Person.
const SENSITIVE_MARKERS = [
  "FAKE-CEDULA-DO-NOT-USE",
  "reporter@example.test",
  "FAKE-REPORTER-NAME",
  "FAKE-RELATION",
  "FAKE-NOTE",
  "000-000-0000",
  "localizado",
  "idNumber",
  "reporterEmail",
  "reporterPhone",
];

describe("Source A — raw schema + mapToPerson", () => {
  const parsed = RawAResponseSchema.parse(fixture);
  const people = parsed.items.map(mapToPerson);

  it("validates the raw upstream shape (permissive on extra keys)", () => {
    expect(parsed.items).toHaveLength(3);
  });

  it("maps Spanish fields to the canonical Person and namespaces the id", () => {
    const p = people[0];
    expect(p.id).toBe("a:pAAA0000missing");
    expect(p.source).toBe("a");
    expect(p.name).toBe("Ana Test Missing");
    expect(p.age).toBeNull();
    expect(p.location).toBe("Caraballeda");
    expect(p.sourceUrl).toContain("/personas/pAAA0000missing");
  });

  it("status: estado 'localizado' -> found, else missing", () => {
    expect(people[0].status).toBe("missing"); // sin-contacto
    expect(people[1].status).toBe("found"); // localizado
    expect(people[2].status).toBe("missing"); // sin-contacto
  });

  it("null age and empty foto map to null", () => {
    expect(people[0].age).toBeNull();
    expect(people[0].photoUrl).toBeNull(); // foto: ""
    expect(people[2].photoUrl).toBeNull(); // foto: null
    expect(people[1].photoUrl).toBe("https://example.test/images/found.jpg");
  });

  it("repairs mojibake in mapped text fields", () => {
    const p = people[2];
    expect(p.name).toBe("José Díaz Peña");
    expect(p.location).toBe("Maracaíbo");
    expect(p.contact).toBe("María 0000000000");
  });

  it("every mapped Person matches the outbound PersonSchema", () => {
    for (const p of people) expect(() => PersonSchema.parse(p)).not.toThrow();
  });

  it("carries ONLY canonical Person keys (no sensitive fields)", () => {
    for (const p of people) {
      expect(Object.keys(p).sort()).toEqual(PERSON_KEYS);
    }
  });

  it("no sensitive marker from the raw item leaks into the mapped output", () => {
    const serialized = JSON.stringify(people);
    for (const marker of SENSITIVE_MARKERS) {
      expect(serialized).not.toContain(marker);
    }
  });

  it("never reads reporter/localizado fields even when present upstream", () => {
    const raw: RawAItem = RawAResponseSchema.parse(fixture).items[1];
    const mapped = mapToPerson(raw);
    expect(JSON.stringify(mapped)).not.toContain("000-000-0000");
    expect(mapped.contact).toBe("Contacto Publico 0000000000"); // public contact only
  });
});
