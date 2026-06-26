/**
 * GET /api/sources/terremoto — Source C.
 *
 * M1 placeholder: query is validated/capped by the gateway, but live upstream paging is
 * Cycle 1. Returns a typed, empty `ProxyResponse` with HTTP 501 (Not Implemented).
 */

import { NextResponse } from "next/server";
import { withGateway } from "@/lib/gateway";
import type { ProxyResponse } from "@/lib/types";

export const GET = withGateway(async (_req, query) => {
  const body: ProxyResponse = { items: [], page: query.page, totalPages: 0 };
  return NextResponse.json(body, { status: 501 });
});
