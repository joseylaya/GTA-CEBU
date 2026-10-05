export const FFA_MATCH_MS = 300000;
export const FFA_COUNTDOWN_MS = 3000;
export const FFA_RESPAWN_MS = 2000;
export const FFA_SUDDEN_DEATH_MS = 60000;
export const FFA_SPAWN_PROTECTION_MS = 1500;

// The table lives in src/ffaWeapons.js so the browser can import it too.
export { FFA_WEAPONS } from '../src/ffaWeapons.js';
import { FFA_WEAPONS } from '../src/ffaWeapons.js';
import { ffaDuration } from './_rooms.js';
import { FFA_DROP_ZONES } from '../src/map-config.js';

// --- supply drops ---------------------------------------------------------
// A crate is parachuted in from a passing aircraft at intervals. Everything
// about it is decided here so every client draws the same plane on the same
// path and agrees on who reached the crate first.
export const FFA_DROP_FIRST_MS = 40000;    // long enough that the match settles
export const FFA_DROP_INTERVAL_MS = 70000; // gap between crates
export const FFA_DROP_FALL_MS = 9000;      // flyover plus the parachute descent
export const FFA_DROP_EXPIRE_MS = 60000;   // one minute on the ground if unclaimed
export const FFA_DROP_REACH = 4.5;         // how close you must stand to claim

const freshAmmo=weapon=>({magazine:FFA_WEAPONS[weapon].magazine,reserve:FFA_WEAPONS[weapon].reserve});
// Everyone gets the whole board every time it changes, so the board is the
// hottest thing on the wire: in a ten-player firefight the full version costs
// megabytes a second. Other players only ever feed the scoreboard and the
// alive/dead check, so they travel lean; the detail is for your own seat,
// which is the only one whose ammunition, reload and loadout you can see.
const leanSeat=seat=>({id:seat.id,name:seat.name,character:seat.character,score:seat.score,deaths:seat.deaths,alive:seat.alive});
const publicSeat=seat=>({id:seat.id,name:seat.name,score:seat.score,deaths:seat.deaths,health:seat.health,alive:seat.alive,weapon:seat.weapon,primary:seat.primary,magazine:seat.ammo[seat.weapon]?.magazine||0,reserve:seat.ammo[seat.weapon]?.reserve||0,respawnAt:seat.respawnAt,protectedUntil:seat.protectedUntil,reloadingUntil:seat.reloadingUntil,online:seat.online!==false,hasDrop:Boolean(seat.ammo.bazooka)});

export function createFfaRound(room, now=Date.now()) {
  const startsAt=now+FFA_COUNTDOWN_MS;
  // The host's choice, carried on the room so late joiners share one clock.
  // Through the same gate the host's picker uses, so a restored room cannot
  // resurrect a length nobody can choose.
  const matchMs=ffaDuration(room.durationMinutes)*60000;
  return {mode:'ffa',mapId:room.mapId||'it-park',phase:'countdown',startsAt,endsAt:startsAt+matchMs,suddenDeathEndsAt:0,winnerIds:[],seenShots:[],firstBlood:false,drop:null,dropSeq:0,nextDropAt:startsAt+FFA_DROP_FIRST_MS,roster:room.members.map(member=>({id:member.id,name:member.name,character:member.character||'Henry',primary:member.loadout||'smg',weapon:member.loadout||'smg',score:0,deaths:0,health:100,alive:true,respawnAt:0,protectedUntil:startsAt+FFA_SPAWN_PROTECTION_MS,reloadingUntil:0,lastShotAt:0,online:true,ammo:{[member.loadout||'smg']:freshAmmo(member.loadout||'smg'),pistol:freshAmmo('pistol')}}))};
}

function claimFirstBlood(round){if(round.firstBlood)return false;round.firstBlood=true;return true;}
function registerKill(actor,now){
  actor.killTimes=(actor.killTimes||[]).filter(at=>now-at<=12000);actor.killTimes.push(now);
  actor.rampageKillTimes=(actor.rampageKillTimes||[]).filter(at=>now-at<=20000);actor.rampageKillTimes.push(now);
  const rampage=actor.rampageKillTimes.length>=4;
  const tripleKill=actor.killTimes.length>=3&&now-actor.killTimes.at(-3)<=12000;
  const doubleKill=!tripleKill&&actor.killTimes.length>=2&&now-actor.killTimes.at(-2)<=6000;
  if(tripleKill)actor.killTimes=[];
  return {doubleKill,tripleKill,rampage};
}

