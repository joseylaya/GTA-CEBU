// Levelling and currency.
//
// Under src/ so the browser can import it, and re-exported to the backends,
// for the same reason the weapon table lives there: a client with its own copy
// of the rules will eventually disagree with the server, and the player sees
// the disagreement.
//
// Everything here is deliberately plain arithmetic with no state. The numbers
// are placeholders meant to be tuned -- change them in this one file and the
// menus, the server and the database function all move together.

// --- what a match is worth -------------------------------------------------
export const AWARDS = Object.freeze({
  played:  { exp: 50,  points: 10 },  // simply finishing a match
  kill:    { exp: 25,  points: 5  },
  death:   { exp: 5,   points: 0  },  // a small consolation, so a bad night still counts
  win:     { exp: 100, points: 25 }
});

// --- the curve ---------------------------------------------------------------
// Level 2 costs 400, and each level after costs 200 more than the last. Gentle
// enough that a first session moves the bar, steep enough that level 20 means
// something.
export const LEVEL_BASE = 400, LEVEL_STEP = 200, MAX_LEVEL = 100;

// Total experience needed to have reached a given level.
export function expForLevel(level) {
  const steps = Math.max(0, Math.min(MAX_LEVEL, Math.floor(level)) - 1);
  return steps * LEVEL_BASE + LEVEL_STEP * steps * (steps - 1) / 2;
}

export function levelForExp(exp) {
  const total = Math.max(0, Math.floor(Number(exp) || 0));
  let level = 1;
  while (level < MAX_LEVEL && total >= expForLevel(level + 1)) level++;
  return level;
}

// Everything a progress bar needs, in one call.
export function progress(exp) {
  const total = Math.max(0, Math.floor(Number(exp) || 0));
  const level = levelForExp(total);
  const floorExp = expForLevel(level);
  const nextExp = level >= MAX_LEVEL ? floorExp : expForLevel(level + 1);
  const needed = Math.max(0, nextExp - floorExp);
  const into = total - floorExp;
  return {
    level, exp: total, into, needed,
    ratio: needed ? Math.min(1, into / needed) : 1,
    maxed: level >= MAX_LEVEL
  };
}

// What one match earned. Kept here so the server, the end-of-match screen and
// the database all agree on the arithmetic.
export function matchReward({ kills = 0, deaths = 0, won = false } = {}) {
  const k = Math.max(0, Math.floor(kills)), d = Math.max(0, Math.floor(deaths));
  const exp = AWARDS.played.exp + k * AWARDS.kill.exp + d * AWARDS.death.exp + (won ? AWARDS.win.exp : 0);
  const points = AWARDS.played.points + k * AWARDS.kill.points + (won ? AWARDS.win.points : 0);
  return { exp, points, kills: k, deaths: d, won: Boolean(won) };
}
