/**
 * Source A — desaparecidos (`/api/personas`). Clean JSON, Spanish fields, epoch-ms
 * timestamps. Status: `estado === "localizado"` -> "found", else "missing".
 *
 * NOTE (2026-06): A's `/api/personas` now requires a Google reCAPTCHA token — it answers
 * HTTP 403 `{"error":"ForbiddenError","message":"Verificación reCAPTCHA requerida"}` to
 * unauthenticated reads. We do NOT bypass human-verification gates, so the ROUTE returns a
 * "not connected" stub (see `getNotConnected` and `app/api/sources/desaparecidos/route.ts`)
 * and does NOT call `fetchPage`. The `fetchPage` / `mapToPerson` / raw schema below are kept
 * intact and tested, ready to re-connect the moment A offers a sanctioned (token-free) feed.
 *
 * Pipeline (when reconnected): `fetchUpstream` -> byte-level UTF-8 decode -> raw Zod validate
 * -> `mapToPerson` (the sole place sensitive fields drop) -> `{ items, page, totalPages }`.
 * The upstream's `localizado*` / reporter fields are sensitive and never read into `Person`.
 */

import { z } from "zod";
import { env } from "@/lib/env";
import { fetchUpstream } from "@/lib/http";
import { repairMojibake } from "@/lib/encoding";
import type { NotConnectedResponse, Person, ProxyResponse } from "@/lib/types";

/**
 * The structured "not connected" marker the route returns instead of hitting A's
 * reCAPTCHA-gated endpoint (no live fetch — also the polite choice, so we never hammer a
 * gate we won't pass). The UI branches on this to render A's lamp as "no conectado".
 */
export function getNotConnected(): NotConnectedResponse {
  return {
    status: "not_connected",
    source: "a",
    reason: "Fuente no conectada",
  };
}

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