export function publicFfa(round, viewerId) {
  const me=round.roster.find(seat=>seat.id===viewerId);
  return {mode:'ffa',mapId:round.mapId||'it-park',phase:round.phase,startsAt:round.startsAt,endsAt:round.endsAt,suddenDeathEndsAt:round.suddenDeathEndsAt,winnerIds:round.winnerIds,serverTime:Date.now(),drop:round.drop||null,you:me?publicSeat(me):null,roster:round.roster.map(leanSeat)};
}

export function ffaSwitch(round, actorId, weapon) {
  const seat=round.roster.find(item=>item.id===actorId);
  if(!seat?.alive)return {error:'Weapon unavailable'};
  // A drop weapon is carryable only while its ammunition is in the seat, which
  // a death clears -- so the bazooka cannot be switched back to after dying.
  const carried=[seat.primary,'pistol','knife'];
  if(seat.ammo.bazooka)carried.push('bazooka');
  if(!carried.includes(weapon))return {error:'Weapon unavailable'};
  seat.weapon=weapon;seat.reloadingUntil=0;return {};
}

// Swap the primary mid-match, from the in-game armoury. Each weapon keeps its
// own magazine in seat.ammo, so cycling the armoury cannot be used as a free
// reload, and a short delay stops it being a no-cost mid-duel escape.
export function ffaSetPrimary(round, actorId, weapon, now=Date.now()) {
  const seat=round.roster.find(item=>item.id===actorId);
  if(!seat)return {error:'Not in this match'};
  if(weapon==='pistol'||weapon==='knife'||!FFA_WEAPONS[weapon]||FFA_WEAPONS[weapon].dropOnly)return {error:'Weapon unavailable'};
  if(!seat.alive)return {error:'Wait for respawn'};
  if(seat.primary===weapon&&seat.weapon===weapon)return {};
  if(!seat.ammo[weapon])seat.ammo[weapon]=freshAmmo(weapon);
  seat.primary=weapon;seat.weapon=weapon;seat.reloadingUntil=0;
  seat.lastShotAt=Math.max(seat.lastShotAt,now-Math.max(0,FFA_WEAPONS[weapon].cooldown-650));
  return {event:{event:'loadout',playerId:actorId,weapon}};
}

export function ffaMelee(round, actorId, targetId, positions, now=Date.now()) {
  if(!['playing','sudden-death'].includes(round.phase))return {error:'Match is not active'};
  const actor=round.roster.find(seat=>seat.id===actorId),target=round.roster.find(seat=>seat.id===targetId),a=positions[actorId],b=positions[targetId];
  if(!actor?.alive||actor.weapon!=='knife')return {error:'Knife is not equipped'};
  if(now-actor.lastShotAt<480)return {error:'Knife is not ready'};
  actor.lastShotAt=now;actor.protectedUntil=0;
  if(!target?.alive||target.online===false||target===actor||!a||!b||Math.hypot(a.x-b.x,a.z-b.z)>3.4)return {event:{event:'melee',attackerId:actorId}};
  if(now<target.protectedUntil)return {event:{event:'melee',attackerId:actorId,targetId,blocked:true}};
  target.health=Math.max(0,target.health-55);
  const event={event:'hit',shooterId:actorId,targetId,damage:55,health:target.health,headshot:false,melee:true,weapon:'knife',x:a?.x,z:a?.z};
  if(target.health===0){target.alive=false;target.deaths++;target.respawnAt=now+FFA_RESPAWN_MS;actor.score++;Object.assign(event,{event:'kill',killerId:actorId,killerName:actor.name,victimId:target.id,victimName:target.name,score:actor.score,respawnAt:target.respawnAt,melee:true,firstBlood:claimFirstBlood(round),...registerKill(actor,now)});if(round.phase==='sudden-death'&&round.winnerIds.includes(actorId)){round.phase='ended';round.winnerIds=[actorId];}}
  return {event};
}

