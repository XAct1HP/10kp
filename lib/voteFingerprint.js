import { createHash } from "crypto";

// Coarse request fingerprinting for the public ballot.
//
// The gallery is open by design — no login, no verified email — so the
// only thing standing between us and vote stuffing is being able to spot
// it after the fact. This module turns a request into a handful of
// *salted digests* that support exactly one operation: equality. "Were
// these two votes cast from the same address / the same browser build?"
//
// We never store a raw IP or user-agent string. The salt makes the
// digests useless outside this deployment, and rotating it invalidates
// every stored fingerprint at once.

const SALT_ENV = "VOTE_FINGERPRINT_SALT";

// Prefers a dedicated secret; falls back to the service-role key so the
// feature works on a deployment that never set the dedicated one. The
// fallback is safe (already a server-only secret) but rotating it
// silently rotates all fingerprints, so set VOTE_FINGERPRINT_SALT
// explicitly in production.
function getSalt() {
  return process.env[SALT_ENV] || process.env.SUPABASE_SERVICE_ROLE_KEY || null;
}

function digest(salt, kind, value) {
  if (!salt || !value) return null;
  return createHash("sha256")
    .update(`${kind} ${salt} ${value}`)
    .digest("hex")
    .slice(0, 32); // 128 bits — collision-free at our scale, half the storage
}

// Vercel puts the real client address first in x-forwarded-for; x-real-ip
// is the fallback for other hosts. Everything after the first hop is
// proxy chain, not the client.
export function clientIpFrom(headers) {
  const forwarded = headers.get("x-forwarded-for") || "";
  const first = forwarded.split(",")[0]?.trim();
  return first || headers.get("x-real-ip")?.trim() || null;
}

// Reduce an address to the block its owner controls, so a dynamic lease
// or a phone hopping cell towers still groups together:
//   IPv4 -> /24, IPv6 -> /48.
// Returns null for anything we cannot parse rather than guessing.
export function ipPrefixOf(ip) {
  if (!ip) return null;
  const addr = String(ip).trim();
  if (addr.includes(".")) {
    const parts = addr.split(".");
    if (parts.length !== 4 || parts.some((p) => !/^\d{1,3}$/.test(p))) return null;
    return `${parts[0]}.${parts[1]}.${parts[2]}.0/24`;
  }
  if (addr.includes(":")) {
    const hextets = addr.split(":").filter(Boolean);
    if (hextets.length < 3) return null;
    return `${hextets.slice(0, 3).join(":")}::/48`;
  }
  return null;
}

// Vercel percent-encodes city names ("Ann%20Arbor").
function safeDecode(value) {
  if (!value) return null;
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

// Build the stored fingerprint for a vote. Every field is nullable — a
// missing header must never block a legitimate vote, so callers spread
// this straight into the insert and let the detector cope with nulls.
export function fingerprintFromHeaders(headers) {
  const salt = getSalt();
  const ip = clientIpFrom(headers);
  const prefix = ipPrefixOf(ip);
  const ua = headers.get("user-agent");

  return {
    ip_hash: digest(salt, "ip", ip),
    ip_prefix_hash: digest(salt, "ipp", prefix),
    user_agent_hash: digest(salt, "ua", ua),
    // Vercel edge geo headers. Absent off-Vercel, and absent for some
    // clients even on it — treat as a bonus, never a requirement.
    geo_country: headers.get("x-vercel-ip-country") || null,
    geo_region: headers.get("x-vercel-ip-country-region") || null,
    geo_city: safeDecode(headers.get("x-vercel-ip-city")),
  };
}
