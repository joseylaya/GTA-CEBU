// Authoritative rules for a Deduction round: who may kill whom, when a meeting
// opens, and how a vote resolves. Pure functions over a round object so both
// backends apply identical rules and neither trusts the client.
//
// NPC seats exist here so a short-handed lobby still feels populated: they are
// votable and count toward the win condition. Their movement is still drawn
// locally by each client, which is cosmetic and does not affect these rules.

export const KILL_COOLDOWN_MS = 25000;
export const KILL_RANGE = 4.2;
export const DISCUSSION_MS = 10000;
export const VOTING_MS = 15000;
export const EMERGENCIES_PER_PLAYER = 1;

export function createRound(room, setup) {
  const roster = room.members.map(member => ({
    id: member.id, name: member.name, kind: 'player',
    role: setup.roles[member.id] || 'crewmate',
    alive: true, emergencies: EMERGENCIES_PER_PLAYER
  }));
  const npcImpostors = new Set(setup.npcImpostors || []);
  for (let i = 0; i < room.npcCount; i++) {
    roster.push({
      id: `npc-${i}`, name: setup.npcNames?.[i] || `Crew ${i + 1}`, kind: 'npc',
      role: npcImpostors.has(`npc-${i}`) ? 'impostor' : 'crewmate',
      alive: true, emergencies: 0
    });
  }
  return {
    // The host's client simulates the NPC crew and broadcasts it; everyone
    // else interpolates. Recorded here so clients know which role they have.
    hostId: room.hostId,
    phase: 'play', roster, seed: setup.seed,
    bodies: [], votes: {}, cooldowns: {},
    meetingUntil: 0, meetingReason: null, startedAt: Date.now()
  };
}

const seatOf = (round, id) => round.roster.find(seat => seat.id === id) || null;
export const aliveSeats = round => round.roster.filter(seat => seat.alive);
const aliveImpostors = round => aliveSeats(round).filter(seat => seat.role === 'impostor');
const aliveCrew = round => aliveSeats(round).filter(seat => seat.role !== 'impostor');

// Returns a winner once the round is decided, otherwise null.
export function checkWin(round) {
  if (!aliveImpostors(round).length) return 'crew';
  if (aliveImpostors(round).length >= aliveCrew(round).length) return 'impostors';
  return null;
}

// `positions` maps player id to {x,z}; absent entries skip the range check,
// which is what happens for NPC seats the server does not simulate.
export function applyKill(round, killerId, targetId, positions = {}, now = Date.now()) {
  if (round.phase !== 'play') return { error: 'Not during a meeting' };
  const killer = seatOf(round, killerId), target = seatOf(round, targetId);
  if (!killer || !killer.alive) return { error: 'You are not in this round' };
  if (killer.role !== 'impostor') return { error: 'Only the impostor can do that' };
  if (!target || !target.alive) return { error: 'That player is already down' };
  if (target.id === killer.id) return { error: 'Pick someone else' };
  if (target.role === 'impostor') return { error: 'That is your partner' };
  const ready = round.cooldowns[killerId] || 0;
  if (now < ready) return { error: `Kill cooldown ${Math.ceil((ready - now) / 1000)}s` };
  const here = positions[killerId], there = positions[targetId];
  if (here && there && Math.hypot(here.x - there.x, here.z - there.z) > KILL_RANGE) {
    return { error: 'Move closer' };
  }
  target.alive = false;
  round.cooldowns[killerId] = now + KILL_COOLDOWN_MS;
  const at = there || here || { x: 0, z: 0 };
  round.bodies.push({ id: target.id, name: target.name, x: at.x, z: at.z, at: now });
  return { event: { victimId: target.id, victimName: target.name, x: at.x, z: at.z }, winner: checkWin(round) };
}

export function openMeeting(round, callerId, bodyId, now = Date.now()) {
  if (round.phase !== 'play') return { error: 'A meeting is already running' };
  const caller = seatOf(round, callerId);
  if (!caller || !caller.alive) return { error: 'Only the living can call a meeting' };
  if (bodyId) {
    const body = round.bodies.find(entry => entry.id === bodyId && !entry.reported);
    if (!body) return { error: 'No body there' };
    body.reported = true;
  } else {
    if (caller.emergencies <= 0) return { error: 'No emergency meetings left' };
    caller.emergencies -= 1;
  }
  round.phase = 'meeting';
  round.votes = {};
  round.meetingUntil = now + DISCUSSION_MS;
  round.meetingReason = bodyId ? { kind: 'body', name: seatOf(round, bodyId)?.name || 'Someone' }
                               : { kind: 'emergency', name: caller.name };
  // Bodies are cleared on a meeting, as in the games this borrows from.
  round.bodies = [];
  return { event: { stage: 'discussion', until: round.meetingUntil, reason: round.meetingReason, caller: caller.name } };
}

