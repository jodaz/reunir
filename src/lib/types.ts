/**
 * Canonical domain model for Reunir — the single source of truth every cycle imports.
 *
 * Verbatim from PRD §3.1 / ADR 0002 §2. Do NOT add `cédula`, reporter email, or
 * reporter phone here: their absence is deliberate (PRD §3.1 / §5.7). If those fields
 * are ever needed for server-side matching they stay server-side and are never placed
 * on this type, which is what gets serialized to the client.
 */

export type Status = "missing" | "found";

export interface Person {
  id: string; // namespaced: "a:<id>", "b:<id>", "c:<id>"
  source: "a" | "b" | "c";
  name: string;
  age: number | null;
  location: string; // last seen
  description: string;
  photoUrl: string | null;
  status: Status;
  contact: string; // public contact as published at source
  sourceUrl: string; // deep link back to the original record
}

/** Shared proxy response shape (PRD §3.2) returned by `/api/sources/*`. */
export interface ProxyResponse {
  items: Person[];
  page: number;
  totalPages: number;
}

/**
 * Source B ("not connected") explicit state, so the UI can branch on it without
 * guessing. Returned by `adapters/vtb.ts` (see ADR 0001 — Source B is a stub by design,
 * no Turnstile automation, ever).
 */
export interface NotConnectedResponse {
  status: "not_connected";
  source: "b";
  reason: string; // short, user-facing, e.g. "Fuente no conectada"
}
