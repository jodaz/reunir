/**
 * GET /api/sources/vtb — Source B (venezuelatebusca).
 *
 * B's `_root.data` feed is openly readable (the Turnstile only guards report submission, not
 * reads — we never touch it). The adapter decodes B's Remix turbo-stream, then STRIPS the
 * cédula + reporter contact B leaks so the served `Person` carries only already-public fields.
 * Upstream/decode/validation failures return 502 (no detail leaked to the client).
 */

import { NextResponse } from "next/server";
import { withGateway } from "@/lib/gateway";
import { fetchPage } from "@/adapters/vtb";

export const GET = withGateway(async (_req, query) => {
  try {
    const body = await fetchPage(query);
    return NextResponse.json(body, { status: 200 });
  } catch (err) {
    console.error("[source:b] upstream/validation failure:", String(err));
    return NextResponse.json(
      { error: "upstream_unavailable", source: "b" },
      { status: 502 },
    );
  }
});

// CORS preflight: the same gateway fn branches on OPTIONS → preflight response (PRD §5.2).
export const OPTIONS = GET;
