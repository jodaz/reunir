/**
 * Query-param schema for `/api/sources/*`. Centralizes the PRD §5.4 caps so every route
 * enforces them identically (no "return everything" endpoint):
 *   - `q`: required, non-empty, minimum length (no bulk/export).
 *   - `page`: integer >= 1.
 *   - `pageSize`: integer >= 1, clamped server-side to `MAX_PAGE_SIZE` (~48).
 *
 * Re-exports `ProxyResponseSchema` so callers have one import for the proxy boundary.
 */

import { z } from "zod";
import { env } from "@/lib/env";

export { ProxyResponseSchema } from "@/schemas/person";

/** Minimum query length — short enough for real names, long enough to block "return all". */
export const MIN_QUERY_LENGTH = 2;

export const QuerySchema = z.object({
  q: z
    .string()
    .trim()
    .min(MIN_QUERY_LENGTH, `q must be at least ${MIN_QUERY_LENGTH} characters`),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce
    .number()
    .int()
    .min(1)
    .default(env.MAX_PAGE_SIZE)
    // Clamp regardless of what the client requested (PRD §5.4 cap).
    .transform((n) => Math.min(n, env.MAX_PAGE_SIZE)),
});

export type Query = z.infer<typeof QuerySchema>;
