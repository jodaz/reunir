/**
 * Source B — venezuelatebusca (vtb).
 *
 * B's Remix data endpoint (`/_root.data`) is OPENLY readable: the Cloudflare Turnstile only
 * guards report SUBMISSION, never reads — so this adapter reads the public feed without ever
 * touching a challenge (no headless solving, no token replay; that hard rule still stands).
 *
 * The catch: B's raw payload LEAKS exactly what Reunir has committed never to centralize —
 * `idNumber` (cédula) and a `reporter` object {name, phone, email} (PRD §3.1 / §5.7). Those,
 * plus hospital/tips/internal fields, are STRIPPED at this boundary: they are never read into
 * `Person`, never logged, never serialized. Our view of B is strictly MORE private than B's
 * own app — only already-public fields (name/age/location/description/photo/status) survive.
 *
 * Pipeline: `fetchUpstream` the `_root.data` (pass q/page) -> byte-level UTF-8 decode ->
 * `decodeTurboStream` (resolve index references) -> locate the loader data -> Zod-validate the
 * decoded raw person shape -> `mapToPerson` -> `{ items, page, totalPages }`.
 */

import { z } from "zod";
import { env } from "@/lib/env";
import { fetchUpstream } from "@/lib/http";
import { repairMojibake } from "@/lib/encoding";
import { decodeTurboStream } from "@/lib/turbostream";
import type { Person, ProxyResponse } from "@/lib/types";

/**
 * Raw decoded B person. Explicit ONLY on the already-public fields we consume; not
 * `.strict()` so upstream additions don't break validation. `idNumber`, `reporter`,
 * `hospitalName`, `hospitalStatus`, `tips` exist in the decoded payload but are deliberately
 * NOT declared here and are never read into `Person` (see `mapToPerson`).
 */
export const RawBPersonSchema = z.object({
  id: z.string(),
  firstName: z.string().nullish(),
  lastName: z.string().nullish(),
  age: z.number().nullish(),
  lastSeen: z.string().nullish(),
  description: z.string().nullish(),
  status: z.string().nullish(),
  foundNote: z.string().nullish(),
  photoUrl: z.string().nullish(),
});

/** The Remix index-route loader payload (the object carrying `persons`). */
export const RawBDataSchema = z.object({
  persons: z.array(RawBPersonSchema),
  pagination: z
    .object({
      page: z.number().nullish(),
      hasMore: z.boolean().nullish(),
    })
    .nullish(),
  totalCount: z.number().nullish(),
});

export type RawBPerson = z.infer<typeof RawBPersonSchema>;
export type RawBData = z.infer<typeof RawBDataSchema>;

/**
 * B's `photoUrl` is usually a relative `/media/photos/...` path; resolve it against B's
 * public media host (`venezuelatebusca.com`) so clients get a directly-loadable URL. An
 * already-absolute URL passes through; empty/null becomes `null`.
 */
