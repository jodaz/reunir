import type { MetadataRoute } from "next";

/**
 * robots.txt (PRD §5.8) — disallow crawling of `/api/*` (a deterrent and a legal marker that
 * automated collection is not permitted; see the Terms of Use). The human-facing search UI and
 * policy pages stay crawlable. This is a policy signal, not enforcement — the token gate, CORS
 * allowlist, and rate limits do the actual blocking.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/api/"],
      },
    ],
  };
}
