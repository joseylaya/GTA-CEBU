// Central configuration for Phase 2 proximity voice chat.
// Every tunable number the voice system uses lives here; nothing else in the
// project should hardcode distances, keys, or ICE endpoints.

// Distance attenuation, in world metres. The renderer's world units are metres.
export const VOICE_MIN_DISTANCE = 5;   // full volume at or inside this radius
export const VOICE_MAX_DISTANCE = 30;  // effectively inaudible at or beyond this

// Peer connections are only held for players who could plausibly be heard.
// The gap between the two values is hysteresis so walking along the boundary
// does not repeatedly tear down and rebuild a connection.
export const VOICE_PEER_CONNECT_DISTANCE = 60;
export const VOICE_PEER_RELEASE_DISTANCE = 90;

// Push to talk. Aircraft flight mode keeps Numpad 8 / Numpad 2 / B.
export const VOICE_PTT_CODE = 'KeyV';
export const VOICE_PTT_LABEL = 'V';
export const VOICE_OPEN_MIC_CODE = 'KeyT';
export const VOICE_OPEN_MIC_LABEL = 'T';

// How often the voice system does its non-render work, in seconds.
// Positional audio follows the scene graph for free; these only pace the
// comparatively expensive bookkeeping.
export const VOICE_LEVEL_INTERVAL = 0.1;   // speaking detection sampling
export const VOICE_TOPOLOGY_INTERVAL = 0.5; // proximity connect/release sweep

// Voice activity detection.
export const VOICE_ACTIVE_RMS = 0.012;  // loudness at which speech is detected
export const VOICE_RELEASE_MS = 450;    // quiet for this long before it clears

// Microphone capture. Audio only -- the camera is never requested.
export const VOICE_MEDIA_CONSTRAINTS = {
  audio: {
    echoCancellation: true,
    noiseSuppression: true,
    autoGainControl: true,
    channelCount: 1
  },
  video: false
};

// A handshake that has not completed in this long is abandoned and retried.
// Covers any lost signal, not only a peer who enabled voice late.
export const VOICE_NEGOTIATION_TIMEOUT_MS = 10000;

// How long to leave a peer alone after its connection failed outright.
export const VOICE_RETRY_BACKOFF_MS = 30000;
// A stalled handshake is worth retrying quickly; a refusal is not.
export const VOICE_RETRY_SOON_MS = 2000;

export const VOICE_STORAGE_KEY = 'districtZeroVoiceMuted';
export const VOICE_LOG_PREFIX = '[Voice]';

// ICE configuration.
//
// Deployments supply their own servers through Vite environment variables so
// that infrastructure can change without touching the voice system:
//
//   VITE_ICE_SERVERS   full RTCIceServer[] as JSON (wins over the fields below)
//   VITE_TURN_URL      single TURN url, e.g. turn:turn.example.com:3478
//   VITE_TURN_USERNAME TURN username
//   VITE_TURN_CREDENTIAL TURN credential
//
// Anything reaching the browser is public by definition. Use short-lived TURN
// credentials minted per session rather than a permanent account; see
// `describeIceSources()` for what the running build actually loaded.
const DEFAULT_STUN = [
  { urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] }
];

function parseIceServers(raw) {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) && parsed.length ? parsed : null;
  } catch {
    console.warn(`${VOICE_LOG_PREFIX} VITE_ICE_SERVERS is not valid JSON; falling back to STUN`);
    return null;
  }
}

function turnFromEnv(env) {
  const urls = env.VITE_TURN_URL;
  if (!urls) return null;
  const server = { urls };
  if (env.VITE_TURN_USERNAME) server.username = env.VITE_TURN_USERNAME;
  if (env.VITE_TURN_CREDENTIAL) server.credential = env.VITE_TURN_CREDENTIAL;
  return server;
}

const env = import.meta.env ?? {};
const explicit = parseIceServers(env.VITE_ICE_SERVERS);
const turn = turnFromEnv(env);

export const ICE_SERVERS = explicit ?? (turn ? [...DEFAULT_STUN, turn] : DEFAULT_STUN);

// Connection options that never depend on which ICE servers are in use.
export const RTC_BASE_CONFIG = {
  iceCandidatePoolSize: 2,
  bundlePolicy: 'max-bundle'
};

// What the build-time configuration alone can offer, used when the server has
// no relay to hand out.
export function describeIceSources() {
  if (explicit) return 'VITE_ICE_SERVERS';
  if (turn) return 'default STUN + VITE_TURN_URL';
  return 'default public STUN (no TURN configured)';
}

// Runtime ICE resolution.
//
// The server mints short-lived TURN credentials at /api/turn, so nothing
// long-lived is compiled into this bundle. If that endpoint is absent, fails,
// or has no relay configured, voice falls back to the build-time servers above
// and still connects for the majority of pairs that do not need relaying.
let resolved = null;

export async function resolveIceServers({ force = false } = {}) {
  const now = Date.now();
  if (!force && resolved && (resolved.expiresAt === 0 || resolved.expiresAt - now > 60000)) {
    return resolved;
  }
  try {
    const response = await fetch('/api/turn', { headers: { Accept: 'application/json' } });
    if (!response.ok) throw Error(`status ${response.status}`);
    const data = await response.json();
    const servers = Array.isArray(data?.iceServers) ? data.iceServers.filter(entry => entry?.urls) : [];
    if (!servers.length) throw Error('no ice servers returned');
    resolved = {
      iceServers: servers,
      expiresAt: Number(data.expiresAt) || 0,
      // Only claim a relay when the server actually issued one.
      description: data.relay ? 'server-issued TURN credentials' : 'server STUN (no relay configured)'
    };
    return resolved;
  } catch (error) {
    console.debug(`${VOICE_LOG_PREFIX} TURN endpoint unavailable (${error.message}); using built-in ICE servers`);
    resolved = { iceServers: ICE_SERVERS, expiresAt: 0, description: describeIceSources() };
    return resolved;
  }
}

// Credentials near expiry should not be handed to a brand new connection.
export function iceServersExpired() {
  return Boolean(resolved && resolved.expiresAt && resolved.expiresAt - Date.now() < 60000);
}