function resolvePhotoUrl(photoUrl: string | null | undefined): string | null {
  if (!photoUrl) return null;
  if (/^https?:\/\//i.test(photoUrl)) return photoUrl;
  try {
    return new URL(photoUrl, env.SOURCE_B_BASE_URL).toString();
  } catch {
    return null;
  }
}

/**
 * Status mapping for B. B carries a per-person `status` string plus `missing`/`found`
 * counts; a resolved record also gets a `foundNote`. We treat an explicit `status === "found"`
 * OR a non-empty `foundNote` as "found"; everything else (including B's default "missing") maps
 * to "missing". Conservative by design — a record is only "found" on a positive signal.
 */
function mapStatus(raw: RawBPerson): Person["status"] {
  if (raw.status?.trim().toLowerCase() === "found") return "found";
  if (raw.foundNote && raw.foundNote.trim().length > 0) return "found";
  return "missing";
}

/**
 * Map one decoded B person to the canonical `Person`. The SOLE place B's sensitive fields
 * drop: `idNumber` / `reporter` / hospital / tips are simply never referenced here, so they
 * cannot reach the serialized output. `contact` is "" — we drop reporter contact entirely, so
 * there is no public contact to surface (B's report form, not a phone number, is the channel).
 */
export function mapToPerson(raw: RawBPerson): Person {
  const name = repairMojibake(
    [raw.firstName ?? "", raw.lastName ?? ""].join(" ").trim(),
  );
  return {
    id: `b:${raw.id}`,
    source: "b",
    name,
    age: raw.age ?? null,
    location: repairMojibake(raw.lastSeen ?? ""),
    description: repairMojibake(raw.description ?? ""),
    photoUrl: resolvePhotoUrl(raw.photoUrl),
    status: mapStatus(raw),
    contact: "",
    // No confirmed per-record deep link on B's SPA; link to the public site root so the card
    // still provenance-links back to Source B. Revisit if B exposes a stable record URL.
    sourceUrl: env.SOURCE_B_BASE_URL,
  };
}

/**
 * Locate the loader-data object inside the hydrated turbo-stream tree. The Remix single-fetch
 * shape nests it at `root["routes/_index"].data`; we try that first, then fall back to a
 * bounded search for the object carrying a `persons` array, so a route-id change upstream
 * doesn't silently break the adapter.
 */
function extractLoaderData(root: unknown): unknown {
  const direct = (root as Record<string, Record<string, unknown>> | null)?.[
    "routes/_index"
  ]?.data;
  if (isLoaderData(direct)) return direct;
  return findLoaderData(root, new Set());
}

function isLoaderData(value: unknown): boolean {
  return (
    typeof value === "object" &&
    value !== null &&
    Array.isArray((value as Record<string, unknown>).persons)
  );
}

function findLoaderData(value: unknown, seen: Set<unknown>): unknown {
  if (typeof value !== "object" || value === null || seen.has(value)) {
    return undefined;
  }
  seen.add(value);
  if (isLoaderData(value)) return value;
  for (const child of Object.values(value as Record<string, unknown>)) {
    const found = findLoaderData(child, seen);
    if (found !== undefined) return found;
  }
  return undefined;
}

export interface FetchPageArgs {
  q: string;
  page: number;
  pageSize: number;
}

function computeTotalPages(
  totalCount: number | null | undefined,
  pageSize: number,
  page: number,
  hasMore: boolean,
): number {
  const byCount =
    typeof totalCount === "number" && totalCount > 0
      ? Math.ceil(totalCount / pageSize)
      : 1;
  return hasMore ? Math.max(byCount, page + 1) : Math.max(byCount, page, 1);
}

/**
 * Fetch one page from Source B and return mapped `Person[]`. Throws on upstream/transport,
 * decode, or schema-validation failure so the route can surface it as a 502 (no detail
 * leaked). `pageSize` is already capped by the gateway's `QuerySchema`; we additionally slice
 * to it so our served page can never exceed the server-side cap even if B returns more.
 */
export async function fetchPage({
  q,
  page,
  pageSize,
}: FetchPageArgs): Promise<ProxyResponse> {
  const url = new URL("/_root.data", env.SOURCE_B_DATA_URL);
  url.searchParams.set("query", q); // B's Remix loader reads `?query=`
  url.searchParams.set("page", String(page));

  const res = await fetchUpstream(url.toString());
  if (!res.ok) {
    throw new Error(`Source B upstream returned HTTP ${res.status}`);
  }

  const root = decodeTurboStream(JSON.parse(res.text));
  const data = RawBDataSchema.parse(extractLoaderData(root));

  const items = data.persons.slice(0, pageSize).map(mapToPerson);
  const resolvedPage = data.pagination?.page ?? page;
  const hasMore = data.pagination?.hasMore ?? false;

  return {
    items,
    page: resolvedPage,
    totalPages: computeTotalPages(data.totalCount, pageSize, resolvedPage, hasMore),
  };
}
