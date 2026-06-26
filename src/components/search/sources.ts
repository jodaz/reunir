"use client";

import type {
  NotConnectedResponse,
  ProxyResponse,
} from "@/lib/types";

/**
 * Client-side source registry + fetcher for the `/api/sources/*` proxies.
 *
 * Order here is the display order in the lamp strip. Keys match the canonical `Person.source`
 * letters ("a" | "b" | "c"); `endpoint` is the route segment under `/api/sources/`.
 *
 * A source whose upstream we can't lawfully consume returns a `NotConnectedResponse` instead
 * of `Person[]` (currently Source A — reCAPTCHA-gated; see ADR 0004). The fetcher returns a
 * discriminated union so the UI branches on the shape rather than guessing.
 */

export type SourceKey = "a" | "b" | "c";

export interface SourceMeta {
  key: SourceKey;
  /** Route segment: `/api/sources/<endpoint>`. */
  endpoint: "desaparecidos" | "terremoto" | "vtb";
  /** Short human label shown in the lamp + the card badge. */
  label: string;
}

/** Minimum query length — mirrors the server-side `MIN_QUERY_LENGTH` (PRD §5.4). */
export const MIN_QUERY_LENGTH = 2;

export const SOURCES: readonly SourceMeta[] = [
  { key: "a", endpoint: "desaparecidos", label: "Desaparecidos" },
  { key: "c", endpoint: "terremoto", label: "Terremoto Venezuela" },
  { key: "b", endpoint: "vtb", label: "Venezuela Te Busca" },
] as const;

export type SourceResult = ProxyResponse | NotConnectedResponse;

/** True when the success payload is the structured "not connected" state (e.g. Source A). */
export function isNotConnected(
  data: SourceResult,
): data is NotConnectedResponse {
  return (data as NotConnectedResponse).status === "not_connected";
}

/**
 * Fetch one source. Throws on any non-2xx (incl. the current A/C `501` placeholders) so
 * TanStack Query marks that source as errored and its lamp shows *sin conexión* — without
 * touching the other sources.
 */
export async function fetchSource(
  endpoint: SourceMeta["endpoint"],
  q: string,
  signal: AbortSignal,
): Promise<SourceResult> {
  const res = await fetch(
    `/api/sources/${endpoint}?q=${encodeURIComponent(q)}`,
    { signal, headers: { accept: "application/json" } },
  );
  if (!res.ok) {
    throw new Error(`source ${endpoint} responded ${res.status}`);
  }
  return (await res.json()) as SourceResult;
}
