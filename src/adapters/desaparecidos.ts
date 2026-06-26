/**
 * Source A — desaparecidos (`/api/personas`). Clean JSON, Spanish fields, epoch-ms
 * timestamps. Status: `estado === "localizado"` -> "found", else "missing".
 *
 * Pipeline: `fetchUpstream` -> byte-level UTF-8 decode -> raw Zod validate -> `mapToPerson`
 * (the sole place sensitive fields drop) -> `{ items, page, totalPages }`. The upstream's
 * `localizado*` / reporter fields are sensitive and are never read into `Person`.
 */

import { z } from "zod";
import { env } from "@/lib/env";
import { fetchUpstream } from "@/lib/http";
import { repairMojibake } from "@/lib/encoding";
import type { Person, ProxyResponse } from "@/lib/types";

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
  // localizado* / reportada* fields exist upstream but are sensitive reporter details —
  // deliberately NOT declared here and never read into `Person` (see `mapToPerson`).
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
    name: repairMojibake(raw.nombre),
    age: raw.edad,
    location: repairMojibake(raw.ubicacion ?? ""),
    description: repairMojibake(raw.descripcion ?? ""),
    photoUrl: raw.foto ? raw.foto : null,
    status: raw.estado === "localizado" ? "found" : "missing",
    contact: repairMojibake(raw.contacto ?? ""),
    sourceUrl: `${env.SOURCE_A_BASE_URL}/personas/${raw.id}`,
  };
}

export interface FetchPageArgs {
  q: string;
  page: number;
  pageSize: number;
}

/**
 * Fetch one page from Source A and return mapped `Person[]`. Throws on upstream/transport
 * or schema-validation failure so the route can surface it (validation failures flag an
 * upstream redeploy). `pageSize` is already capped upstream by the gateway's `QuerySchema`.
 */
export async function fetchPage({
  q,
  page,
  pageSize,
}: FetchPageArgs): Promise<ProxyResponse> {
  const url = new URL("/api/personas", env.SOURCE_A_BASE_URL);
  url.searchParams.set("q", q);
  url.searchParams.set("page", String(page));
  url.searchParams.set("pageSize", String(pageSize));

  const res = await fetchUpstream(url.toString());
  if (!res.ok) {
    throw new Error(`Source A upstream returned HTTP ${res.status}`);
  }

  const raw = RawAResponseSchema.parse(JSON.parse(res.text));
  return {
    items: raw.items.map(mapToPerson),
    page: raw.page,
    totalPages: raw.totalPages,
  };
}