export function castVote(round, voterId, candidateId) {
  if (round.phase !== 'voting') return { error: 'Voting is not open' };
  const voter = seatOf(round, voterId);
  if (!voter || !voter.alive) return { error: 'The dead do not vote' };
  if (round.votes[voterId]) return { error: 'You already voted' };
  if (candidateId !== 'skip') {
    const target = seatOf(round, candidateId);
    if (!target || !target.alive) return { error: 'Not a valid candidate' };
  }
  round.votes[voterId] = candidateId;
  const living = aliveSeats(round).filter(seat => seat.kind === 'player');
  return { complete: living.every(seat => round.votes[seat.id]) };
}

// Advances the meeting clock. Safe to call from any client at any time: it only
// acts when the server's own clock says the deadline has passed.
export function advanceMeeting(round, now = Date.now()) {
  if (round.phase === 'meeting' && now >= round.meetingUntil) {
    round.phase = 'voting';
    round.meetingUntil = now + VOTING_MS;
    return { event: { stage: 'voting', until: round.meetingUntil } };
  }
  return null;
}

// NPC seats vote too, so a short-handed lobby still produces a real tally.
function rollNpcVotes(round) {
  const living = aliveSeats(round);
  const candidates = living.filter(seat => seat.kind === 'player');
  for (const seat of living) {
    if (seat.kind !== 'npc' || round.votes[seat.id]) continue;
    // Follow whoever the humans are converging on, otherwise abstain.
    const tally = {};
    for (const choice of Object.values(round.votes)) if (choice !== 'skip') tally[choice] = (tally[choice] || 0) + 1;
    const leader = Object.entries(tally).sort((a, b) => b[1] - a[1])[0];
    round.votes[seat.id] = leader && Math.random() < 0.7 ? leader[0]
      : (Math.random() < 0.4 && candidates.length ? candidates[Math.floor(Math.random() * candidates.length)].id : 'skip');
  }
}

export function resolveVote(round, now = Date.now()) {
  if (round.phase !== 'voting') return null;
  const living = aliveSeats(round).filter(seat => seat.kind === 'player');
  const everyoneVoted = living.every(seat => round.votes[seat.id]);
  if (!everyoneVoted && now < round.meetingUntil) return null;
  rollNpcVotes(round);
  const tally = {};
  for (const choice of Object.values(round.votes)) tally[choice] = (tally[choice] || 0) + 1;
  const ranked = Object.entries(tally).sort((a, b) => b[1] - a[1]);
  // Most votes wins; a genuine tie ejects nobody.
  const tied = ranked.length > 1 && ranked[0][1] === ranked[1][1];
  const winnerId = !ranked.length || tied ? 'skip' : ranked[0][0];
  let ejected = null;
  if (winnerId !== 'skip') {
    ejected = seatOf(round, winnerId);
    if (ejected) ejected.alive = false;
  }
  round.phase = 'play';
  round.votes = {};
  round.meetingUntil = 0;
  // Everyone gets a fresh cooldown so nobody can kill the instant a meeting ends.
  for (const seat of aliveSeats(round)) {
    if (seat.role === 'impostor') round.cooldowns[seat.id] = now + 10000;
  }
  return {
    event: {
      ejectedId: ejected?.id || null,
      ejectedName: ejected?.name || null,
      wasImpostor: ejected?.role === 'impostor',
      tied,
      tally: ranked.map(([id, count]) => ({ id, name: id === 'skip' ? 'Skip' : seatOf(round, id)?.name || id, count }))
    },
    winner: checkWin(round)
  };
}

// What each client is allowed to know: roles stay hidden until the round ends.
export function publicRound(round, viewerId) {
  const viewer = seatOf(round, viewerId);
  const revealAll = round.phase === 'ended';
  return {
    hostId: round.hostId,
    seed: round.seed,
    phase: round.phase,
    meetingUntil: round.meetingUntil,
    meetingReason: round.meetingReason,
    votes: round.phase === 'voting' ? Object.keys(round.votes).length : 0,
    roster: round.roster.map(seat => ({
      id: seat.id, name: seat.name, kind: seat.kind, alive: seat.alive,
      // You know your own role, your fellow impostors, and everything at the end.
      role: revealAll || seat.id === viewerId
        || (viewer?.role === 'impostor' && seat.role === 'impostor') ? seat.role : null
    })),
    bodies: round.bodies.map(body => ({ id: body.id, name: body.name, x: body.x, z: body.z })),
    youAlive: viewer?.alive !== false,
    yourRole: viewer?.role || null,
    emergencies: viewer?.emergencies ?? 0
  };
}
