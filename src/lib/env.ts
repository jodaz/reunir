/**
 * Server-side environment configuration, validated with Zod at module load.
 *
 * Cache (Upstash) and Turnstile vars are OPTIONAL so the app boots locally with nothing
 * set — features degrade gracefully (no cache, gate disabled in dev). See ADR 0002 §5.
 *
 * This module reads `process.env` and must only be imported from server code
 * (route handlers, gateway, adapters), never from a client component bundle.
 */

import { z } from "zod";

const EnvSchema = z.object({
  // --- App identity / politeness ---
  REUNIR_USER_AGENT: z
    .string()
    .default("ReunirBot/0.1 (+https://reunir.example/about)"),
  REUNIR_CONTACT_URL: z.string().default("https://reunir.example/about"),

  // --- Upstream base URLs (used from Cycle 1) ---
  SOURCE_A_BASE_URL: z
    .string()
    .default("https://desaparecidos-terremoto-api.theempire.tech"),
  SOURCE_C_BASE_URL: z.string().default("https://terremotovenezuela.app"),
  // Source B has TWO hosts: the Remix data endpoint we read (workers.dev) and the public
  // site that serves B's media + human-facing records (`venezuelatebusca.com`, also the
  // `/media/photos/...` host embedded in Source C's responses — see ADR 0001). The data
  // read path is open (no Turnstile on reads; the Turnstile only guards report submission).
  SOURCE_B_DATA_URL: z
    .string()
    .default("https://venezuela-te-busca-app.hellogafaro.workers.dev"),
  SOURCE_B_BASE_URL: z.string().default("https://venezuelatebusca.com"),

  // --- Server-side politeness cache (Cycle 3; unset = no Upstash, in-memory fallback) ---
  UPSTASH_REDIS_REST_URL: z.string().optional().default(""),
  UPSTASH_REDIS_REST_TOKEN: z.string().optional().default(""),
  CACHE_TTL_SECONDS: z.coerce.number().int().positive().default(60),

  // --- Outbound politeness: timeout / retry / circuit breaker (Cycle 3) ---
  // Per-source request timeout (ms). Each retry attempt gets its own fresh timeout.
  UPSTREAM_TIMEOUT_MS: z.coerce.number().int().positive().default(8000),
  // Total attempts per call (1 = no retry). Bounded so backoff never amplifies load.
  UPSTREAM_MAX_ATTEMPTS: z.coerce.number().int().min(1).max(5).default(3),
  // Exponential backoff base / ceiling (ms). Actual delay = min(base * 2^n, max) + jitter.
  UPSTREAM_BACKOFF_BASE_MS: z.coerce.number().int().min(0).default(200),
  UPSTREAM_BACKOFF_MAX_MS: z.coerce.number().int().min(0).default(2000),
  // Circuit breaker: consecutive transient failures that trip OPEN, and the OPEN cooldown.
  BREAKER_FAILURE_THRESHOLD: z.coerce.number().int().positive().default(5),
  BREAKER_COOLDOWN_MS: z.coerce.number().int().positive().default(15000),

  // --- Self-protection: token gate / rate limit ---
  TURNSTILE_SITE_KEY: z.string().optional().default(""),
  TURNSTILE_SECRET_KEY: z.string().optional().default(""),
  SESSION_TOKEN_SECRET: z.string().optional().default(""),
  // Optional Turnstile action — when set, the widget sends it and siteverify must echo it.
  TURNSTILE_ACTION: z.string().optional().default(""),
  // Explicit dev opt-in to DISABLE the gate (fail-closed by default — see lib/security/config).
  // "1"/"true" disables; absence is NOT a disable signal (the gate stays closed without secrets).
  GATE_DISABLED: z.string().optional().default(""),
  // No default origin: REQUIRED in production (enforced at request time in lib/security/origin),
  // so an unset value can never silently 403 every real same-origin relative via a stale default.
  ALLOWED_ORIGIN: z.string().optional(),
  RATE_LIMIT_PER_MIN: z.coerce.number().int().positive().default(30),

  // --- Server-enforced caps (PRD §5.4) ---
  MAX_PAGE_SIZE: z.coerce.number().int().positive().default(48),
});

export type Env = z.infer<typeof EnvSchema>;

const parsed = EnvSchema.safeParse(process.env);

if (!parsed.success) {
  // Surface misconfiguration loudly; only required-but-malformed vars can land here
  // since all secrets are optional with defaults.
  throw new Error(
    `Invalid environment configuration:\n${z.prettifyError(parsed.error)}`,
  );
}

export const env: Env = parsed.data;

/** Convenience flags for graceful degradation in dev (no secrets set). */
export const isCacheEnabled = Boolean(
  env.UPSTASH_REDIS_REST_URL && env.UPSTASH_REDIS_REST_TOKEN,
);
export const isTokenGateEnabled = Boolean(
  env.TURNSTILE_SECRET_KEY && env.SESSION_TOKEN_SECRET,
);

/**
 * Rate-limit store readiness — decided by its OWN backing creds, NOT `isCacheEnabled`. They
 * happen to share the Upstash instance today, but the limiter must answer "am I durable?"
 * independently so a prod gate is never silently backed by a per-isolate in-memory counter
 * (see lib/security/ratelimit `assertLimiterBackend`).
 */
export const isRateLimitStoreEnabled = Boolean(
  env.UPSTASH_REDIS_REST_URL && env.UPSTASH_REDIS_REST_TOKEN,
);
