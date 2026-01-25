import geoip from 'geoip-lite';

function isLoopback(addr) {
  if (!addr) return false;
  return addr === '127.0.0.1' || addr === '::1' || addr.startsWith('::ffff:127.');
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

  // Trust XFF only when we're behind a local reverse proxy.
  const ip = (isLoopback(remoteAddr) ? (firstForwardedFor(req) || remoteAddr) : remoteAddr);
  if (!ip) return null;

  const info = geoip.lookup(ip);

  // Discard IP immediately; do not return it or store it anywhere.
  if (!info) return null;

  const country = typeof info.country === 'string' ? info.country : null;
  const region = typeof info.region === 'string' ? info.region : null;
  if (!country && !region) return null;

  return { country, region };
}
