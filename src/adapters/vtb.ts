/**
 * Source B — venezuelatebusca (vtb).
 *
 * Deliberately a "not connected" stub. Per ADR 0001 we do NOT automate past its
 * Cloudflare Turnstile (no headless solving, no token replay) and we do NOT ingest its
 * raw feed (which leaks cédulas + reporter contact details we have committed never to
 * centralize). B becomes "connected" only via an authorized feed/webhook, or once the
 * shared-`reconexion` upstream overlap is confirmed through Source C.
 */

import type { NotConnectedResponse } from "@/lib/types";

/** Returns the structured "not connected" marker the UI branches on. No live fetch. */
export function getNotConnected(): NotConnectedResponse {
  return {
    status: "not_connected",
    source: "b",
    reason: "Fuente no conectada",
  };
}