export function ffaReload(round, actorId, now=Date.now()) {
  const seat=round.roster.find(item=>item.id===actorId),spec=FFA_WEAPONS[seat?.weapon],ammo=seat?.ammo[seat.weapon];
  if(!seat?.alive||!spec||!ammo||ammo.magazine>=spec.magazine||ammo.reserve<=0)return {error:'Cannot reload'};
  if(now<seat.reloadingUntil)return {error:'Already reloading'};
  seat.reloadingUntil=now+spec.reload;return {event:{event:'reload',playerId:actorId,until:seat.reloadingUntil}};
}

function finishReload(seat,now){
  if(!seat.reloadingUntil||now<seat.reloadingUntil)return;
  const spec=FFA_WEAPONS[seat.weapon],ammo=seat.ammo[seat.weapon],amount=Math.min(spec.magazine-ammo.magazine,ammo.reserve);
  ammo.magazine+=amount;ammo.reserve-=amount;seat.reloadingUntil=0;
}

// Bullets carry to the edge of the district; only their bite drops off.
export const FFA_MAX_RANGE=400;
// Full damage out to the weapon's range, then a linear taper to FFA_MIN_DAMAGE
// over the same distance again. Never zero: a hit always takes something.
export const FFA_MIN_DAMAGE=.18;
export function rangeFalloff(spec,distance){
  if(distance<=spec.range)return 1;
  const past=(distance-spec.range)/spec.range;
  return Math.max(FFA_MIN_DAMAGE,1-(1-FFA_MIN_DAMAGE)*Math.min(1,past));
}

// Server-side collision for The Office. These are deliberately simple boxes,
// matching the solid walls and cover authored by buildOfficeArena(). The
// server does not need render meshes; it only needs enough geometry to prevent
// a client from nominating a player through a wall.
const OFFICE_X=300;
const officeBox=(x,y,z,w,h,d)=>({minX:OFFICE_X+x-w/2,maxX:OFFICE_X+x+w/2,minY:y-h/2,maxY:y+h/2,minZ:z-d/2,maxZ:z+d/2});
const OFFICE_SHOT_SOLIDS=[
  ...[[0,2.8,-34,96,5.6,.45],[0,2.8,34,96,5.6,.45],[-48,2.8,0,.45,5.6,68],[48,2.8,0,.45,5.6,68],
    [0,2.8,-7,12,5.6,.5],[0,2.8,7,12,5.6,.5],[-6,2.8,0,.5,5.6,14],[6,2.8,0,.5,5.6,14],
    [-30,2.8,-12,7,5.6,.3],[-18,2.8,-12,7,5.6,.3],[-14,2.8,-24,.3,5.6,7],[-14,2.8,-15.5,.3,5.6,2],
    [30,2.8,-12,7,5.6,.3],[18,2.8,-12,7,5.6,.3],[14,2.8,-24,.3,5.6,7],[14,2.8,-15.5,.3,5.6,2],
    [-31,.7,12,8,1.4,1.1],[-20,.7,12,8,1.4,1.1],[-10,.7,18,1.1,1.4,9],
    [31,.7,12,8,1.4,1.1],[20,.7,12,8,1.4,1.1],[10,.7,18,1.1,1.4,9],
    [-20,.72,5,9,1.35,2.1],[24,.75,20,12,1.45,3],
    ...[[-38,-25],[-27,-25],[-38,-17],[-27,-17],[27,-25],[38,-25],[27,-17],[38,-17]].map(([x,z])=>[x,.72,z,4.4,1.35,2.1]),
    ...[[-37,21],[-23,22],[23,22],[37,21],[-37,1],[37,1]].map(([x,z])=>[x,.65,z,3.8,1.2,1.8]),
    ...[[-43,28],[-43,8],[-10,-29],[10,-29],[43,28],[43,8]].map(([x,z])=>[x,.5,z,1.4,1,1.4]),
    [-5,1,-22,2,2,4],[5,1,-22,2,2,4],[-5,1,22,2,2,4],[5,1,22,2,2,4],[-38,1,-7,2,2,7],[38,1,-7,2,2,7]
  ].map(values=>officeBox(...values))
];

