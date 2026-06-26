/**
 * Source B (vtb) — turbo-stream decode → raw Zod validate → `mapToPerson`, plus the
 * end-to-end `fetchPage` (mocked upstream) and the PII-stripping guarantee. The fixture is a
 * SYNTHETIC turbo-stream array with FAKE names and planted cédula/reporter markers that this
 * suite proves never reach the canonical `Person`.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";
import {
  RawBDataSchema,
  mapToPerson,
  fetchPage,
} from "@/adapters/vtb";
import { PersonSchema } from "@/schemas/person";
import { decodeTurboStream } from "@/lib/turbostream";
import { resetBreakers } from "@/lib/breaker";
import { resetMemoryCache } from "@/lib/cache";
import { GET as getDesaparecidos } from "@/app/api/sources/desaparecidos/route";
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

const SENSITIVE_MARKERS = [
  "FAKE-CEDULA-DO-NOT-USE",
  "FAKE-REPORTER-NAME",
  "reporter@example.test",
  "000-000-0000",
  "FAKE-HOSPITAL",
];

function decodePersons() {
  const root = decodeTurboStream(fixtureB) as Record<string, { data: unknown }>;
  return RawBDataSchema.parse(root["routes/_index"].data).persons.map(
    mapToPerson,
  );
}

describe("Source B — turbo-stream decode + mapToPerson", () => {
  const people = decodePersons();

  it("decodes the loader data and all three synthetic persons", () => {
    expect(people).toHaveLength(3);
  });

  it("namespaces ids with the `b:` prefix", () => {
    expect(people[0].id).toBe("b:b0000000-0000-4000-8000-000000000001");
    expect(people.every((p) => p.id.startsWith("b:"))).toBe(true);
    expect(people.every((p) => p.source === "b")).toBe(true);
  });

  it("joins firstName + lastName and repairs mojibake", () => {
    expect(people[0].name).toBe("José Peña"); // "JosÃ©" + "PeÃ±a"
    expect(people[1].name).toBe("Marta Díaz"); // "DÃ­az"
    expect(people[0].location).toBe("Maracaíbo"); // "MaracaÃ­bo"
  });

  it("resolves relative photoUrl against venezuelatebusca.com; absolute passthrough; null→null", () => {
    expect(people[0].photoUrl).toBe(
      "https://venezuelatebusca.com/media/photos/synthetic-001.jpg",
    );
    expect(people[1].photoUrl).toBe("https://example.test/images/abs.jpg");
    expect(people[2].photoUrl).toBeNull();
  });

  it("maps status: explicit 'found'/foundNote → found, else missing", () => {
    expect(people[0].status).toBe("missing");
    expect(people[1].status).toBe("found"); // status "found" + foundNote present
    expect(people[2].status).toBe("missing");
  });

  it("null age stays null; contact is empty (reporter contact dropped)", () => {
    expect(people[1].age).toBeNull();
    expect(people[0].age).toBe(30);
    expect(people.every((p) => p.contact === "")).toBe(true);
  });

  it("links sourceUrl back to Source B's public site", () => {
    expect(people.every((p) => p.sourceUrl === "https://venezuelatebusca.com")).toBe(
      true,
    );
  });

  it("every mapped Person matches the outbound PersonSchema", () => {
    for (const p of people) expect(() => PersonSchema.parse(p)).not.toThrow();
  });

  it("carries ONLY canonical Person keys", () => {
    for (const p of people) {
      expect(Object.keys(p).sort()).toEqual(PERSON_KEYS);
    }
  });

  it("STRIPS cédula + reporter: no planted sensitive marker leaks into the output", () => {
    const serialized = JSON.stringify(people);
    for (const marker of SENSITIVE_MARKERS) {
      expect(serialized).not.toContain(marker);
    }
  });
});

describe("Source B — fetchPage (mocked upstream)", () => {
  beforeEach(() => {
    resetBreakers();
    resetMemoryCache();
    vi.restoreAllMocks();
  });
  afterEach(() => vi.restoreAllMocks());

  it("returns mapped Person[] with pagination and ZERO sensitive data", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify(fixtureB), {
        status: 200,
        headers: { "content-type": "text/x-script" },
      }),
    );

    const result = await fetchPage({ q: "jose", page: 1, pageSize: 48 });
    expect(result.items).toHaveLength(3);
    expect(result.page).toBe(1);
    expect(result.totalPages).toBe(1); // totalCount 3 / pageSize 48
    expect(result.items[0].source).toBe("b");

    const serialized = JSON.stringify(result);
    for (const marker of SENSITIVE_MARKERS) {
      expect(serialized).not.toContain(marker);
    }
    expect(serialized).not.toMatch(/idNumber|reporter|email|phone/i);
  });

  it("caps the served page to pageSize even if B returns more", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify(fixtureB), { status: 200 }),
    );
    const result = await fetchPage({ q: "jose", page: 1, pageSize: 2 });
    expect(result.items).toHaveLength(2); // 3 decoded, capped to 2
  });

  it("throws on a non-2xx upstream so the route can 502", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("nope", { status: 404 }),
    );
    await expect(fetchPage({ q: "jose", page: 1, pageSize: 48 })).rejects.toThrow();
  });
});

describe("Source A — route returns the not_connected stub", () => {
  beforeEach(() => {
    resetMemoryCache();
    vi.restoreAllMocks();
  });
  afterEach(() => vi.restoreAllMocks());

  it("GET /api/sources/desaparecidos → 200 not_connected, no live fetch", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");
    const res = await getDesaparecidos(
      new NextRequest(
        "http://localhost:3000/api/sources/desaparecidos?q=jose&page=1&pageSize=24",
      ),
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      status: "not_connected",
      source: "a",
      reason: "Fuente no conectada",
    });
    expect(fetchMock).not.toHaveBeenCalled(); // never hits A's reCAPTCHA-gated endpoint
  });
});
