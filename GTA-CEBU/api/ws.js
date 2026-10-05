import { WORLD, SPAWN } from '../src/map-config.js';
import http from 'node:http';
import { randomUUID, randomBytes } from 'node:crypto';
import Redis from 'ioredis';
import { WebSocket, WebSocketServer } from 'ws';
import { EMOTES, normalizeAppearance } from '../src/appearance.js';
import { sanitizeRoomName, clampNpcCount, publicRoom, roomSummary, startBlocker, assignRoles, roomMode, ffaLoadout, ffaDuration, ffaMap, joinableRoom, listableRoom, ROOM_MAX_PLAYERS } from './_rooms.js';
import { createRound, applyKill, openMeeting, castVote, advanceMeeting, resolveVote, publicRound } from './_rounds.js';
import {createFfaRound,publicFfa,ffaShot,ffaMelee,ffaReload,ffaSwitch,advanceFfa,ffaSetPrimary,ffaSetOnline,ffaJoinRound,ffaClaimDrop,ffaSnapshotPlan,FFA_WEAPONS} from './_ffa.js';

// Aim pitch is a look direction, not a position: clamp it and never trust it raw.
const cleanPitch=value=>Number.isFinite(Number(value))?Math.max(-1.4,Math.min(1.4,Number(value))):0;


// Same derivation as the other backends: never hand-list the weapons.
const WEAPONS=new Set(['fists','hands','knife',...Object.keys(FFA_WEAPONS)]);