function rayBoxDistance(origin,direction,box){
  let near=0,far=Infinity;
  for(const [axis,min,max] of [['x',box.minX,box.maxX],['y',box.minY,box.maxY],['z',box.minZ,box.maxZ]]){
    const speed=direction[axis],start=origin[axis];
    if(Math.abs(speed)<1e-7){if(start<min||start>max)return Infinity;continue;}
    let a=(min-start)/speed,b=(max-start)/speed;if(a>b)[a,b]=[b,a];
    near=Math.max(near,a);far=Math.min(far,b);if(near>far)return Infinity;
  }
  return far>=0?near:Infinity;
}

export function shotBlocked(mapId,origin,direction,distance){
  if(mapId!=='office')return false;
  return OFFICE_SHOT_SOLIDS.some(box=>rayBoxDistance(origin,direction,box)<distance-.2);
}

// A rocket does not need to be aimed at anybody: the server works out where it
// lands from the same origin and direction a bullet is checked against, then
// damages everyone standing near that point. The impact is never taken from the
// client -- it is either the nominated target's position, or where the ray meets
// the ground -- so a rocket cannot be made to explode wherever its owner likes.
function blastImpact(origin, dx, dy, dz, direct, positions, spec) {
  if(direct){
    const at=positions[direct.id];
    if(at)return {x:at.x,y:Number(at.y||0)+1,z:at.z};
  }
  // Ray against the ground plane, else the end of the weapon's reach.
  const reach=Math.min(spec.range*2,FFA_MAX_RANGE);
  const travel=dy<-0.0001?Math.min(reach,(origin.y-0)/-dy):reach;
  return {x:origin.x+dx*travel,y:Math.max(0,origin.y+dy*travel),z:origin.z+dz*travel};
}

function resolveBlast(round, actor, spec, impact, direct, positions, now) {
  const kills=[],hits=[];let firstBlood=false;
  for(const seat of round.roster){
    if(!seat.alive||seat.online===false||seat===actor)continue;
    const at=positions[seat.id];if(!at)continue;
    const distance=Math.hypot(at.x-impact.x,at.z-impact.z);
    const isDirect=direct&&seat===direct;
    if(!isDirect&&distance>spec.blastRadius)continue;
    // Spawn protection holds against the blast as well as against bullets.
    if(now<seat.protectedUntil)continue;
    // A direct hit is fatal outright; the blast falls away with distance but
    // never below a quarter, so being caught anywhere in it genuinely hurts.
    const damage=isDirect?spec.damage
      :Math.round(spec.blastDamage*Math.max(.25,1-distance/spec.blastRadius));
    seat.health=Math.max(0,seat.health-damage);
    hits.push({targetId:seat.id,damage,health:seat.health,direct:Boolean(isDirect)});
    if(seat.health===0){
      seat.alive=false;seat.deaths++;seat.respawnAt=now+FFA_RESPAWN_MS;actor.score++;
      const isFirst=claimFirstBlood(round),streak=registerKill(actor,now);firstBlood||=isFirst;
      kills.push({killerId:actor.id,killerName:actor.name,victimId:seat.id,victimName:seat.name,
        score:actor.score,respawnAt:seat.respawnAt,direct:Boolean(isDirect),firstBlood:isFirst,...streak});
    }
  }
  if(kills.length&&round.phase==='sudden-death'&&round.winnerIds.includes(actor.id)){
    round.phase='ended';round.winnerIds=[actor.id];
  }
  return {kills,hits,firstBlood};
}

