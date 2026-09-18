import { iceServers, rateLimited, sameOrigin } from './_turn.js';

// GET /api/turn -> { iceServers, expiresAt, relay }
//
// Handed to the browser just before it opens voice connections. Contains only
// credentials that expire; the Cloudflare account token never leaves here.
export default async function handler(request, response) {
  if (request.method !== 'GET') {
    response.status(405).json({ error: 'Method not allowed' });
    return;
  }
  if (!sameOrigin(request.headers.origin, request.headers.host)) {
    response.status(403).json({ error: 'Origin rejected' });
    return;
  }
  const client = request.headers['x-forwarded-for']?.split(',')[0]?.trim()
    || request.socket?.remoteAddress || 'unknown';
  if (rateLimited(client)) {
    response.status(429).json({ error: 'Too many credential requests' });
    return;
  }
  const result = await iceServers();
  // Credentials are per-request and short-lived: never let a CDN hold them.
  response.setHeader('Cache-Control', 'no-store');
  response.status(200).json(result);
}