const CHANNEL='district-zero:events';
const PRESENCE='district-zero:presence';
const PLAYER_KEY=id=>`district-zero:player:${id}`;
// Proves a reconnecting socket is the same player, so a dropped connection
// resumes its identity instead of arriving as a stranger.
const SECRET_KEY=id=>`district-zero:secret:${id}`;
const SECRET_TTL=300;
// Which socket currently owns a player. Held in Redis rather than memory
// because a reconnecting client may be served by a different function instance.
const OWNER_KEY=id=>`district-zero:owner:${id}`;
// Retire a player only if this socket still owns them, atomically, so a socket
// dying after its replacement connected cannot evict the live one.
const RETIRE_SCRIPT=`
if redis.call('GET', KEYS[1]) == ARGV[1] then
  redis.call('DEL', KEYS[1], KEYS[2], KEYS[3])
  redis.call('ZREM', KEYS[4], ARGV[2])
  return 1
end
return 0`;
const MAX_PLAYERS=32;
// One Redis channel per player, so a voice signal reaches only its recipient
// even when the two players are served by different function instances.
const VOICE_PREFIX='district-zero:voice:';
const VOICE_CHANNEL=id=>`${VOICE_PREFIX}${id}`;
const VOICE_SIGNALS=new Set(['voice:offer','voice:answer','voice:ice-candidate','voice:ready','voice:unavailable']);
const VOICE_SIGNAL_LIMIT=90;
const EFFECT_KINDS=new Set(['blood']);
const EFFECT_LIMIT=14;
const voiceSockets=new Map();
// Lobbies live in Redis so they survive a player's socket being recycled and
// are visible from whichever function instance serves the next request.
const ROOM_KEY=id=>`district-zero:room:${id}`;
const ROOM_INDEX='district-zero:rooms';
const ROOM_TTL=1800;
const ROOM_VERSION_KEY=id=>`district-zero:roomv:${id}`;
// Which room a player belongs to, so a reconnecting socket can pick their seat
// back up. Sockets are recycled roughly every 45s, and without this the player
// would rejoin the district having silently left their lobby.
const PLAYER_ROOM_KEY=id=>`district-zero:playerroom:${id}`;
// Write the room only if nobody else has written it since we read it. Without
// this, two members acting at the same moment each save their own stale copy
// and one of the changes is silently lost -- a ready tick, or an NPC count.
const ROOM_CAS=`
local current = redis.call('GET', KEYS[2])
-- A room being created has no version key yet, and GET returns false for it,
-- which never equals a string. Treat "absent" as version zero.
if current == false then current = '0' end
if current == ARGV[2] then
  redis.call('SET', KEYS[1], ARGV[1], 'EX', ARGV[3])
  redis.call('INCR', KEYS[2])
  redis.call('EXPIRE', KEYS[2], ARGV[3])
  return 1
end
return 0`;
async function loadRoom(id){
  if(!id)return null;
  const [raw,version]=await redis.mget(ROOM_KEY(id),ROOM_VERSION_KEY(id));
  if(!raw)return null;
  const room=JSON.parse(raw);
  room.__version=version||'0';
  return room;
}
async function saveRoom(room){
  const version=room.__version??'0';
  const body={...room};delete body.__version;
  const stored=await redis.eval(ROOM_CAS,2,ROOM_KEY(room.id),ROOM_VERSION_KEY(room.id),
    JSON.stringify(body),String(version),String(ROOM_TTL));
  if(Number(stored)!==1)return false;
  room.__version=String(Number(version)+1);
  await redis.zadd(ROOM_INDEX,Date.now(),room.id);
  return true;
}
// Load, change, and store a room atomically, retrying if someone beat us to it.
async function mutateRoom(id,mutate){
  for(let attempt=0;attempt<6;attempt++){
    const room=await loadRoom(id);
    if(!room)return {room:null,result:null};
    const result=await mutate(room);
    if(result&&result.abort)return {room,result};
    if(await saveRoom(room))return {room,result};
  }
  return {room:null,result:{abort:true,message:'The room is busy, try again'}};
}
async function deleteRoom(id){
  await redis.pipeline().del(ROOM_KEY(id)).zrem(ROOM_INDEX,id).exec();
}
async function listRooms(){
  await redis.zremrangebyscore(ROOM_INDEX,0,Date.now()-ROOM_TTL*1000);
  const ids=await redis.zrange(ROOM_INDEX,0,40);
  if(!ids.length)return [];
  const raw=await redis.mget(...ids.map(ROOM_KEY));
  return raw.filter(Boolean).map(value=>JSON.parse(value)).filter(listableRoom).map(roomSummary);
}
// Room traffic rides the existing broadcast channel; clients keep only what
// concerns them, which avoids a second subscription per lobby.
async function publishRoom(room){await publish('room',publicRoom(room));}
async function publishRoomList(){await publish('rooms',await listRooms());}
// Round snapshots differ per player, because each sees only their own role, so
// they go down the per-player channel rather than the shared broadcast.
async function publishToPlayer(id,type,data){
  await redis.publish(VOICE_CHANNEL(id),JSON.stringify({type,data}));
}
async function emitRound(room,event=null){
  await Promise.all(room.members.map(async member=>{
    if(event)await publishToPlayer(member.id,'round-event',event);
    await publishToPlayer(member.id,'round',publicRound(room.round,member.id));
  }));
}
async function emitFfa(room,event=null){const plan=ffaSnapshotPlan(room.round,event);await Promise.all((room.round?.roster||[]).map(async member=>{if(event)await publishToPlayer(member.id,'ffa-event',event);if(plan.all||plan.only?.has(member.id))await publishToPlayer(member.id,'ffa',publicFfa(room.round,member.id));}));}
async function positionsOf(room){
  if(!room.members.length)return {};
  const raw=await redis.mget(...room.members.map(member=>PLAYER_KEY(member.id)));
  const map={};
  room.members.forEach((member,index)=>{
    if(!raw[index])return;
    const state=JSON.parse(raw[index]);map[member.id]={x:state.x,y:state.y||0,z:state.z};
  });
  return map;
}
async function finishRound(room,winner){
  const {room:saved}=await mutateRoom(room.id,candidate=>{
    if(candidate.round)candidate.round.phase='ended';
    candidate.phase='lobby';
    for(const member of candidate.members)member.ready=member.id===candidate.hostId;
    return null;
  });
  await emitRound(saved||room,{event:'ended',winner});
  await publishRoomList();
}
async function dropFromRoom(peerId,roomId){
  await redis.del(PLAYER_ROOM_KEY(peerId));
  let emptied=false;
  const {room}=await mutateRoom(roomId,candidate=>{
    // Retire their seat too: members and roster are separate lists, so removing
    // the member alone left a live unattended body standing in the arena.
    if(candidate.mode==='ffa'&&candidate.round&&candidate.round.phase!=='ended')ffaSetOnline(candidate.round,peerId,false);
    candidate.members=candidate.members.filter(member=>member.id!==peerId);
    if(!candidate.members.length){emptied=true;return null;}
    // The room outlives its creator: hand it to whoever is next in.
    if(candidate.hostId===peerId)candidate.hostId=candidate.members[0].id;
    candidate.npcCount=clampNpcCount(candidate.npcCount,candidate.members.length);
    return null;
  });
  if(!room)return;
  if(emptied){await deleteRoom(room.id);await publishRoomList();return;}
  await publishRoom(room);await publishRoomList();
}
const PIRATE_CHARACTERS=new Set(['Henry','Anne','Mako','Captain_Barbarossa','Sharky']);
// AWS ElastiCache/MemoryDB should normally be supplied as a private redis:// or
// rediss:// URL to the long-running Node service. REDIS_URL remains supported
// for the Vercel adapter during migration.
const redisUrl=process.env.AWS_REDIS_URL||process.env.REDIS_URL;
const redis=redisUrl?new Redis(redisUrl,{maxRetriesPerRequest:2,enableReadyCheck:true,retryStrategy:times=>Math.min(times*200,3000)}):null;
redis?.on('error',error=>console.error('Redis connection error',error.message));
const subscriber=redis?.duplicate({maxRetriesPerRequest:null});
const sockets=new Set();
const subscriptionReady=subscriber?.subscribe(CHANNEL);