export function ffaShot(round, actorId, payload, positions, now=Date.now()) {
  if(!['playing','sudden-death'].includes(round.phase))return {error:'Match is not active'};
  const actor=round.roster.find(seat=>seat.id===actorId),target=round.roster.find(seat=>seat.id===payload.targetId);
  if(!actor?.alive)return {error:'Invalid shooter'};
  finishReload(actor,now);
  const shotId=typeof payload.shotId==='string'?payload.shotId.slice(0,64):'';
  if(!shotId||round.seenShots.includes(`${actorId}:${shotId}`))return {error:'Duplicate shot'};
  round.seenShots.push(`${actorId}:${shotId}`);if(round.seenShots.length>256)round.seenShots.splice(0,64);
  if(payload.weapon!==actor.weapon)return {error:'Wrong weapon'};
  const spec=FFA_WEAPONS[actor.weapon],ammo=actor.ammo[actor.weapon];
  if(actor.reloadingUntil||now-actor.lastShotAt<spec.cooldown)return {error:'Weapon is not ready'};
  if(ammo.magazine<=0)return {error:'Out of ammunition'};
  const a=positions[actorId],origin=payload.origin,direction=payload.direction;
  if(!a||!origin||!direction||![origin.x,origin.y,origin.z,direction.x,direction.y,direction.z].every(Number.isFinite))return {error:'Malformed shot'};
  if(Math.hypot(origin.x-a.x,origin.z-a.z)>3||Math.abs(origin.y-(Number(a.y||0)+2.65))>3)return {error:'Shot origin rejected'};
  const length=Math.hypot(direction.x,direction.y,direction.z);if(length<.9||length>1.1)return {error:'Shot direction rejected'};
  ammo.magazine--;actor.lastShotAt=now;actor.protectedUntil=0;
  if(spec.rocket){
    const dx=direction.x/length,dy=direction.y/length,dz=direction.z/length;
    // Only count the nominated target as a direct hit if the ray really reaches
    // it, using the same corridor test a bullet gets.
    let direct=null;
    if(target&&target.alive&&target.online!==false&&target!==actor){
      const b=positions[target.id];
      const horizontal=dx*dx+dz*dz;
      if(b&&horizontal>.0001){
        const along=((b.x-origin.x)*dx+(b.z-origin.z)*dz)/horizontal;
        const miss=Math.hypot(b.x-origin.x-dx*along,b.z-origin.z-dz*along);
        const impactY=origin.y+dy*along-Number(b.y||0);
        if(along>=0&&along<=spec.range*2&&miss<=1.6&&impactY>=-.4&&impactY<=3.6)direct=target;
      }
    }
    const impact=blastImpact(origin,dx,dy,dz,direct,positions,spec);
    const {kills,hits,firstBlood}=resolveBlast(round,actor,spec,impact,direct,positions,now);
    return {event:{event:'blast',shooterId:actorId,shooterName:actor.name,weapon:actor.weapon,
      x:a.x,z:a.z,impact,radius:spec.blastRadius,kills,hits,firstBlood,doubleKill:kills.some(kill=>kill.doubleKill),tripleKill:kills.some(kill=>kill.tripleKill),rampage:kills.some(kill=>kill.rampage)}};
  }
  if(!target)return {event:{event:'shot',shooterId:actorId,weapon:actor.weapon,x:a.x,z:a.z}};
  if(!target.alive||target.online===false||actor===target)return {event:{event:'shot',shooterId:actorId,weapon:actor.weapon,x:a.x,z:a.z}};
  const b=positions[target.id];if(!b)return {event:{event:'shot',shooterId:actorId,weapon:actor.weapon,x:a.x,z:a.z}};
  const dx=direction.x/length,dy=direction.y/length,dz=direction.z/length,tx=b.x-origin.x,tz=b.z-origin.z,horizontal=dx*dx+dz*dz;
  if(horizontal<.0001)return {event:{event:'shot',shooterId:actorId,weapon:actor.weapon,x:a.x,z:a.z}};
  const along=(tx*dx+tz*dz)/horizontal;
  if(along<0||along>FFA_MAX_RANGE)return {event:{event:'shot',shooterId:actorId,weapon:actor.weapon,x:a.x,z:a.z}};
  if(shotBlocked(round.mapId,origin,{x:dx,y:dy,z:dz},along))return {event:{event:'shot',shooterId:actorId,weapon:actor.weapon,x:a.x,z:a.z,blocked:true}};
  const horizontalMiss=Math.hypot(tx-dx*along,tz-dz*along),impactY=origin.y+dy*along-Number(b.y||0);
  if(horizontalMiss>1.05||impactY<.15||impactY>3.35)return {event:{event:'shot',shooterId:actorId,weapon:actor.weapon,x:a.x,z:a.z}};
  if(now<target.protectedUntil)return {event:{event:'shot',shooterId:actorId,weapon:actor.weapon,x:a.x,z:a.z,targetId:target.id,blocked:true}};
  const headshot=impactY>2.25;
  // Range is where damage starts falling away, not a wall the bullet stops at.
  // Past it a body shot tapers to a graze, so a long shot still counts for
  // something; a headshot is exempt, so precision stays rewarded at any range.
  const damage=headshot?spec.head:Math.round(spec.damage*rangeFalloff(spec,along));
  target.health=Math.max(0,target.health-damage);
  const event={event:'hit',shooterId:actorId,targetId:target.id,damage,health:target.health,headshot,weapon:actor.weapon,x:a.x,z:a.z};
  if(target.health===0){
    target.alive=false;target.deaths++;target.respawnAt=now+FFA_RESPAWN_MS;actor.score++;
    Object.assign(event,{event:'kill',killerId:actorId,killerName:actor.name,victimId:target.id,victimName:target.name,score:actor.score,respawnAt:target.respawnAt,firstBlood:claimFirstBlood(round),...registerKill(actor,now)});
    if(round.phase==='sudden-death'&&round.winnerIds.includes(actorId)){round.phase='ended';round.winnerIds=[actorId];}
  }
  return {event};
}

