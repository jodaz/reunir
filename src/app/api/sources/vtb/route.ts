/**
 * GET /api/sources/vtb — Source B (venezuelatebusca).
 *
 * Returns the structured "not connected" response (ADR 0001). No live fetch, no
 * Turnstile automation, ever. Still routed through `withGateway` so protection stays
 * uniform across all `/api/sources/*` endpoints.
 */

import { NextResponse } from "next/server";
import { withGateway } from "@/lib/gateway";
import { getNotConnected } from "@/adapters/vtb";

export const GET = withGateway(async () => {
  return NextResponse.json(getNotConnected(), { status: 200 });
});

// CORS preflight: the same gateway fn branches on OPTIONS → preflight response (PRD §5.2).
export const OPTIONS = GET;
