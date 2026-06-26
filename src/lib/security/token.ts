/**
 * Short-lived signed session token (PRD §5.1) — Web Crypto only.
 *
 * Turnstile proves a human ONCE; we then hand the browser a compact signed token
 * (issued-at / expiry) so subsequent `/api/sources/*` calls don't re-challenge. The token
 * is an opaque `<payloadB64url>.<hmacB64url>` string carrying NO identity — just `iat`/`exp`
 * — and is verified with HMAC-SHA256 via `crypto.subtle`.
 *
 * WORKERS/OPENNEXT (ADR 0003): everything here uses Web-standard APIs ONLY —
 * `crypto.subtle`, `TextEncoder`/`TextDecoder`, `btoa`/`atob`. No `node:crypto`, no
 * `jsonwebtoken`. `crypto.subtle.verify` does the signature compare in constant time, so we
 * never hand-roll a timing-safe `===` over raw bytes.
 */

const enc = new TextEncoder();
const dec = new TextDecoder();

/** Default session lifetime (20 min) — inside the PRD's 15–30 min window. */
export const SESSION_TTL_SECONDS = 20 * 60;

/** Cookie the session token rides in (httpOnly; set by the Turnstile verify route). */
export const SESSION_COOKIE = "reunir_session";

export interface SessionPayload {
  /** Issued-at (epoch seconds). */
  iat: number;
  /** Expiry (epoch seconds). */
  exp: number;
}

function base64urlEncode(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64urlDecode(str: string): Uint8Array {
  const norm = str.replace(/-/g, "+").replace(/_/g, "/");
  const pad = norm.length % 4 === 0 ? 0 : 4 - (norm.length % 4);
  const bin = atob(norm + "=".repeat(pad));
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

async function importKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

/** Sign a fresh session token valid for `ttlSeconds`. `now` is injectable for tests. */
export async function signSessionToken(
  secret: string,
  ttlSeconds: number = SESSION_TTL_SECONDS,
  now: number = Date.now(),
): Promise<string> {
  const iat = Math.floor(now / 1000);
  const payload: SessionPayload = { iat, exp: iat + ttlSeconds };
  const payloadB64 = base64urlEncode(enc.encode(JSON.stringify(payload)));
  const key = await importKey(secret);
  const sig = new Uint8Array(
    await crypto.subtle.sign("HMAC", key, enc.encode(payloadB64)),
  );
  return `${payloadB64}.${base64urlEncode(sig)}`;
}

/**
 * Verify a session token: signature valid (constant-time via `subtle.verify`) AND not
 * expired. Returns `false` for anything malformed/tampered/expired — never throws.
 */
export async function verifySessionToken(
  secret: string,
  token: string | undefined | null,
  now: number = Date.now(),
): Promise<boolean> {
  if (!token || typeof token !== "string") return false;
  const dot = token.indexOf(".");
  if (dot <= 0 || dot === token.length - 1) return false;
  const payloadB64 = token.slice(0, dot);
  const sigB64 = token.slice(dot + 1);

  let sig: Uint8Array;
  try {
    sig = base64urlDecode(sigB64);
  } catch {
    return false;
  }

  let valid: boolean;
  try {
    const key = await importKey(secret);
    valid = await crypto.subtle.verify(
      "HMAC",
      key,
      sig as unknown as BufferSource,
      enc.encode(payloadB64),
    );
  } catch {
    return false;
  }
  if (!valid) return false;

  let payload: SessionPayload;
  try {
    payload = JSON.parse(dec.decode(base64urlDecode(payloadB64)));
  } catch {
    return false;
  }
  if (typeof payload.exp !== "number") return false;
  return Math.floor(now / 1000) < payload.exp;
}

/**
 * Stable, non-reversible fingerprint of a token for the per-token rate-limit key. We never
 * use the raw token as a key (it would land in cache/store logs); a truncated SHA-256 hex is
 * enough to bucket requests from the same session.
 */
export async function tokenFingerprint(token: string): Promise<string> {
  const digest = new Uint8Array(
    await crypto.subtle.digest("SHA-256", enc.encode(token)),
  );
  let hex = "";
  for (let i = 0; i < 8; i++) hex += digest[i].toString(16).padStart(2, "0");
  return hex;
}