// A seat whose player has dropped is kept so they can reconnect into the same
// round -- but it must not stay standing in the arena. Left alive it freezes
// where its owner dropped, and since the server respawns it after every death
// it becomes an unmoving target that can be farmed for kills: the clone players
// were shooting at the spot where someone died.
// Drop a newcomer straight into a running match. They get a full clip, spawn
// protection and a clean scoreline; everyone else is untouched.
export function ffaJoinRound(round, member, now=Date.now()) {
  if(!round||round.phase==='ended')return {error:'Match has finished'};
  const existing=round.roster.find(seat=>seat.id===member.id);
  if(existing){
    // A returning player reclaims their seat rather than getting a second one.
    existing.online=true;existing.alive=true;existing.health=100;existing.respawnAt=0;
    existing.protectedUntil=now+FFA_SPAWN_PROTECTION_MS;
    return {event:{event:'respawn',playerId:member.id,protectedUntil:existing.protectedUntil}};
  }
  const weapon=member.loadout||'smg';
  round.roster.push({id:member.id,name:member.name,character:member.character||'Henry',primary:weapon,weapon,
    score:0,deaths:0,health:100,alive:true,respawnAt:0,
    protectedUntil:now+FFA_SPAWN_PROTECTION_MS,reloadingUntil:0,lastShotAt:0,online:true,
    ammo:{[weapon]:freshAmmo(weapon),pistol:freshAmmo('pistol')}});
  return {event:{event:'joined',playerId:member.id,name:member.name}};
}

export function ffaSetOnline(round, playerId, online, now=Date.now()) {
  const seat=round.roster.find(item=>item.id===playerId);
  if(!seat)return null;
  seat.online=online;
  if(!online){
    seat.alive=false;seat.respawnAt=0;seat.health=0;
    return {event:'left',playerId};
  }
  seat.alive=true;seat.health=100;seat.respawnAt=0;
  seat.protectedUntil=now+FFA_SPAWN_PROTECTION_MS;
  return {event:'respawn',playerId,protectedUntil:seat.protectedUntil};
}

// Schedule the next crate. The aircraft's heading is decided here too, so
// every client flies the same plane along the same line to the same point.
function openDrop(round, now) {
  const officeZones=[{x:300,z:-13},{x:281,z:4},{x:319,z:4},{x:300,z:16}];
  const zones=round.mapId==='office'?officeZones:FFA_DROP_ZONES;
  const zone=zones[Math.floor(Math.random()*zones.length)]||{x:0,z:0};
  round.dropSeq=(round.dropSeq||0)+1;
  return {
    id:`drop-${round.dropSeq}`,
    x:zone.x, z:zone.z,
    heading:Math.random()*Math.PI*2,
    state:'incoming',
    dropAt:now,
    landAt:now+FFA_DROP_FALL_MS,
    expireAt:now+FFA_DROP_FALL_MS+FFA_DROP_EXPIRE_MS,
    claimedBy:null, claimedName:null
  };
}

