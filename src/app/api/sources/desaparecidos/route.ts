/**
 * GET /api/sources/desaparecidos — Source A.
 *
 * The gateway validates/caps the query (non-empty `q`, `pageSize` <= MAX). The adapter
 * fetches upstream, repairs encoding, Zod-validates the raw shape, and maps to `Person`
 * with sensitive fields stripped. Upstream/validation failures return 502 (no detail
 * leaked to the client).
 */

import { NextResponse } from "next/server";
import { withGateway } from "@/lib/gateway";
import { fetchPage } from "@/adapters/desaparecidos";

export const GET = withGateway(async (_req, query) => {
  try {
    const body = await fetchPage(query);
    return NextResponse.json(body, { status: 200 });
  } catch (err) {
    console.error("[source:a] upstream/validation failure:", String(err));
    return NextResponse.json(
      { error: "upstream_unavailable", source: "a" },
      { status: 502 },
    );
  }
});
