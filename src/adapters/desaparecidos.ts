/**
 * Source A — desaparecidos (`/api/personas`). Clean JSON, Spanish fields, epoch-ms
 * timestamps. Status: `estado === "localizado"` → "found", else "missing".
 *
 * M1 ships the raw-upstream Zod schema and a `mapToPerson` that drops sensitive fields
 * (the `localizado*` reporter details are simply never read into `Person`). Live paging
 * (`fetchPage`) is wired in Cycle 1 — the route returns a typed placeholder until then.
 */

import { z } from "zod";
import type { Person } from "@/lib/types";

// Raw upstream item. Explicit on consumed fields; not `.strict()` — upstreams add keys.
export const RawAItemSchema = z.object({
  id: z.string(),
  nombre: z.string(),
  edad: z.number().nullable(),
  ubicacion: z.string().nullable(),
  descripcion: z.string().nullable(),
  contacto: z.string().nullable(),
  foto: z.string().nullable(),
  estado: z.string(),
  // localizado* fields exist upstream but are sensitive reporter details — never mapped.
});

export const RawAResponseSchema = z.object({
  items: z.array(RawAItemSchema),
  total: z.number(),
  page: z.number(),
  pageSize: z.number(),
  totalPages: z.number(),
});

export type RawAItem = z.infer<typeof RawAItemSchema>;
export type RawAResponse = z.infer<typeof RawAResponseSchema>;

/** Map one raw Source A item to the canonical `Person`. Sole place sensitive fields drop. */
export function mapToPerson(raw: RawAItem): Person {
  return {
    id: `a:${raw.id}`,
    source: "a",
    name: raw.nombre,
    age: raw.edad,
    location: raw.ubicacion ?? "",
    description: raw.descripcion ?? "",
    photoUrl: raw.foto ? raw.foto : null,
    status: raw.estado === "localizado" ? "found" : "missing",
    contact: raw.contacto ?? "",
    sourceUrl: `https://desaparecidos-terremoto-api.theempire.tech/personas/${raw.id}`,
  };
}