// Reaching the crate is the whole contest, so the only checks are: the match is
// live, you are alive, the crate has actually landed, and you are standing next
// to it. First request in wins -- the crate is cleared before the second lands.
// Snapshot fan-out is the most expensive thing in a firefight: one full board
// per player per action. Events are small and go out every time; the board that
// follows them is paced. Shots, hits and knife swings are the hot ones -- and
// between paced boards the only people whose numbers actually moved are the
// shooter and whoever they hit, so those two still get one immediately.
const FFA_SNAPSHOT_MS=150;
const FFA_HOT_EVENTS=new Set(['shot','hit','melee']);
export function ffaSnapshotPlan(round, event, now=Date.now()) {
  if(!round)return {all:true,only:null};
  if(!event||!FFA_HOT_EVENTS.has(event.event)){round.snapAt=now;return {all:true,only:null};}
  if(now-(round.snapAt||0)>=FFA_SNAPSHOT_MS){round.snapAt=now;return {all:true,only:null};}
  const only=new Set();
  for(const id of [event.shooterId,event.attackerId,event.targetId,event.playerId])if(id)only.add(id);
  return {all:false,only};
}

export function ffaClaimDrop(round, actorId, positions, now=Date.now()) {
  if(!['playing','sudden-death'].includes(round.phase))return {error:'Match is not active'};
  const drop=round.drop;
  if(!drop||drop.state!=='landed')return {error:'No crate to take'};
  const seat=round.roster.find(item=>item.id===actorId);
  if(!seat?.alive||seat.online===false)return {error:'Cannot take that'};
  const at=positions[actorId];
  if(!at||Math.hypot(at.x-drop.x,at.z-drop.z)>FFA_DROP_REACH)return {error:'Too far from the crate'};
  seat.ammo.bazooka=freshAmmo('bazooka');
  seat.weapon='bazooka';seat.reloadingUntil=0;
  round.drop=null;round.nextDropAt=now+FFA_DROP_INTERVAL_MS;
  return {event:{event:'drop-claimed',playerId:actorId,name:seat.name,dropId:drop.id,x:drop.x,z:drop.z}};
}

export function advanceFfa(round, now=Date.now()) {
  const events=[];
  if(round.phase==='countdown'&&now>=round.startsAt)round.phase='playing';
  for(const seat of round.roster){
    finishReload(seat,now);
    if(!seat.alive&&seat.respawnAt&&now>=seat.respawnAt&&seat.online!==false){seat.alive=true;seat.health=100;seat.respawnAt=0;seat.weapon=seat.primary;seat.ammo={[seat.primary]:freshAmmo(seat.primary),pistol:freshAmmo('pistol')};seat.protectedUntil=now+FFA_SPAWN_PROTECTION_MS;events.push({event:'respawn',playerId:seat.id,protectedUntil:seat.protectedUntil});}
  }
  // Supply drops only run while there is a match to fight over.
  if(['playing','sudden-death'].includes(round.phase)){
    if(!round.drop&&round.nextDropAt&&now>=round.nextDropAt){
      round.drop=openDrop(round,now);round.nextDropAt=0;
      events.push({event:'drop-incoming',drop:round.drop});
    }
    else if(round.drop&&round.drop.state==='incoming'&&now>=round.drop.landAt){
      round.drop.state='landed';
      events.push({event:'drop-landed',drop:round.drop});
    }
    else if(round.drop&&round.drop.state==='landed'&&now>=round.drop.expireAt){
      const gone=round.drop.id;round.drop=null;round.nextDropAt=now+FFA_DROP_INTERVAL_MS;
      events.push({event:'drop-gone',dropId:gone});
    }
  }
  else if(round.drop){round.drop=null;}
  if(round.phase==='playing'&&now>=round.endsAt){
    const top=Math.max(0,...round.roster.map(seat=>seat.score));round.winnerIds=round.roster.filter(seat=>seat.score===top).map(seat=>seat.id);
    if(round.winnerIds.length>1){round.phase='sudden-death';round.suddenDeathEndsAt=now+FFA_SUDDEN_DEATH_MS;}
    else round.phase='ended';
  }
  if(round.phase==='sudden-death'&&now>=round.suddenDeathEndsAt)round.phase='ended';
  return events;
}
