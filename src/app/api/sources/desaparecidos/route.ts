/**
 * GET /api/sources/desaparecidos — Source A.
 *
 * A's `/api/personas` now requires a Google reCAPTCHA token (HTTP 403 "Verificación
 * reCAPTCHA requerida" on unauthenticated reads). We do NOT bypass human-verification gates,
 * so this route returns the structured "not connected" response — NO live fetch (which also
 * keeps us from politely hammering a gate we won't pass). Still routed through `withGateway`
 * so protection stays uniform across all `/api/sources/*` endpoints. The adapter's
 * `fetchPage`/`mapToPerson` stay intact for if/when A offers a sanctioned, token-free feed.
 */

import { NextResponse } from "next/server";
import { withGateway } from "@/lib/gateway";
import { getNotConnected } from "@/adapters/desaparecidos";

export const GET = withGateway(async () => {
  return NextResponse.json(getNotConnected(), { status: 200 });
});

// CORS preflight: the same gateway fn branches on OPTIONS → preflight response (PRD §5.2).
export const OPTIONS = GET;
