/**
 * GET /api/sources/terremoto — Source C.
 *
 * The gateway validates/caps the query (non-empty `q`, `pageSize` <= MAX). The adapter
 * fetches upstream, repairs encoding, Zod-validates the raw shape, and maps to `Person`
 * with sensitive fields stripped. Upstream/validation failures return 502 (no detail
 * leaked to the client).
 */

import { NextResponse } from "next/server";
import { withGateway } from "@/lib/gateway";
import { fetchPage } from "@/adapters/terremoto";

export const GET = withGateway(async (_req, query) => {
  try {
    const body = await fetchPage(query);
    return NextResponse.json(body, { status: 200 });
  } catch (err) {
    console.error("[source:c] upstream/validation failure:", String(err));
    return NextResponse.json(
      { error: "upstream_unavailable", source: "c" },
      { status: 502 },
    );
  }
});

// CORS preflight: the same gateway fn branches on OPTIONS → preflight response (PRD §5.2).
export const OPTIONS = GET;
