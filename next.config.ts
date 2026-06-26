import type { NextConfig } from "next";

/**
 * Security response headers (PRD §5.2).
 *
 * HSTS forces HTTPS for two years incl. subdomains. On Cloudflare (ADR 0003) HSTS may ALSO be
 * set at the edge (zone SSL/TLS settings) — keeping it here too is belt-and-suspenders and
 * documents intent in-repo. The rest are low-risk hardening headers (no framing, no MIME
 * sniffing, conservative referrer + permissions). CSP is deferred to the Cycle 6 hardening
 * pass (it needs the Turnstile/script origins enumerated).
 */
const securityHeaders = [
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "geolocation=(), camera=(), microphone=(), browsing-topics=()",
  },
];

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;
