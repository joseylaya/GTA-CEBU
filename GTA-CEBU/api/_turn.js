// Server side only -- never imported by the browser bundle.
//
// Mints short-lived TURN credentials on demand. The account secret stays on the
// server; the browser only ever sees a username and password that expire within
// hours, so a credential scraped out of the page is worthless by the next day.
//
// Configure with (all server side, deliberately NOT prefixed VITE_):
//   CLOUDFLARE_TURN_KEY_ID      the TURN key id from the Cloudflare dashboard
//   CLOUDFLARE_TURN_API_TOKEN   that key's API token
//   TURN_TTL_SECONDS            optional, default 7200
//   CLOUDFLARE_TURN_ENDPOINT    optional override if the API path ever moves

const DEFAULT_TTL = 7200;
const STUN_FALLBACK = [
  { urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] }
];

const endpointFor = keyId =>
  process.env.CLOUDFLARE_TURN_ENDPOINT
  || `https://rtc.live.cloudflare.com/v1/turn/keys/${keyId}/credentials/generate-ice-servers`;

function ttlSeconds() {
  const raw = Number(process.env.TURN_TTL_SECONDS);
  return Number.isFinite(raw) && raw >= 600 && raw <= 86400 ? Math.floor(raw) : DEFAULT_TTL;
}

export function turnConfigured() {
  return Boolean(process.env.CLOUDFLARE_TURN_KEY_ID && process.env.CLOUDFLARE_TURN_API_TOKEN);
}

// Cloudflare has returned both a single object and an array under `iceServers`
// across API revisions; accept either and always hand back an array.
function normalise(payload) {
  const servers = payload?.iceServers ?? payload;
  if (!servers) return [];
  return (Array.isArray(servers) ? servers : [servers]).filter(entry => entry && entry.urls);
}

// Cached per server instance: one mint serves every player until it nears
// expiry, so a busy district does not hammer the provider's API.
let cached = null;

export async function iceServers({ force = false } = {}) {
  if (!turnConfigured()) return { iceServers: STUN_FALLBACK, expiresAt: 0, relay: false };

  const now = Date.now();
  // Re-mint a few minutes early so nobody is handed a credential about to die.
  if (!force && cached && cached.expiresAt - now > 300000) return cached;

  const ttl = ttlSeconds();
  try {
    const response = await fetch(endpointFor(process.env.CLOUDFLARE_TURN_KEY_ID), {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.CLOUDFLARE_TURN_API_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ ttl }),
      signal: AbortSignal.timeout(6000)
    });
    if (!response.ok) {
      const detail = (await response.text().catch(() => '')).slice(0, 200);
      throw Error(`Cloudflare TURN responded ${response.status}${detail ? `: ${detail}` : ''}`);
    }
    const servers = normalise(await response.json());
    if (!servers.length) throw Error('Cloudflare TURN returned no ice servers');
    // Keep STUN alongside TURN: direct connections stay direct, and relaying is
    // only used when a direct path genuinely cannot be found.
    cached = {
      iceServers: [...STUN_FALLBACK, ...servers],
      expiresAt: now + ttl * 1000,
      relay: true
    };
    return cached;
  } catch (error) {
    console.error('[turn] Could not mint credentials:', error.message);
    // Voice still works for most pairs on STUN alone, so degrade rather than fail.
    return { iceServers: STUN_FALLBACK, expiresAt: 0, relay: false };
  }
}

// Shared by both backends so the rules cannot drift apart.
const hits = new Map();
export function rateLimited(key, limit = 30, windowMs = 60000) {
  const now = Date.now();
  const entry = hits.get(key);
  if (!entry || now - entry.start > windowMs) {
    hits.set(key, { start: now, count: 1 });
    if (hits.size > 500) for (const [k, v] of hits) if (now - v.start > windowMs) hits.delete(k);
    return false;
  }
  entry.count += 1;
  return entry.count > limit;
}

export function sameOrigin(originHeader, hostHeader) {
  if (!originHeader) return true;
  try { return new URL(originHeader).host === hostHeader; } catch { return false; }
}