subscriber?.on('message',(channel,message)=>{
  if(channel===CHANNEL){
    for(const socket of sockets)if(socket.readyState===WebSocket.OPEN)socket.send(message);
    return;
  }
  if(!channel.startsWith(VOICE_PREFIX))return;
  const socket=voiceSockets.get(channel.slice(VOICE_PREFIX.length));
  if(socket?.readyState===WebSocket.OPEN)socket.send(message);
});

const server=http.createServer((request,response)=>{
  if(request.url==='/health'||request.url==='/api/health'){
    const ready=redis?.status==='ready';
    response.writeHead(ready?200:503,{'Content-Type':'application/json','Cache-Control':'no-store'});
    response.end(JSON.stringify({online:ready,redis:redis?.status||'not-configured'}));return;
  }
  response.writeHead(redis?426:503,{'Content-Type':'application/json'});
  response.end(JSON.stringify({error:redis?'WebSocket upgrade required':'Multiplayer storage is not configured'}));
});
const wss=new WebSocketServer({server,maxPayload:16384});

function publicPeer(peer){
  const activeMood=peer.moodUntil>Date.now();
  return {id:peer.id,name:peer.name,x:peer.x,z:peer.z,y:peer.y,h:peer.h,inCar:peer.inCar,flight:peer.flight,ghost:peer.ghost===true,character:peer.character,appearance:peer.appearance,animation:peer.animation,weapon:peer.weapon,pitch:peer.pitch||0,aiming:peer.aiming,attacking:peer.attacking,attackArm:peer.attackArm,mood:activeMood?peer.mood:null,moodUntil:activeMood?peer.moodUntil:0};
}
function send(socket,type,data){if(socket.readyState===WebSocket.OPEN)socket.send(JSON.stringify({type,data}));}
async function publish(type,data){await redis.publish(CHANNEL,JSON.stringify({type,data}));}
// Presence only has to survive a 30s key expiry, so writing on every state
// update was roughly 12 Redis round trips per player per second for no benefit.
// Publishing still happens every update; only the durable write is paced.
const PERSIST_INTERVAL=2000;
async function persist(peer,{force=false}={}){
  const now=Date.now();
  if(!force&&peer.lastPersist&&now-peer.lastPersist<PERSIST_INTERVAL)return;
  peer.lastPersist=now;
  const commands=redis.pipeline().set(PLAYER_KEY(peer.id),JSON.stringify(publicPeer(peer)),'EX',30);
  if(peer.secret)commands.set(SECRET_KEY(peer.id),peer.secret,'EX',SECRET_TTL);
  if(peer.connectionId)commands.set(OWNER_KEY(peer.id),peer.connectionId,'EX',SECRET_TTL);
  if(!peer.lastPresence||now-peer.lastPresence>=10000){commands.zadd(PRESENCE,now,peer.id);peer.lastPresence=now;}
  await commands.exec();
}
async function snapshot(exceptId){
  await redis.zremrangebyscore(PRESENCE,0,Date.now()-30000);
  const ids=(await redis.zrange(PRESENCE,0,MAX_PLAYERS-1)).filter(id=>id!==exceptId);
  if(!ids.length)return [];
  return (await redis.mget(...ids.map(PLAYER_KEY))).filter(Boolean).map(value=>JSON.parse(value));
}
function validName(value){return typeof value==='string'?value.replace(/[\u0000-\u001f\u007f]/g,'').trim().slice(0,20)||'Player':'Player';}
function validPosition(value){return Number.isFinite(value.x)&&Number.isFinite(value.z)&&Number.isFinite(value.y)&&Number.isFinite(value.h)&&Math.abs(value.x)<=WORLD.halfX&&Math.abs(value.z)<=WORLD.halfZ&&value.y>=0&&value.y<=110;}

