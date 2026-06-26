import { describe, it, expect } from "vitest";
import {
  RawCResponseSchema,
  mapToPerson,
} from "@/adapters/terremoto";
import { PersonSchema } from "@/schemas/person";
import fixture from "@/test/fixtures/terremoto.sample.json";

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

const SENSITIVE_MARKERS = [
  "FAKE-RESOLUTION-NOTE",
  "reporter@example.test",
  "000-000-0000",
  "reporterEmail",
  "reporterPhone",
  "resolutionNote",
  "resolutionPhotoUrl",
];

describe("Source C — raw schema + mapToPerson", () => {
  const parsed = RawCResponseSchema.parse(fixture);
  const people = parsed.people.map(mapToPerson);

  it("validates the raw upstream shape (permissive on extra keys)", () => {
    expect(parsed.people).toHaveLength(3);
  });

  it("maps English fields to the canonical Person and namespaces the id", () => {
    const p = people[0];
    expect(p.id).toBe("c:11111111-1111-1111-1111-111111111111");
    expect(p.source).toBe("c");
    expect(p.name).toBe("Carla Test Missing");
    expect(p.location).toBe("El brillante maiquetia"); // lastSeen -> location
    expect(p.sourceUrl).toContain(
      "/missing/11111111-1111-1111-1111-111111111111",
    );
  });

  it("status: resolvedAt present -> found, else missing", () => {
    expect(people[0].status).toBe("missing"); // resolvedAt null
    expect(people[1].status).toBe("found"); // resolvedAt set
    expect(people[2].status).toBe("missing"); // resolvedAt null
  });

  it("null age and null photoUrl map to null", () => {
    expect(people[1].age).toBeNull();
    expect(people[0].photoUrl).toBeNull();
  });

  it("resolves relative photoUrl against the base; keeps absolute as-is", () => {
    expect(people[1].photoUrl).toBe(
      "https://terremotovenezuela.app/api/missing/22222222-2222-2222-2222-222222222222/photo",
    );
    expect(people[2].photoUrl).toBe("https://example.test/images/abs.jpg");
  });

  it("repairs mojibake in mapped text fields", () => {
    const p = people[2];
    expect(p.name).toBe("José Manuel Díaz");
    expect(p.location).toBe("Maracaíbo");
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
});
