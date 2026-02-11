import fs from 'node:fs';
import maxmind from 'maxmind';

let mmdbReader = null;
let mmdbInitAttempted = false;

function getMmdbReader_() {
  if (mmdbInitAttempted) return mmdbReader;
  mmdbInitAttempted = true;

  const dbPath =
    process.env.MAXMIND_DB_PATH ||
    process.env.GEOIP_DB_PATH ||
    '/var/lib/geoip/GeoLite2-City.mmdb';

  try {
    if (!dbPath || !fs.existsSync(dbPath)) {
      mmdbReader = null;
      return null;
    }

    mmdbReader = maxmind.openSync(dbPath);
    return mmdbReader;
  } catch {
    mmdbReader = null;
    return null;
  }
}

function isLoopback(addr) {
  if (!addr) return false;
  return addr === '127.0.0.1' || addr === '::1' || addr.startsWith('::ffff:127.');
}

function isPrivateV4(addr) {
  if (!addr) return false;
  // Expect addr normalized (no ::ffff: prefix).
  const m = String(addr).match(/^\d{1,3}(?:\.\d{1,3}){3}$/);
  if (!m) return false;
  const [a, b] = addr.split('.').map((x) => Number.parseInt(x, 10));
  if (!Number.isFinite(a) || !Number.isFinite(b)) return false;
  // 10.0.0.0/8
  if (a === 10) return true;
  // 172.16.0.0/12
  if (a === 172 && b >= 16 && b <= 31) return true;
  // 192.168.0.0/16
  if (a === 192 && b === 168) return true;
  // 100.64.0.0/10 (CGNAT)
  if (a === 100 && b >= 64 && b <= 127) return true;
  // 169.254.0.0/16 (link-local)
  if (a === 169 && b === 254) return true;
  return false;
}

function isTrustedProxyPeer(addr) {
  // Only trust X-Forwarded-For when the direct peer is plausibly a reverse proxy.
  // This avoids spoofing from arbitrary clients.
  return isLoopback(addr) || isPrivateV4(addr);
}

function stripPort(s) {
  // For X-Forwarded-For entries like "1.2.3.4:1234".
  if (!s) return s;
  const m = String(s).trim().match(/^\[?([0-9a-fA-F:.]+)\]?(?::\d+)?$/);
  return m ? m[1] : String(s).trim();
}

function normalizeIp(ip) {
  if (!ip) return null;
  const s = stripPort(ip);
  if (s.startsWith('::ffff:')) return s.slice('::ffff:'.length);
  return s;
}

function firstForwardedFor(req) {
  const raw = req?.headers?.['x-forwarded-for'];
  if (!raw) return null;
  const s = Array.isArray(raw) ? raw.join(',') : String(raw);
  const first = s.split(',')[0]?.trim();
  return first ? normalizeIp(first) : null;
}

export function coarseGeoFromRequest(req) {
  const remoteAddr = normalizeIp(req?.socket?.remoteAddress || null);

  // Trust XFF only when we're behind a trusted proxy.
  const ip = (isTrustedProxyPeer(remoteAddr) ? (firstForwardedFor(req) || remoteAddr) : remoteAddr);
  if (!ip) return null;

  const reader = getMmdbReader_();
  if (!reader) return null;

  const info = reader.get(ip);

  // Discard IP immediately; do not return it or store it anywhere.
  if (!info || typeof info !== 'object') return null;

  const country = typeof info?.country?.iso_code === 'string' ? info.country.iso_code : null;
  const region = typeof info?.subdivisions?.[0]?.iso_code === 'string' ? info.subdivisions[0].iso_code : null;
  const city = typeof info?.city?.names?.en === 'string' ? info.city.names.en : null;
  if (!country && !region && !city) return null;

  // Discard IP immediately; do not return it or store it anywhere.
  return { country, region, city };
}
