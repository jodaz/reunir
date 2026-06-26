/**
 * Source C — terremotovenezuela (`/api/missing`). Clean JSON, English fields, epoch-ms
 * `createdAt`. Status: `resolvedAt != null` -> "found", else "missing".
 *
 * Pipeline: `fetchUpstream` -> byte-level UTF-8 decode -> raw Zod validate -> `mapToPerson`
 * -> `{ items, page, totalPages }`. `resolutionNote`/`resolutionPhotoUrl` are not mapped.
 */

import { z } from "zod";
import { env } from "@/lib/env";
import { fetchUpstream } from "@/lib/http";
import { repairMojibake } from "@/lib/encoding";
import type { Person, ProxyResponse } from "@/lib/types";

// Raw upstream item. Explicit on consumed fields; not `.strict()` — upstreams add keys
// (e.g. `status`, `resolutionNote`, `totalCapped`, `persistent`).
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

/**
 * Source C's `photoUrl` may be absolute (S3 / venezuelatebusca media) or a relative path
 * (`/api/missing/<id>/photo`). Resolve relative paths against the source base so clients
 * get a directly-loadable URL; empty/null becomes `null`.
 */
function resolvePhotoUrl(photoUrl: string | null): string | null {
  if (!photoUrl) return null;
  if (/^https?:\/\//i.test(photoUrl)) return photoUrl;
  try {
    return new URL(photoUrl, env.SOURCE_C_BASE_URL).toString();
  } catch {
    return null;
  }
}

/** Map one raw Source C item to the canonical `Person`. */
export function mapToPerson(raw: RawCItem): Person {
  return {
    id: `c:${raw.id}`,
    source: "c",
    name: repairMojibake(raw.name),
    age: raw.age,
    location: repairMojibake(raw.lastSeen ?? ""),
    description: repairMojibake(raw.description ?? ""),
    photoUrl: resolvePhotoUrl(raw.photoUrl),
    status: raw.resolvedAt != null ? "found" : "missing",
    contact: repairMojibake(raw.contact ?? ""),
    sourceUrl: `${env.SOURCE_C_BASE_URL}/missing/${raw.id}`,
  };
}

export interface FetchPageArgs {
  q: string;
  page: number;
  pageSize: number;
}

/**
 * Fetch one page from Source C and return mapped `Person[]`. Throws on upstream/transport
 * or schema-validation failure so the route can surface it (validation failures flag an
 * upstream redeploy). `pageSize` is already capped upstream by the gateway's `QuerySchema`.
 */
export async function fetchPage({
  q,
  page,
  pageSize,
}: FetchPageArgs): Promise<ProxyResponse> {
  const url = new URL("/api/missing", env.SOURCE_C_BASE_URL);
  url.searchParams.set("q", q);
  url.searchParams.set("page", String(page));
  url.searchParams.set("pageSize", String(pageSize));

  const res = await fetchUpstream(url.toString());
  if (!res.ok) {
    throw new Error(`Source C upstream returned HTTP ${res.status}`);
  }

  const raw = RawCResponseSchema.parse(JSON.parse(res.text));
  return {
    items: raw.people.map(mapToPerson),
    page: raw.page,
    totalPages: raw.totalPages,
  };
}