wss.on('connection',(socket,request)=>{
  const origin=request.headers.origin;
  let originAllowed=true;
  try{
    if(origin){
      const allowed=new Set((process.env.ALLOWED_ORIGINS||'').split(',').map(value=>value.trim()).filter(Boolean));
      originAllowed=new URL(origin).host===request.headers.host||allowed.has(new URL(origin).origin);
    }
  }catch{originAllowed=false;}
  if(!redis||!originAllowed){socket.close(1008,'Unavailable');return;}
  sockets.add(socket);
  let peer=null,closed=false,joining=false,stateBusy=false;
  socket.on('message',async raw=>{
    if(closed)return;
    let event;
    try{event=JSON.parse(raw.toString());}catch{return;}
    if(!event||typeof event!=='object')return;
    if(event.type==='state'){if(stateBusy)return;stateBusy=true;}
    try{
      if(event.type==='join'){
        if(peer||joining)return;joining=true;
        await subscriptionReady;
        // A serverless function is killed on a timer, so clients reconnect
        // routinely. Honour a valid resume ticket rather than minting a new
        // identity, which would make the player flicker for everyone else.
        let resumeId=null,secret=null;
        const claimedId=typeof event.id==='string'&&/^[0-9a-f-]{36}$/i.test(event.id)?event.id:null;
        const claimedToken=typeof event.token==='string'&&/^[0-9a-f]{16,64}$/i.test(event.token)?event.token:null;
        if(claimedId&&claimedToken){
          const stored=await redis.get(SECRET_KEY(claimedId));
          if(stored&&stored===claimedToken){resumeId=claimedId;secret=claimedToken;}
        }
        const existing=await snapshot(resumeId);
        if(!resumeId&&existing.length>=MAX_PLAYERS){send(socket,'error',{message:'District is full'});socket.close(1013,'District full');return;}
        if(!secret)secret=randomBytes(24).toString('hex');
        // Claiming ownership here is what makes the handover safe: the socket
        // being replaced will find the owner changed and leave the player alone.
        peer={id:resumeId||randomUUID(),secret,connectionId:randomBytes(12).toString('hex'),name:validName(event.name),appearance:normalizeAppearance(event.appearance),character:PIRATE_CHARACTERS.has(event.character)?event.character:'Henry',animation:'Idle',weapon:'pistol',aiming:false,attacking:false,attackArm:0,x:SPAWN.x,z:SPAWN.z,y:0,h:0,inCar:false,flight:null,mood:null,moodUntil:0,lastState:0,lastChat:0,lastMood:0,voiceWindow:0,voiceCount:0,effectWindow:0,effectCount:0,roomId:null};
        await persist(peer,{force:true});
        voiceSockets.set(peer.id,socket);
        // A resumed player is very likely still sitting in a lobby.
        if(resumeId)peer.roomId=await redis.get(PLAYER_ROOM_KEY(peer.id));
        await subscriber.subscribe(VOICE_CHANNEL(peer.id));
        send(socket,'welcome',{id:peer.id,token:peer.secret,players:existing,resumed:Boolean(resumeId)});
        // A resuming player never left as far as anyone else is concerned.
        if(!resumeId)await publish('joined',publicPeer(peer));
        return;
      }
      if(!peer)return;
      const now=Date.now();
      if(event.type==='state'){
        if(now-peer.lastState<55||!validPosition(event))return;
        peer.x=event.x;peer.z=event.z;peer.y=event.y;peer.h=event.h;peer.inCar=event.inCar===true;peer.ghost=event.ghost===true;peer.flight=['jetpack','jet','helicopter'].includes(event.flight)?event.flight:null;if(event.appearance)peer.appearance=normalizeAppearance(event.appearance);peer.animation=['Idle','Walk','Run','Jump','Punch'].includes(event.animation)?event.animation:'Idle';peer.weapon=WEAPONS.has(event.weapon)?event.weapon:'hands';peer.pitch=cleanPitch(event.pitch);peer.aiming=event.aiming===true;peer.attacking=event.attacking===true;peer.attackArm=event.attackArm===1?1:0;peer.lastState=now;
        await persist(peer);await publish('state',publicPeer(peer));return;
      }
      if(event.type==='heartbeat'){
        if(now-peer.lastState<8000)return;
        peer.lastState=now;
        await persist(peer,{force:true});return;
      }
      if(event.type==='mood'){
        if(!Object.hasOwn(EMOTES,event.mood)||now-peer.lastMood<500)return;
        peer.mood=event.mood;peer.moodUntil=now+8000;peer.lastMood=now;
        await persist(peer);await publish('state',publicPeer(peer));return;
      }
      if(event.type==='rooms'){
        let rooms=await listRooms();
        if(peer.roomId){
          const room=await loadRoom(peer.roomId);if(room)send(socket,'room',publicRoom(room));
        }
        send(socket,'rooms',rooms);return;
      }
      if(event.type==='room'){
        const action=event.action;
        if(action==='create'){
          if(peer.roomId)await dropFromRoom(peer.id,peer.roomId);
          const mode=roomMode(event.mode),room={id:randomUUID().slice(0,8),name:sanitizeRoomName(event.name,`${peer.name}'s ${mode==='ffa'?'arena':'crew'}`),mode,
            hostId:peer.id,phase:'lobby',npcCount:0,
            members:[{id:peer.id,name:peer.name,ready:true,character:peer.character,loadout:ffaLoadout(event.loadout)}],
            durationMinutes:ffaDuration(event.minutes),mapId:ffaMap(event.mapId),createdAt:Date.now()};
          room.npcCount=mode==='ffa'?0:clampNpcCount(event.npcCount,1);
          peer.roomId=room.id;
          await redis.set(PLAYER_ROOM_KEY(peer.id),room.id,'EX',ROOM_TTL);
          room.__version='0';
          if(!await saveRoom(room)){send(socket,'error',{message:'Could not create the room, try again'});return;}
          // Confirm directly to the creator. Pub/sub still informs other
          // instances, but the local UI must not depend on that round trip.
          send(socket,'room',publicRoom(room));
          await publishRoom(room);await publishRoomList();return;
        }
        if(action==='join'){
          if(peer.roomId&&peer.roomId!==event.roomId)await dropFromRoom(peer.id,peer.roomId);
          const {room,result}=await mutateRoom(event.roomId,candidate=>{
            if(candidate.members.length+candidate.npcCount>=ROOM_MAX_PLAYERS&&!candidate.members.some(m=>m.id===peer.id))
              return {abort:true,message:'Room is full'};
            // A Free-for-All in progress still takes players while it has a
            // seat; every other mode closes its door at the start whistle.
            if(candidate.phase!=='lobby'&&!joinableRoom(candidate))return {abort:true,message:'That round already started'};
            const member=candidate.members.find(entry=>entry.id===peer.id);
            if(event.mode&&candidate.mode!==roomMode(event.mode))return {abort:true,message:'That room uses a different mode'};
            if(!member)candidate.members.push({id:peer.id,name:peer.name,ready:false,character:peer.character,loadout:ffaLoadout(event.loadout)});
            else{member.name=peer.name;member.character=peer.character;}
            candidate.npcCount=candidate.mode==='ffa'?0:clampNpcCount(candidate.npcCount,candidate.members.length);
            return null;
          });
          if(!room){send(socket,'error',{message:'That room is gone'});return;}
          if(result?.abort){send(socket,'error',{message:result.message});return;}
          peer.roomId=room.id;
          await redis.set(PLAYER_ROOM_KEY(peer.id),room.id,'EX',ROOM_TTL);
          send(socket,'room',publicRoom(room));
          await publishRoom(room);await publishRoomList();return;
        }
        if(action==='leave'){
          if(peer.roomId)await dropFromRoom(peer.id,peer.roomId);
          peer.roomId=null;return;
        }
        if(action==='ready'){
          let joinedLive=null;
          const {room}=await mutateRoom(peer.roomId,candidate=>{
            const member=candidate.members.find(entry=>entry.id===peer.id);
            if(member){
              member.ready=event.ready===true;
              const alreadyPlaying=candidate.round?.roster?.some(seat=>seat.id===peer.id);
              if(member.ready&&candidate.mode==='ffa'&&candidate.round&&candidate.round.phase!=='ended'&&!alreadyPlaying)
                joinedLive=ffaJoinRound(candidate.round,member);
            }
            return null;
          });
          if(room){
            await publishRoom(room);
            if(joinedLive){
              send(socket,'room-start',{roomId:room.id,mode:'ffa',mapId:room.round.mapId||'it-park',hostId:room.hostId,startsAt:room.round.startsAt,
                roster:room.round.roster.map(entry=>({id:entry.id,name:entry.name})),resumed:true});
              send(socket,'ffa',publicFfa(room.round,peer.id));
              await emitFfa(room,joinedLive.event||null);
              await publishRoomList();
            }
          }
          return;
        }
        if(action==='character'){
          if(!PIRATE_CHARACTERS.has(event.character)){send(socket,'error',{message:'Unknown pirate'});return;}
          const activeRoom=await loadRoom(peer.roomId);
          if(activeRoom?.mode==='ffa'&&activeRoom.round&&activeRoom.round.phase!=='ended'&&activeRoom.round.roster?.some(seat=>seat.id===peer.id)){send(socket,'error',{message:'Character is locked during the match'});return;}
          peer.character=event.character;
          const {room}=await mutateRoom(peer.roomId,candidate=>{
            const member=candidate.members.find(entry=>entry.id===peer.id);
            if(member){member.character=event.character;member.ready=member.id===candidate.hostId;}
            return null;
          });
          await persist(peer);
          if(room)await publishRoom(room);
          return;
        }
        if(action==='loadout'){
          const {room}=await mutateRoom(peer.roomId,candidate=>{if(candidate.mode!=='ffa')return {abort:true};const member=candidate.members.find(entry=>entry.id===peer.id);if(member){member.loadout=ffaLoadout(event.loadout);member.ready=member.id===candidate.hostId;}return null;});
          if(room)await publishRoom(room);return;
        }
        if(action==='duration'){
          const {room}=await mutateRoom(peer.roomId,candidate=>{
            if(candidate.hostId!==peer.id||candidate.mode!=='ffa')return {abort:true};
            candidate.durationMinutes=ffaDuration(event.minutes);
            return null;
          });
          if(room){await publishRoom(room);await publishRoomList();}
          return;
        }
        if(action==='map'){
          const {room}=await mutateRoom(peer.roomId,candidate=>{
            if(candidate.hostId!==peer.id||candidate.mode!=='ffa'||candidate.phase!=='lobby')return {abort:true};
            candidate.mapId=ffaMap(event.mapId);return null;
          });
          if(room){await publishRoom(room);await publishRoomList();}return;
        }
        if(action==='kick'){
          // Host only, never themselves. Works in the lobby and mid-match.
          const target=String(event.target||'');
          const current=peer.roomId?await loadRoom(peer.roomId):null;
          if(!current||current.hostId!==peer.id||!target||target===peer.id)return;
          if(!current.members.some(entry=>entry.id===target))return;
          await publishToPlayer(target,'kicked',{room:current.id});
          await dropFromRoom(target,current.id);
          return;
        }
        if(action==='npc'){
          const {room}=await mutateRoom(peer.roomId,candidate=>{
            if(candidate.hostId!==peer.id)return {abort:true};
            candidate.npcCount=clampNpcCount(event.npcCount,candidate.members.length);
            return null;
          });
          if(room)  {await publishRoom(room);await publishRoomList();}
          return;
        }
        if(action==='start'){
          let setup=null;
          const {room,result}=await mutateRoom(peer.roomId,candidate=>{
            if(candidate.hostId!==peer.id)return {abort:true};
            const blocker=startBlocker(candidate);
            if(blocker)return {abort:true,message:blocker};
            candidate.phase='playing';
            if(candidate.mode==='ffa'){candidate.round=createFfaRound(candidate);return null;}
            setup=assignRoles(candidate);
            candidate.round=createRound(candidate,setup);
            return null;
          });
          if(!room)return;
          if(result?.abort){if(result.message)send(socket,'error',{message:result.message});return;}
          if(room.mode==='ffa'){await publish('room-start',{roomId:room.id,mode:'ffa',mapId:room.round.mapId,hostId:room.hostId,startsAt:room.round.startsAt,roster:room.members.map(entry=>({id:entry.id,name:entry.name}))});await emitFfa(room);await publishRoomList();return;}
          // Roles go out on the shared channel; each client keeps only its own.
          await publish('room-start',{roomId:room.id,hostId:room.hostId,...setup,
            roster:room.members.map(entry=>({id:entry.id,name:entry.name}))});
          // Roles went out above; now everyone needs the opening round snapshot.
          await emitRound(room);
          await publishRoomList();return;
        }
        return;
      }
      if(event.type==='crew'){
        const room=await loadRoom(peer.roomId);
        if(!room?.round||room.hostId!==peer.id)return;
        if(!Array.isArray(event.bots)||event.bots.length>4)return;
        const bots=event.bots.filter(bot=>Array.isArray(bot)&&bot.length>=4
          &&Number.isFinite(bot[1])&&Number.isFinite(bot[2])
          &&Math.abs(bot[1])<=WORLD.halfX&&Math.abs(bot[2])<=WORLD.halfZ);
        // Straight to the members, bypassing any persistence: crew positions
        // are worthless a moment later and must never touch the write path.
        await Promise.all(room.members.filter(member=>member.id!==peer.id)
          .map(member=>publishToPlayer(member.id,'crew',{from:peer.id,bots})));
        return;
      }
      if(event.type==='round'){
        const action=event.action;
        // Positions are read before the mutation so the retry loop stays cheap.
        const positions=action==='kill'?await positionsOf(await loadRoom(peer.roomId)||{members:[]}):{};
        let events=[],winner=null;
        const {room,result}=await mutateRoom(peer.roomId,candidate=>{
          const round=candidate.round;
          if(!round)return {abort:true};
          events=[];winner=null;
          if(action==='kill'){
            const outcome=applyKill(round,peer.id,event.targetId,positions,now);
            if(outcome.error)return {abort:true,message:outcome.error};
            events.push({event:'killed',...outcome.event});winner=outcome.winner;
            return null;
          }
          if(action==='report'||action==='emergency'){
            const outcome=openMeeting(round,peer.id,action==='report'?event.bodyId:null,now);
            if(outcome.error)return {abort:true,message:outcome.error};
            events.push({event:'meeting',...outcome.event});
            return null;
          }
          if(action==='vote'){
            const outcome=castVote(round,peer.id,event.candidateId);
            if(outcome.error)return {abort:true,message:outcome.error};
            events.push({event:'voted',voterId:peer.id});
            if(outcome.complete){
              const tally=resolveVote(round,now);
              if(tally){events.push({event:'ejected',...tally.event});winner=tally.winner;}
            }
            return null;
          }
          if(action==='tick'){
            const moved=advanceMeeting(round,now);
            const tally=resolveVote(round,now);
            if(!moved&&!tally)return {abort:true};
            if(moved)events.push({event:'meeting',...moved.event});
            if(tally){events.push({event:'ejected',...tally.event});winner=tally.winner;}
            return null;
          }
          return {abort:true};
        });
        if(!room)return;
        if(result?.abort){if(result.message)send(socket,'error',{message:result.message});return;}
        for(const outgoing of events)await emitRound(room,outgoing);
        if(winner)await finishRound(room,winner);
        return;
      }
      if(event.type==='ffa'){
        const positions=['shot','melee'].includes(event.action)?await positionsOf(await loadRoom(peer.roomId)||{members:[]}):{};let outgoing=null,ended=false;
        const {room,result}=await mutateRoom(peer.roomId,candidate=>{if(candidate.mode!=='ffa'||!candidate.round)return {abort:true,message:'Not in a Free-for-All match'};advanceFfa(candidate.round,now);let outcome;if(event.action==='shot')outcome=ffaShot(candidate.round,peer.id,event,positions,now);else if(event.action==='melee')outcome=ffaMelee(candidate.round,peer.id,event.targetId,positions,now);else if(event.action==='reload')outcome=ffaReload(candidate.round,peer.id,now);else if(event.action==='switch')outcome=ffaSwitch(candidate.round,peer.id,event.weapon);else if(event.action==='loadout')outcome=ffaSetPrimary(candidate.round,peer.id,event.weapon,now);else if(event.action==='claim')outcome=ffaClaimDrop(candidate.round,peer.id,positions,now);else if(event.action==='tick')outcome={};else return {abort:true};if(outcome.error)return {abort:true,message:outcome.error};outgoing=outcome.event||null;ended=candidate.round.phase==='ended';if(ended){candidate.phase='lobby';for(const member of candidate.members)member.ready=member.id===candidate.hostId;}return null;});
        if(result?.abort){if(result.message)send(socket,'error',{message:result.message});return;}if(room){await emitFfa(room,outgoing);if(ended){await emitFfa(room,{event:'ended',winnerIds:room.round.winnerIds});await publishRoom(room);await publishRoomList();}}return;
      }
      if(event.type==='effect'){
        if(!EFFECT_KINDS.has(event.effect))return;
        if(!Number.isFinite(event.x)||!Number.isFinite(event.z)||Math.abs(event.x)>WORLD.halfX||Math.abs(event.z)>WORLD.halfZ)return;
        if(now-peer.effectWindow>20000){peer.effectWindow=now;peer.effectCount=0;}
        if(++peer.effectCount>EFFECT_LIMIT)return;
        const unit=value=>Number.isFinite(value)?Math.max(-1,Math.min(1,value)):0;
        // Broadcast rather than persisted: a splash is a moment, not player state.
        await publish('effect',{id:peer.id,effect:event.effect,x:event.x,z:event.z,
          dx:unit(event.dx),dz:unit(event.dz),
          size:Number.isFinite(event.size)?Math.max(.5,Math.min(2,event.size)):1});
        return;
      }
      if(event.type==='voice'){
        if(peer.roomId){const room=await loadRoom(peer.roomId),seat=room?.round?.roster.find(entry=>entry.id===peer.id);if(room?.mode==='ffa'&&room.round?.phase!=='ended')return;if(seat?.alive===false)return;}
        const target=typeof event.target==='string'?event.target:'';
        const signal=event.signal;
        if(!target||target===peer.id||!signal||typeof signal!=='object'||!VOICE_SIGNALS.has(signal.type))return;
        if(now-peer.voiceWindow>10000){peer.voiceWindow=now;peer.voiceCount=0;}
        if(++peer.voiceCount>VOICE_SIGNAL_LIMIT)return;
        if(!await redis.exists(PLAYER_KEY(target)))return;
        // `from` is the server-assigned id for this socket, so it cannot be forged.
        await redis.publish(VOICE_CHANNEL(target),JSON.stringify({type:'voice',data:{from:peer.id,signal}}));
        return;
      }
      if(event.type==='chat'){
        if(peer.roomId){const room=await loadRoom(peer.roomId),seat=room?.round?.roster.find(entry=>entry.id===peer.id);if(room?.mode==='ffa'&&room.round?.phase!=='ended'){send(socket,'error',{message:'Chat is disabled during Free-for-All'});return;}if(seat?.alive===false){send(socket,'error',{message:'Ghosts cannot chat'});return;}}
        const message=typeof event.message==='string'?event.message.replace(/[\u0000-\u001f\u007f]/g,' ').trim().slice(0,120):'';
        if(!message||now-peer.lastChat<700)return;
        peer.lastChat=now;await publish('chat',{id:peer.id,name:peer.name,message});
      }
    }catch(error){console.error('Multiplayer event failed',error);send(socket,'error',{message:'Multiplayer temporarily unavailable'});}
    finally{if(event.type==='state')stateBusy=false;if(event.type==='join')joining=false;}
  });
  const cleanup=()=>{
    if(closed)return;closed=true;sockets.delete(socket);
    if(!peer)return;
    // Local routing table: only clear it if this socket is still the one listed
    // on this instance, or a replacement here would lose its voice channel.
    if(voiceSockets.get(peer.id)===socket){
      voiceSockets.delete(peer.id);
      void subscriber?.unsubscribe(VOICE_CHANNEL(peer.id)).catch(()=>{});
    }
    // Only the socket that still owns this identity may retire the player, and
    // only a genuine departure should give up their seat. A rotation replaces
    // the socket while the player stays exactly where they were.
    void redis.eval(RETIRE_SCRIPT,4,OWNER_KEY(peer.id),PLAYER_KEY(peer.id),SECRET_KEY(peer.id),PRESENCE,peer.connectionId,peer.id)
      .then(async removed=>{
        if(Number(removed)!==1)return;
        if(peer.roomId)await dropFromRoom(peer.id,peer.roomId).catch(()=>{});
        await publish('left',{id:peer.id});
      })
      .catch(error=>console.error('Disconnect cleanup failed',error));
  };
  socket.on('close',cleanup);socket.on('error',cleanup);
});

export default server;
