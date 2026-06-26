/**
 * Zod schema mirroring the canonical `Person` TS type (the outbound boundary).
 *
 * The TS `interface` in `lib/types.ts` stays the human-facing source of truth; this
 * schema is derived to match it and is used to assert the outbound contract in tests
 * and (optionally) as a final safety net before serialization. A compile-time check
 * below guarantees `z.infer<typeof PersonSchema>` is structurally identical to `Person`.
 */

import { z } from "zod";
import type { Person, ProxyResponse, Status } from "@/lib/types";

export const StatusSchema = z.enum(["missing", "found"]);

export const PersonSchema = z.object({
  id: z.string(),
  source: z.enum(["a", "b", "c"]),
  name: z.string(),
  age: z.number().nullable(),
  location: z.string(),
  description: z.string(),
  photoUrl: z.string().nullable(),
  status: StatusSchema,
  contact: z.string(),
  sourceUrl: z.string(),
});

export const ProxyResponseSchema = z.object({
  items: z.array(PersonSchema),
  page: z.number(),
  totalPages: z.number(),
});

// --- Compile-time assertions: z.infer must equal the hand-written TS types. ---
type Equal<X, Y> =
  (<T>() => T extends X ? 1 : 2) extends <T>() => T extends Y ? 1 : 2
    ? true
    : false;
type Expect<T extends true> = T;

// These produce a type error at build time if the schema drifts from the interface.
export type _AssertStatus = Expect<Equal<z.infer<typeof StatusSchema>, Status>>;
export type _AssertPerson = Expect<Equal<z.infer<typeof PersonSchema>, Person>>;
export type _AssertProxy = Expect<
  Equal<z.infer<typeof ProxyResponseSchema>, ProxyResponse>
>;
