/**
 * Adapter registry — maps a source letter to its module.
 *
 * `a` (desaparecidos) and `c` (terremoto) expose a raw schema + `mapToPerson` (live
 * paging lands in Cycle 1). `b` (vtb) is a "not connected" stub by design (ADR 0001).
 */

import * as desaparecidos from "@/adapters/desaparecidos";
import * as terremoto from "@/adapters/terremoto";
import * as vtb from "@/adapters/vtb";

export { desaparecidos, terremoto, vtb };

export const adapters = {
  a: desaparecidos,
  c: terremoto,
  b: vtb,
} as const;
