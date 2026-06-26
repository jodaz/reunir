/**
 * Adapter registry — maps a source letter to its module.
 *
 * `c` (terremoto) and `b` (vtb) are LIVE: each exposes a raw schema + `mapToPerson` + a
 * `fetchPage`. `a` (desaparecidos) keeps its schema + `mapToPerson` (audited, ready to
 * reconnect) but its ROUTE returns a "not connected" stub — A's `/api/personas` now requires
 * a reCAPTCHA token we don't bypass, so `getNotConnected` is served instead of `fetchPage`.
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
