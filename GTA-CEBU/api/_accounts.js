// Player accounts.
//
// The work itself lives in Postgres functions (db/002-accounts-rpc.sql), not
// here. That is forced by the deployment: the production backend is a
// Cloudflare Worker, which cannot open a TLS connection to Postgres -- every
// SSL variant was measured failing, and only plaintext connects, which is not
// an option for passwords. So the Worker reaches Supabase over HTTPS, and
// HTTPS can only call functions. Putting the logic in the database means the
// dev server and the Worker run the same code rather than two versions of it.
//
// This module is only the calling convention: hand it an `rpc(name, args)`
// that returns rows, and it does not care whether that is node-postgres or a
// fetch to PostgREST.

// Every function returns one row shaped like this; an empty error means it
// worked. Split it into the shape the rest of the game expects.
function unpack(rows) {
  const row = Array.isArray(rows) ? rows[0] : rows;
  if (!row) return { error: 'Something went wrong, try again' };
  if (row.error) return { error: row.error };
  const number = value => Number(value ?? 0) || 0;
  return {
    player: {
      id: row.id, name: row.name, email: row.email || null,
      createdAt: row.created_at ?? row.createdAt ?? null,
      // Progress travels with the account so the menu can draw a level
      // without a second round trip. bigint columns arrive as strings over
      // both transports, hence the coercion.
      exp: number(row.exp), points: number(row.points),
      matchesPlayed: number(row.matches_played),
      kills: number(row.kills), deaths: number(row.deaths), wins: number(row.wins),
      money: number(row.money), streetRep: number(row.street_rep),
      engineLevel: number(row.engine_level), completedJobs: number(row.completed_jobs),
      completedActivities: number(row.completed_activities), activityWins: number(row.activity_wins),
      bestSkylineSprintMs: number(row.best_skyline_sprint_ms)
    },
    token: row.token
  };
}

export const registerPlayer = (rpc, { name, email, password, userAgent } = {}) =>
  rpc('register_player', {
    p_name: String(name ?? ''), p_email: String(email ?? ''),
    p_password: String(password ?? ''), p_agent: String(userAgent ?? '')
  }).then(unpack);

export const loginPlayer = (rpc, { name, password, userAgent } = {}) =>
  rpc('login_player', {
    p_name: String(name ?? ''), p_password: String(password ?? ''),
    p_agent: String(userAgent ?? '')
  }).then(unpack);

export const playerForToken = (rpc, token) =>
  rpc('player_for_token', { p_token: String(token ?? '') })
    .then(rows => { const out = unpack(rows); return out.error ? null : out.player; });

export const logoutPlayer = (rpc, token) =>
  rpc('logout_player', { p_token: String(token ?? '') }).then(() => undefined);

// --- transports -------------------------------------------------------------

// Supabase over HTTPS. What the Worker uses: no TCP, no TLS handshake of our
// own, nothing to pool. The service key never leaves the server.
export function restRpc(url, serviceKey) {
  const base = String(url).replace(/\/+$/, '');
  return async (name, args) => {
    const response = await fetch(`${base}/rest/v1/rpc/${name}`, {
      method: 'POST',
      headers: {
        'apikey': serviceKey,
        'Authorization': `Bearer ${serviceKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(args)
    });
    const text = await response.text();
    if (!response.ok) {
      // Never hand a database message to the browser; it can carry SQL.
      throw Object.assign(Error('Account service error'), { status: response.status, detail: text.slice(0, 300) });
    }
    return text ? JSON.parse(text) : [];
  };
}

// node-postgres, for the local dev server. Calls the identical functions, so
// what you see locally is what runs in production.
export function sqlRpc(query) {
  return async (name, args) => {
    const keys = Object.keys(args);
    const params = keys.map((key, i) => `${key} => $${i + 1}`).join(', ');
    return query(`select * from ${name}(${params})`, keys.map(key => args[key]));
  };
}
