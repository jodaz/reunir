/**
 * Source C — terremotovenezuela (`/api/missing`). Clean JSON, English fields, epoch-ms
 * `createdAt`. Status: `resolvedAt != null` → "found", else "missing".
 *
 * M1 ships the raw-upstream Zod schema and a `mapToPerson`. Live paging (`fetchPage`) is
 * wired in Cycle 1 — the route returns a typed placeholder until then.
 */

import { z } from "zod";
import type { Person } from "@/lib/types";

// Raw upstream item. Explicit on consumed fields; not `.strict()` — upstreams add keys.
export const RawCItemSchema = z.object({
  id: z.string(),
  name: z.string(),
  age: z.number().nullable(),
  description: z.string().nullable(),
  lastSeen: z.string().nullable(),
  contact: z.string().nullable(),
  photoUrl: z.string().nullable(),
  resolvedAt: z.number().nullable(),
  createdAt: z.number().nullable(),
});

export const RawCResponseSchema = z.object({
  people: z.array(RawCItemSchema),
  total: z.number(),
  page: z.number(),
  pageSize: z.number(),
  totalPages: z.number(),
});

export type RawCItem = z.infer<typeof RawCItemSchema>;
export type RawCResponse = z.infer<typeof RawCResponseSchema>;

/** Map one raw Source C item to the canonical `Person`. */
export function mapToPerson(raw: RawCItem): Person {
  return {
    id: `c:${raw.id}`,
    source: "c",
    name: raw.name,
    age: raw.age,
    location: raw.lastSeen ?? "",
    description: raw.description ?? "",
    photoUrl: raw.photoUrl,
    status: raw.resolvedAt != null ? "found" : "missing",
    contact: raw.contact ?? "",
    sourceUrl: `https://terremotovenezuela.app/missing/${raw.id}`,
  };
}
