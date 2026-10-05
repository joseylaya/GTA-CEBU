import { WORLD, SPAWN } from './src/map-config.js';
import http from 'node:http';
import { randomBytes, randomUUID } from 'node:crypto';
import zlib from 'node:zlib';
import { promisify } from 'node:util';
import { readFile, stat } from 'node:fs/promises';
import { dirname, extname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { EMOTES, normalizeAppearance } from './src/appearance.js';
import { iceServers, rateLimited, sameOrigin as turnSameOrigin } from './api/_turn.js';
import pgDriver from 'pg';
import { registerPlayer, loginPlayer, playerForToken, logoutPlayer, sqlRpc } from './api/_accounts.js';
import { sanitizeRoomName, clampNpcCount, publicRoom, roomSummary, startBlocker, assignRoles, roomMode, ffaLoadout, ffaDuration, ffaMap, joinableRoom, listableRoom, ROOM_MAX_PLAYERS, ROOM_IDLE_MS } from './api/_rooms.js';
import { createRound, applyKill, openMeeting, castVote, advanceMeeting, resolveVote, publicRound, checkWin } from './api/_rounds.js';
import {createFfaRound,publicFfa,ffaShot,ffaMelee,ffaReload,ffaSwitch,advanceFfa,ffaSetPrimary,ffaSetOnline,ffaJoinRound,ffaClaimDrop,ffaSnapshotPlan,FFA_WEAPONS} from './api/_ffa.js';
import { landmark } from './src/geography.js';
import { activityById } from './src/activities.js';

// Aim pitch is a look direction, not a position: clamp it and never trust it raw.
const cleanPitch=value=>Number.isFinite(Number(value))?Math.max(-1.4,Math.min(1.4,Number(value))):0;


// Same derivation as the worker: never hand-list the weapons.
const WEAPONS=new Set(['fists','hands','knife',...Object.keys(FFA_WEAPONS)]);

const root=dirname(fileURLToPath(import.meta.url));
const production=process.argv.includes('--production');
const host=process.env.HOST || '127.0.0.1';
const port=Number(process.env.PORT) || 5173;
const peers=new Map();

// Player accounts. Optional: without DATABASE_URL the game runs exactly as it
// always has, just with the account endpoints reporting that they are off --
// so a contributor without database credentials can still work on the game.
const databaseUrl=process.env.DATABASE_URL||'';
const databaseHost=(()=>{try{return new URL(databaseUrl).hostname;}catch{return '';}})();
const databaseIsLocal=['localhost','127.0.0.1','::1'].includes(databaseHost);
const pool=databaseUrl?new pgDriver.Pool({
  connectionString:databaseUrl,
  ssl:databaseIsLocal?false:{rejectUnauthorized:false},
  max:4, idleTimeoutMillis:30000, connectionTimeoutMillis:15000
}):null;
if(pool)pool.on('error',error=>console.warn('Database pool error:',error.message));
// The account rules live in Postgres functions so the Worker can reach them
// over HTTPS; here we call the very same functions through the driver.
const dbQuery=(text,params)=>pool.query(text,params).then(result=>result.rows);
const dbRpc=sqlRpc(dbQuery);
const accountsOff=res=>send(res,503,{error:'Accounts are not configured on this server'});
const activeJobs=new Map();
const activeActivities=new Map();
const jobPoint=name=>landmark(name)?.roadPoint;
const JOB_RULES=Object.freeze({
  courier:{minimumMs:5000,hub:landmark('The Walk')?.entrance,route:['TGU Tower','HM Tower','Ayala Malls Central Bloc','eBloc 3 Tower'].map(jobPoint)},
  taxi:{minimumMs:8000,hub:jobPoint('Ayala Malls Central Bloc'),route:['Ayala Malls Central Bloc','38 Park Avenue','Calyx Centre','eBloc 1 Tower'].map(jobPoint)},
  race:{minimumMs:10000,hub:jobPoint('eBloc 1 Tower'),route:['eBloc 1 Tower','38 Park Avenue','Garden Bloc','eBloc 3 Tower','Calyx Centre','The Walk','Globe Telecom Tower'].map(jobPoint)}
});
const GARAGE_POINT=jobPoint('Globe Telecom Tower');
const peerForAccount=token=>[...peers.values()].find(peer=>peer.account===token);
const closeTo=(peer,point,radius=13)=>Boolean(peer&&point&&Math.hypot(peer.x-point.x,peer.z-point.z)<=radius);
// Expired session rows are harmless but they pile up.
// Expired sessions are swept by logout_player; no separate timer needed.
// Deduction lobbies, keyed by room id. Membership is by peer id so a player
// leaving the district also leaves whatever room they were sitting in.
const rooms=new Map();
function roomOf(peerId){
  for(const room of rooms.values())if(room.members.some(member=>member.id===peerId))return room;
  return null;
}
function canCommunicate(peerId){
  const room=roomOf(peerId),round=room?.round;if(!round)return true;
  if(room.mode==='ffa'&&round.phase!=='ended')return false;
  return round.roster.find(seat=>seat.id===peerId)?.alive!==false;
}
function touchRoom(room){room.touchedAt=Date.now();}
function sendRoomState(room){
  const payload=publicRoom(room);
  for(const member of room.members){
    const peer=[...peers.values()].find(candidate=>candidate.id===member.id);
    if(peer)emit(peer,'room',payload);
  }
}
// Anyone browsing should see a new or emptied room appear and disappear.
// Everyone in the room sees the same event; the round snapshot that follows is
// tailored per player so roles stay hidden.
function emitRound(room,event=null){
  for(const member of room.members){
    const peer=[...peers.values()].find(candidate=>candidate.id===member.id);
    if(!peer)continue;
    if(event)emit(peer,'round-event',event);
    emit(peer,'round',publicRound(room.round,member.id));
  }
}
function emitFfa(room,event=null){
  if(event?.event==='respawn'&&event.playerId){const peer=[...peers.values()].find(candidate=>candidate.id===event.playerId);if(peer)peer.teleportBudget=Math.max(peer.teleportBudget||0,2);}
  const plan=ffaSnapshotPlan(room.round,event);
  for(const member of room.round?.roster||[]){const peer=[...peers.values()].find(candidate=>candidate.id===member.id);if(!peer)continue;if(event)emit(peer,'ffa-event',event);if(plan.all||plan.only?.has(member.id))emit(peer,'ffa',publicFfa(room.round,member.id));}
}
function positionsOf(room){
  const map={};
  for(const member of room.members){
    const peer=[...peers.values()].find(candidate=>candidate.id===member.id);
    if(peer)map[member.id]={x:peer.x,y:peer.y||0,z:peer.z};
  }
  return map;
}
function finishRound(room,winner){
  room.round.phase='ended';room.phase='lobby';
  for(const member of room.members)member.ready=member.id===room.hostId;
  emitRound(room,{event:'ended',winner});
  broadcastRoomList();
}
// Credit everyone who was signed in, from the server's own scores. Mirrors
// awardMatch in the worker so local play and production agree.
async function awardMatch(room){
  if(!pool||!room.round?.roster?.length)return;
  const winners=new Set(room.round.winnerIds||[]);
  for(const seat of room.round.roster){
    const peer=[...peers.values()].find(candidate=>candidate.id===seat.id);
    if(!peer?.account)continue;                 // a guest earns nothing
    try{
      const rows=await dbQuery('select * from award_match($1,$2,$3,$4)',
        [peer.account,seat.score|0,seat.deaths|0,winners.has(seat.id)]);
      const row=rows[0];if(!row||row.error)continue;
      emit(peer,'progress',{exp:Number(row.exp),points:Number(row.points),
        gainedExp:Number(row.gained_exp),gainedPoints:Number(row.gained_points),
        matchesPlayed:row.matches_played,kills:row.kills,deaths:row.deaths,wins:row.wins});
    }catch(error){ console.warn('Award failed for',seat.id,error.message); }
  }
}
function broadcastRoomList(){broadcast('rooms',[...rooms.values()].filter(room=>listableRoom(room)).map(roomSummary));}
function dropFromRoom(peerId){
  const room=roomOf(peerId);if(!room)return;
    // Retire their seat as well. room.members and round.roster are separate
    // lists, so filtering the member alone left a live, unattended body in the
    // arena that respawned every time it was shot.
  if(room.mode==='ffa'&&room.round&&room.round.phase!=='ended')ffaSetOnline(room.round,peerId,false);
  room.members=room.members.filter(member=>member.id!==peerId);
  if(!room.members.length){rooms.delete(room.id);broadcastRoomList();return;}
  // The room outlives its creator: hand the lobby to whoever is next in.
  if(room.hostId===peerId)room.hostId=room.members[0].id;
  room.npcCount=clampNpcCount(room.npcCount,room.members.length);
  touchRoom(room);sendRoomState(room);broadcastRoomList();
}
const MAX_PLAYERS=32;
const MAX_BODY=1024;
// WebRTC session descriptions do not fit in the game's usual tiny bodies.
const VOICE_BODY=16384;
const VOICE_SIGNALS=new Set(['voice:offer','voice:answer','voice:ice-candidate','voice:ready','voice:unavailable']);
const VOICE_SIGNAL_LIMIT=90;
const EFFECT_KINDS=new Set(['blood']);
const EFFECT_LIMIT=14;
const PIRATE_CHARACTERS=new Set(['Henry','Anne','Mako','Captain_Barbarossa','Sharky']);
let vite;

function send(res,status,data){
  res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});
  res.end(JSON.stringify(data));
}
// What a position update needs. Identity travels on join and whenever it
// changes, not on every frame -- see movingPeer in the worker.
function movingPeer(peer){return {id:peer.id,name:peer.name,x:peer.x,z:peer.z,y:peer.y,h:peer.h,inCar:peer.inCar,flight:peer.flight,ghost:peer.ghost===true,animation:peer.animation,weapon:peer.weapon,pitch:peer.pitch||0,aiming:peer.aiming,attacking:peer.attacking,attackArm:peer.attackArm};}
function publicPeer(peer){return {id:peer.id,name:peer.name,x:peer.x,z:peer.z,y:peer.y,h:peer.h,inCar:peer.inCar,flight:peer.flight,ghost:peer.ghost===true,character:peer.character,appearance:peer.appearance,animation:peer.animation,weapon:peer.weapon,pitch:peer.pitch||0,aiming:peer.aiming,attacking:peer.attacking,attackArm:peer.attackArm,mood:peer.moodUntil>Date.now()?peer.mood:null,moodUntil:peer.moodUntil>Date.now()?peer.moodUntil:0};}
function emit(peer,event,data){
  if(peer.stream&&!peer.stream.destroyed)peer.stream.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}
function broadcast(event,data){for(const peer of peers.values())emit(peer,event,data);}
// Mirrors broadcastNear in the worker: presence only reaches people who could
// actually see you -- your room, or free roam if you are not in one. Clients
// were already discarding the rest, so this changes traffic, not behaviour.
// The room list stays global; the lobby browser needs it.
function roomIndex(){
  const index=new Map();
  for(const room of rooms.values())for(const member of room.members)index.set(member.id,room.id);
  return index;
}
function broadcastNear(peerId,event,data,except=null){
  const index=roomIndex(),mine=index.get(peerId)||null;
  for(const peer of peers.values()){
    if(peer.id===except)continue;
    if((index.get(peer.id)||null)!==mine)continue;
    emit(peer,event,data);
  }
}
function validName(value){
  if(typeof value!=='string')return 'Player';
  return value.replace(/[\u0000-\u001f\u007f]/g,'').trim().slice(0,20)||'Player';
}
function readBody(req,limit=MAX_BODY){return new Promise((resolveBody,reject)=>{
  let size=0,text='';
  req.on('data',chunk=>{size+=chunk.length;if(size>limit){reject(Error('Request too large'));req.destroy();return;}text+=chunk;});
  req.on('end',()=>{try{resolveBody(JSON.parse(text||'{}'));}catch{reject(Error('Invalid JSON'));}});
  req.on('error',reject);
});}
function sameOrigin(req){
  if(!req.headers.origin)return true;
  try{return new URL(req.headers.origin).host===req.headers.host;}catch{return false;}
}
async function api(req,res,url){
  if(req.method==='GET'&&url.pathname==='/api/health'){send(res,200,{online:true,players:peers.size});return;}
  if(req.method==='GET'&&url.pathname==='/api/rooms'){
    send(res,200,[...rooms.values()].filter(room=>listableRoom(room)).map(roomSummary));return;
  }
  if(req.method==='GET'&&url.pathname==='/api/turn'){
    if(!turnSameOrigin(req.headers.origin,req.headers.host)){send(res,403,{error:'Origin rejected'});return;}
    if(rateLimited(req.socket.remoteAddress||'local')){send(res,429,{error:'Too many credential requests'});return;}
    const result=await iceServers();
    res.writeHead(200,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});
    res.end(JSON.stringify(result));return;
  }
  if(req.method==='POST'&&!sameOrigin(req)){send(res,403,{error:'Origin rejected'});return;}
  const body=req.method==='POST'?await readBody(req,url.pathname==='/api/voice'?VOICE_BODY:MAX_BODY):{};
  // --- player accounts ----------------------------------------------------
  if(url.pathname==='/api/register'||url.pathname==='/api/login'||
     url.pathname==='/api/logout'||url.pathname==='/api/me'){
    if(!pool){accountsOff(res);return;}
    const agent=req.headers['user-agent']||'';
    try{
      if(req.method==='POST'&&url.pathname==='/api/register'){
        const result=await registerPlayer(dbRpc,{name:body.name,email:body.email,password:body.password,userAgent:agent});
        if(result.error){send(res,400,{error:result.error});return;}
        send(res,201,{player:result.player,token:result.token});return;
      }
      if(req.method==='POST'&&url.pathname==='/api/login'){
        const result=await loginPlayer(dbRpc,{name:body.name,password:body.password,userAgent:agent});
        // 401, not 400: the credentials were understood and rejected.
        if(result.error){send(res,401,{error:result.error});return;}
        send(res,200,{player:result.player,token:result.token});return;
      }
      if(req.method==='POST'&&url.pathname==='/api/logout'){
        await logoutPlayer(dbRpc,body.token);send(res,200,{ok:true});return;
      }
      if(req.method==='GET'&&url.pathname==='/api/me'){
        const player=await playerForToken(dbRpc,url.searchParams.get('token'));
        if(!player){send(res,401,{error:'Not signed in'});return;}
        send(res,200,{player});return;
      }
    }catch(error){
      // Never leak a driver message to the browser; it can carry SQL.
      console.warn('Account request failed:',error.message);
      send(res,500,{error:'Something went wrong, try again'});return;
    }
    send(res,405,{error:'Method not allowed'});return;
  }
  // Local-first open-world economy. The browser may request a job kind, but it
  // never supplies a reward. A short-lived server ticket prevents replaying a
  // completion request or claiming a job that was never started.
  if(url.pathname==='/api/job/start'||url.pathname==='/api/job/checkpoint'||url.pathname==='/api/job/complete'||url.pathname==='/api/garage/engine'){
    if(!pool){accountsOff(res);return;}
    if(req.method!=='POST'){send(res,405,{error:'Method not allowed'});return;}
    const player=await playerForToken(dbRpc,body.token);
    if(!player){send(res,401,{error:'Sign in to continue'});return;}
    if(url.pathname==='/api/job/start'){
      const rule=JOB_RULES[body.kind];
      if(!rule){send(res,400,{error:'Unknown job'});return;}
      const livePeer=peerForAccount(body.token);
      if(!closeTo(livePeer,rule.hub,16)){send(res,409,{error:'Go to the job marker first'});return;}
      const ticket={id:randomUUID(),kind:body.kind,startedAt:Date.now(),minimumMs:rule.minimumMs,nextCheckpoint:0};
      activeJobs.set(player.id,ticket);
      setTimeout(()=>{if(activeJobs.get(player.id)?.id===ticket.id)activeJobs.delete(player.id);},360000);
      send(res,200,{jobId:ticket.id,kind:ticket.kind});return;
    }
    if(url.pathname==='/api/job/checkpoint'){
      const ticket=activeJobs.get(player.id),rule=ticket&&JOB_RULES[ticket.kind];
      if(!ticket||ticket.id!==body.jobId||!rule){send(res,409,{error:'That job is no longer active'});return;}
      if(body.index!==ticket.nextCheckpoint){send(res,409,{error:'Checkpoint is out of order'});return;}
      if(!closeTo(peerForAccount(body.token),rule.route[ticket.nextCheckpoint])){send(res,409,{error:'Move closer to the checkpoint'});return;}
      ticket.nextCheckpoint++;
      send(res,200,{nextCheckpoint:ticket.nextCheckpoint,complete:ticket.nextCheckpoint>=rule.route.length});return;
    }
    if(url.pathname==='/api/job/complete'){
      const ticket=activeJobs.get(player.id);
      if(!ticket||ticket.id!==body.jobId){send(res,409,{error:'That job is no longer active'});return;}
      if(ticket.nextCheckpoint<JOB_RULES[ticket.kind].route.length){send(res,409,{error:'Complete every checkpoint first'});return;}
      if(Date.now()-ticket.startedAt<ticket.minimumMs){send(res,409,{error:'Job completed too quickly'});return;}
      const rows=await dbQuery('select * from award_open_world_job($1,$2)',[body.token,ticket.kind]);
      const row=rows[0];
      if(!row||row.error){send(res,409,{error:row?.error||'Reward could not be saved'});return;}
      activeJobs.delete(player.id);
      send(res,200,{money:Number(row.money),exp:Number(row.exp),streetRep:Number(row.street_rep),
        engineLevel:Number(row.engine_level),completedJobs:Number(row.completed_jobs),
        gainedMoney:Number(row.gained_money),gainedExp:Number(row.gained_exp),gainedRep:Number(row.gained_rep)});return;
    }
    const garagePeer=peerForAccount(body.token);
    if(!garagePeer?.inCar){send(res,409,{error:'Bring a car into the garage to upgrade it'});return;}
    if(!closeTo(garagePeer,GARAGE_POINT,16)){send(res,409,{error:'Drive to the district garage first'});return;}
    const rows=await dbQuery('select * from buy_engine_upgrade($1)',[body.token]);
    const row=rows[0];
    if(!row||row.error){send(res,409,{error:row?.error||'Upgrade could not be saved'});return;}
    send(res,200,{money:Number(row.money),exp:Number(row.exp),streetRep:Number(row.street_rep),
      engineLevel:Number(row.engine_level),completedJobs:Number(row.completed_jobs),price:Number(row.price)});return;
  }
  if(url.pathname==='/api/activity/start'||url.pathname==='/api/activity/checkpoint'||url.pathname==='/api/activity/complete'){
    if(!pool){accountsOff(res);return;}
    if(req.method!=='POST'){send(res,405,{error:'Method not allowed'});return;}
    const signedIn=await playerForToken(dbRpc,body.token);
    if(!signedIn){send(res,401,{error:'Sign in to continue'});return;}
    const livePeer=peerForAccount(body.token);
    if(!livePeer){send(res,409,{error:'Enter Cebu before starting an activity'});return;}
    if(url.pathname==='/api/activity/start'){
      const activity=activityById(body.activityId);
      if(!activity){send(res,400,{error:'Unknown activity'});return;}
      if(roomOf(livePeer.id)){send(res,409,{error:'Leave the game room before joining a city activity'});return;}
      if(livePeer.inCar||livePeer.flight){send(res,409,{error:'Join this activity on foot'});return;}
      if(!closeTo(livePeer,activity.position,activity.radius+3)){send(res,409,{error:'Move closer to the activity marker'});return;}
      const now=Date.now(),ticket={id:randomUUID(),activityId:activity.id,activeAt:now+activity.countdown*1000,expiresAt:now+(activity.countdown+activity.duration+10)*1000,nextCheckpoint:0};
      activeActivities.set(signedIn.id,ticket);
      setTimeout(()=>{if(activeActivities.get(signedIn.id)?.id===ticket.id)activeActivities.delete(signedIn.id);},(activity.countdown+activity.duration+10)*1000);
      send(res,200,{activityTicket:ticket.id,activityId:activity.id});return;
    }
    const ticket=activeActivities.get(signedIn.id),activity=ticket&&activityById(ticket.activityId);
    if(!ticket||ticket.id!==body.activityTicket||!activity||Date.now()>ticket.expiresAt){activeActivities.delete(signedIn.id);send(res,409,{error:'That activity is no longer active'});return;}
    if(roomOf(livePeer.id)){send(res,409,{error:'City activities are unavailable inside game rooms'});return;}
    if(livePeer.inCar||livePeer.flight){send(res,409,{error:'This activity must be completed on foot'});return;}
    if(Date.now()<ticket.activeAt){send(res,409,{error:'Wait for the countdown'});return;}
    if(url.pathname==='/api/activity/checkpoint'){
      if(body.index!==ticket.nextCheckpoint){send(res,409,{error:'Checkpoint is out of order'});return;}
      if(!closeTo(livePeer,activity.checkpoints[ticket.nextCheckpoint],6.5)){send(res,409,{error:'Move closer to the checkpoint'});return;}
      ticket.nextCheckpoint++;send(res,200,{nextCheckpoint:ticket.nextCheckpoint,complete:ticket.nextCheckpoint>=activity.checkpoints.length});return;
    }
    if(ticket.nextCheckpoint<activity.checkpoints.length){send(res,409,{error:'Complete every checkpoint first'});return;}
    if(ticket.completing){send(res,409,{error:'Activity reward is already being saved'});return;}
    ticket.completing=true;
    const elapsedMs=Math.max(0,Date.now()-ticket.activeAt);
    const rows=await dbQuery('select * from award_activity($1,$2,$3)',[body.token,activity.id,elapsedMs]),row=rows[0];
    if(!row||row.error){ticket.completing=false;send(res,409,{error:row?.error||'Reward could not be saved'});return;}
    activeActivities.delete(signedIn.id);
    send(res,200,{exp:Number(row.exp),gainedExp:Number(row.gained_exp),completedActivities:Number(row.completed_activities),activityWins:Number(row.activity_wins),bestSkylineSprintMs:Number(row.best_time_ms),elapsedMs});return;
  }
  if(req.method==='POST'&&url.pathname==='/api/join'){
    if(!pool){accountsOff(res);return;}
    const signedIn=await playerForToken(dbRpc,body.account);
    if(!signedIn){send(res,401,{error:'Sign in to enter Cebu'});return;}
    if(peers.size>=MAX_PLAYERS){send(res,503,{error:'District is full'});return;}
    const token=randomBytes(24).toString('hex');
    const peer={id:randomUUID(),token,name:validName(signedIn.name),appearance:normalizeAppearance(body.appearance),account:body.account,character:PIRATE_CHARACTERS.has(body.character)?body.character:'Henry',animation:'Idle',weapon:'pistol',aiming:false,attacking:false,attackArm:0,mood:null,moodUntil:0,x:SPAWN.x,z:SPAWN.z,y:0,h:0,inCar:false,flight:null,teleportBudget:2,stream:null,lastSeen:Date.now(),lastChat:0,lastState:0,lastMood:0,voiceWindow:0,voiceCount:0,effectWindow:0,effectCount:0};
    peers.set(token,peer);send(res,200,{token,id:peer.id,name:peer.name,players:[...peers.values()].filter(p=>p!==peer).map(publicPeer)});
    broadcastNear(peer.id,'joined',publicPeer(peer));return;
  }
  const token=req.method==='GET'?url.searchParams.get('token'):body.token;
  const peer=peers.get(token);
  if(!peer){send(res,401,{error:'Join the district first'});return;}
  peer.lastSeen=Date.now();
  if(req.method==='GET'&&url.pathname==='/api/events'){
    if(peer.stream&&!peer.stream.destroyed)peer.stream.end();
    res.writeHead(200,{'Content-Type':'text/event-stream','Cache-Control':'no-cache, no-transform','Connection':'keep-alive','X-Accel-Buffering':'no'});
    res.write(': connected\n\n');peer.stream=res;
    emit(peer,'snapshot',[...peers.values()].filter(p=>p!==peer).map(publicPeer));
    res.on('close',()=>{if(peer.stream===res)peer.stream=null;});return;
  }
  if(req.method==='POST'&&url.pathname==='/api/state'){
    const now=Date.now();
    if(now-peer.lastState<55){send(res,200,{ok:true});return;}
    if(!Number.isFinite(body.x)||!Number.isFinite(body.z)||!Number.isFinite(body.y)||!Number.isFinite(body.h)||Math.abs(body.x)>WORLD.halfX||Math.abs(body.z)>WORLD.halfZ||body.y<0||body.y>110){send(res,400,{error:'Invalid position'});return;}
    const room=roomOf(peer.id),inMatch=Boolean(room?.round&&room.round.phase!=='ended');
    const dt=Math.max(.05,Math.min(.5,(now-(peer.lastState||now))/1000));
    const reportedFlight=['jetpack','jet','helicopter'].includes(body.flight)?body.flight:null;
    const maxSpeed=inMatch?24:reportedFlight==='jet'?82:reportedFlight==='helicopter'?48:reportedFlight==='jetpack'?26:body.inCar===true?48:24;
    const horizontal=Math.hypot(body.x-peer.x,body.z-peer.z),vertical=Math.abs(body.y-peer.y);
    if(horizontal>3.5+maxSpeed*dt||vertical>4+Math.max(18,maxSpeed*.7)*dt){
      if((peer.teleportBudget||0)<=0){send(res,200,{ok:true,rejected:true});return;}
      peer.teleportBudget=Math.max(0,(peer.teleportBudget||0)-1);
    }
    peer.x=body.x;peer.z=body.z;peer.y=body.y;peer.h=body.h;peer.inCar=body.inCar===true;peer.ghost=body.ghost===true;peer.flight=['jetpack','jet','helicopter'].includes(body.flight)?body.flight:null;if(body.appearance)peer.appearance=normalizeAppearance(body.appearance);peer.animation=['Idle','Walk','Run','Jump','Punch'].includes(body.animation)?body.animation:'Idle';peer.weapon=WEAPONS.has(body.weapon)?body.weapon:'hands';peer.pitch=cleanPitch(body.pitch);peer.aiming=body.aiming===true;peer.attacking=body.attacking===true;peer.attackArm=body.attackArm===1?1:0;peer.lastState=now;
    broadcastNear(peer.id,'state',movingPeer(peer));send(res,200,{ok:true});return;
  }
  if(req.method==='POST'&&url.pathname==='/api/mood'){
    if(!Object.hasOwn(EMOTES,body.mood)){send(res,400,{error:'Unknown mood'});return;}
    if(Date.now()-peer.lastMood<500){send(res,429,{error:'Please wait before changing mood'});return;}
    peer.lastMood=Date.now();peer.mood=body.mood;peer.moodUntil=Date.now()+8000;
    broadcastNear(peer.id,'state',publicPeer(peer));send(res,200,{ok:true,mood:peer.mood,moodUntil:peer.moodUntil});return;
  }
  if(req.method==='POST'&&url.pathname==='/api/chat'){
    if(!canCommunicate(peer.id)){send(res,403,{error:'Ghosts cannot chat'});return;}
    const message=typeof body.message==='string'?body.message.replace(/[\u0000-\u001f\u007f]/g,' ').trim().slice(0,120):'';
    if(!message){send(res,400,{error:'Message is empty'});return;}
    if(Date.now()-peer.lastChat<700){send(res,429,{error:'Please wait before sending again'});return;}
    peer.lastChat=Date.now();broadcastNear(peer.id,'chat',{id:peer.id,name:peer.name,message});send(res,200,{ok:true});return;
  }
  if(req.method==='POST'&&url.pathname==='/api/room'){
    const action=body.action;
    if(action==='create'){
      dropFromRoom(peer.id);
      const mode=roomMode(body.mode),room={id:randomUUID().slice(0,8),name:sanitizeRoomName(body.name,`${peer.name}'s ${mode==='ffa'?'arena':'crew'}`),mode,
        hostId:peer.id,phase:'lobby',npcCount:0,members:[{id:peer.id,name:peer.name,ready:true,character:peer.character,loadout:ffaLoadout(body.loadout)}],mapId:ffaMap(body.mapId),touchedAt:Date.now()};
      room.npcCount=mode==='ffa'?0:clampNpcCount(body.npcCount,1);
      rooms.set(room.id,room);sendRoomState(room);broadcastRoomList();send(res,200,publicRoom(room));return;
    }
    if(action==='join'){
      const room=rooms.get(body.roomId);
      if(!room){send(res,404,{error:'That room is gone'});return;}
      // A running Free-for-All stays open while it has a seat; other modes do not.
      if(room.members.length+room.npcCount>=ROOM_MAX_PLAYERS){send(res,409,{error:'Room is full'});return;}
      if(room.phase!=='lobby'&&!joinableRoom(room)){send(res,409,{error:'That round already started'});return;}
      dropFromRoom(peer.id);
      if(body.mode&&room.mode!==roomMode(body.mode)){send(res,409,{error:'That room uses a different mode'});return;}
      if(!room.members.some(member=>member.id===peer.id))room.members.push({id:peer.id,name:peer.name,ready:false,character:peer.character,loadout:ffaLoadout(body.loadout)});
      room.npcCount=room.mode==='ffa'?0:clampNpcCount(room.npcCount,room.members.length);
      touchRoom(room);sendRoomState(room);broadcastRoomList();send(res,200,publicRoom(room));return;
    }
    if(action==='leave'){dropFromRoom(peer.id);send(res,200,{ok:true});return;}
    const room=roomOf(peer.id);
    if(!room){send(res,404,{error:'You are not in a room'});return;}
    if(action==='ready'){
      const member=room.members.find(entry=>entry.id===peer.id);
      if(member)member.ready=body.ready===true;
      const alreadyPlaying=room.round?.roster?.some(seat=>seat.id===peer.id);
      const joinedLive=member?.ready&&room.mode==='ffa'&&room.round&&room.round.phase!=='ended'&&!alreadyPlaying
        ?ffaJoinRound(room.round,member):null;
      touchRoom(room);sendRoomState(room);
      if(joinedLive){
        emit(peer,'room-start',{mode:'ffa',mapId:room.round.mapId||'it-park',hostId:room.hostId,startsAt:room.round.startsAt,
          roster:room.round.roster.map(entry=>({id:entry.id,name:entry.name})),resumed:true});
        emit(peer,'ffa',publicFfa(room.round,peer.id));
        if(joinedLive.event)emitFfa(room,joinedLive.event);
        broadcastRoomList();
      }
      send(res,200,{ok:true});return;
    }
    if(action==='character'){
      const member=room.members.find(entry=>entry.id===peer.id);
      if(!PIRATE_CHARACTERS.has(body.character)){send(res,400,{error:'Unknown pirate'});return;}
      if(room.mode==='ffa'&&room.round&&room.round.phase!=='ended'&&room.round.roster?.some(seat=>seat.id===peer.id)){send(res,409,{error:'Character is locked during the match'});return;}
      peer.character=body.character;
      if(member){member.character=body.character;member.ready=member.id===room.hostId;}
      touchRoom(room);sendRoomState(room);send(res,200,{ok:true});return;
    }
    if(action==='duration'){
      if(peer.id!==room.hostId||room.mode!=='ffa'){send(res,403,{error:'Host only'});return;}
      room.durationMinutes=ffaDuration(body.minutes);
      touchRoom(room);sendRoomState(room);broadcastRoomList();send(res,200,{ok:true});return;
    }
    if(action==='map'){
      if(peer.id!==room.hostId||room.mode!=='ffa'||room.phase!=='lobby'){send(res,403,{error:'Only the host can change the map before the match'});return;}
      room.mapId=ffaMap(body.mapId);touchRoom(room);sendRoomState(room);broadcastRoomList();send(res,200,{ok:true});return;
    }
    if(action==='kick'){
      if(peer.id!==room.hostId){send(res,403,{error:'Host only'});return;}
      const target=String(body.target||'');
      if(!target||target===room.hostId){send(res,400,{error:'Pick another player'});return;}
      if(!room.members.some(entry=>entry.id===target)){send(res,404,{error:'They already left'});return;}
      const victim=[...peers.values()].find(candidate=>candidate.id===target);
      if(victim)emit(victim,'kicked',{room:room.id});
      if(room.mode==='ffa'&&room.round)ffaSetOnline(room.round,target,false);
      dropFromRoom(target);broadcastRoomList();send(res,200,{ok:true});return;
    }
    if(action==='loadout'){
      const member=room.members.find(entry=>entry.id===peer.id);if(room.mode!=='ffa'||!member){send(res,409,{error:'Loadouts are for Free-for-All'});return;}
      member.loadout=ffaLoadout(body.loadout);member.ready=member.id===room.hostId;touchRoom(room);sendRoomState(room);send(res,200,{ok:true});return;
    }
    if(action==='npc'){
      if(room.hostId!==peer.id){send(res,403,{error:'Only the host can change that'});return;}
      room.npcCount=clampNpcCount(body.npcCount,room.members.length);
      touchRoom(room);sendRoomState(room);broadcastRoomList();send(res,200,{ok:true});return;
    }
    if(action==='start'){
      if(room.hostId!==peer.id){send(res,403,{error:'Only the host can start'});return;}
      const blocker=startBlocker(room);
      if(blocker){send(res,409,{error:blocker});return;}
      room.phase='playing';touchRoom(room);for(const member of room.members){const target=[...peers.values()].find(candidate=>candidate.id===member.id);if(target)target.teleportBudget=Math.max(target.teleportBudget||0,2);}
      if(room.mode==='ffa'){
        room.round=createFfaRound(room);
        for(const member of room.members){const target=[...peers.values()].find(candidate=>candidate.id===member.id);if(target)emit(target,'room-start',{mode:'ffa',mapId:room.round.mapId,hostId:room.hostId,startsAt:room.round.startsAt,roster:room.members.map(entry=>({id:entry.id,name:entry.name}))});}
        emitFfa(room);broadcastRoomList();send(res,200,{ok:true});return;
      }
      const setup=assignRoles(room);
      room.round=createRound(room,setup);
      for(const member of room.members){
        const target=[...peers.values()].find(candidate=>candidate.id===member.id);
        // Each player is told only their own role.
        if(target)emit(target,'room-start',{...setup,hostId:room.hostId,role:setup.roles[member.id],roles:undefined,
          roster:room.members.map(entry=>({id:entry.id,name:entry.name}))});
      }
      // Roles went out above; now everyone needs the opening round snapshot.
      emitRound(room);
      broadcastRoomList();send(res,200,{ok:true});return;
    }
    send(res,400,{error:'Unknown room action'});return;
  }
  if(req.method==='POST'&&url.pathname==='/api/ffa'){
    const room=roomOf(peer.id);if(room?.mode!=='ffa'||!room.round){send(res,404,{error:'You are not in a Free-for-All match'});return;}
    const now=Date.now();advanceFfa(room.round,now);let result;
    if(body.action==='shot')result=ffaShot(room.round,peer.id,body,positionsOf(room),now);
    else if(body.action==='melee')result=ffaMelee(room.round,peer.id,body.targetId,positionsOf(room),now);
    else if(body.action==='reload')result=ffaReload(room.round,peer.id,now);
    else if(body.action==='switch')result=ffaSwitch(room.round,peer.id,body.weapon);
    else if(body.action==='loadout')result=ffaSetPrimary(room.round,peer.id,body.weapon,now);
    else if(body.action==='claim')result=ffaClaimDrop(room.round,peer.id,positionsOf(room),now);
    else if(body.action==='tick')result={};
    else{send(res,400,{error:'Unknown Free-for-All action'});return;}
    if(result.error){send(res,409,{error:result.error});return;}emitFfa(room,result.event);send(res,200,{ok:true});return;
  }
  if(req.method==='POST'&&url.pathname==='/api/crew'){
    const room=roomOf(peer.id);
    // Only the host simulates the crew, so only the host may describe it.
    if(!room?.round||room.hostId!==peer.id){send(res,403,{error:'Not the host'});return;}
    if(!Array.isArray(body.bots)||body.bots.length>4){send(res,400,{error:'Bad crew payload'});return;}
    const bots=body.bots.filter(bot=>Array.isArray(bot)&&bot.length>=4
      &&Number.isFinite(bot[1])&&Number.isFinite(bot[2])
      &&Math.abs(bot[1])<=WORLD.halfX&&Math.abs(bot[2])<=WORLD.halfZ);
    for(const member of room.members){
      if(member.id===peer.id)continue;
      const target=[...peers.values()].find(candidate=>candidate.id===member.id);
      if(target)emit(target,'crew',{from:peer.id,bots});
    }
    send(res,200,{ok:true});return;
  }
  if(req.method==='POST'&&url.pathname==='/api/round'){
    const room=roomOf(peer.id);
    if(!room?.round){send(res,404,{error:'You are not in a round'});return;}
    const round=room.round,now=Date.now();
    touchRoom(room);
    if(body.action==='kill'){
      const result=applyKill(round,peer.id,body.targetId,positionsOf(room),now);
      if(result.error){send(res,409,{error:result.error});return;}
      emitRound(room,{event:'killed',...result.event});
      if(result.winner)finishRound(room,result.winner);
      send(res,200,{ok:true});return;
    }
    if(body.action==='report'||body.action==='emergency'){
      const result=openMeeting(round,peer.id,body.action==='report'?body.bodyId:null,now);
      if(result.error){send(res,409,{error:result.error});return;}
      emitRound(room,{event:'meeting',...result.event});
      send(res,200,{ok:true});return;
    }
    if(body.action==='sabotage'){
      // Host only, and it goes to the whole room so everyone is in the dark
      // together rather than each client rolling its own blackout.
      // The acting seat must be a living impostor. A host may name an NPC seat
      // it simulates; anyone else acts only as themselves.
      const actor=(typeof body.asSeat==='string'&&body.asSeat.startsWith('npc-')&&room.hostId===peer.id)
        ?round.roster.find(entry=>entry.id===body.asSeat)
        :round.roster.find(entry=>entry.id===peer.id);
      if(!actor||!actor.alive||actor.role!=='impostor'){send(res,403,{error:'Only the impostor can do that'});return;}
      if(round.phase!=='play'){send(res,409,{error:'Not during a meeting'});return;}
      emitRound(room,{event:'sabotage',kind:String(body.kind||'LIGHTS').slice(0,12),
        stations:Array.isArray(body.stations)?body.stations.slice(0,4).map(Number):[]});
      send(res,200,{ok:true});return;
    }
    if(body.action==='repair'){
      emitRound(room,{event:'repair',station:Number(body.station),by:peer.id});
      send(res,200,{ok:true});return;
    }
    if(body.action==='vote'){
      const result=castVote(round,peer.id,body.candidateId);
      if(result.error){send(res,409,{error:result.error});return;}
      emitRound(room,{event:'voted',voterId:peer.id});
      // Everyone has voted, so there is nothing left to wait for.
      if(result.complete){
        const outcome=resolveVote(round,now);
        if(outcome){emitRound(room,{event:'ejected',...outcome.event});if(outcome.winner)finishRound(room,outcome.winner);}
      }
      send(res,200,{ok:true});return;
    }
    if(body.action==='tick'){
      // Clients nudge the clock; the server decides using its own time.
      const moved=advanceMeeting(round,now);
      if(moved)emitRound(room,moved.event&&{event:'meeting',...moved.event});
      const outcome=resolveVote(round,now);
      if(outcome){emitRound(room,{event:'ejected',...outcome.event});if(outcome.winner)finishRound(room,outcome.winner);}
      send(res,200,{ok:true});return;
    }
    send(res,400,{error:'Unknown round action'});return;
  }
  if(req.method==='POST'&&url.pathname==='/api/effect'){
    if(!EFFECT_KINDS.has(body.effect)){send(res,400,{error:'Unknown effect'});return;}
    if(!Number.isFinite(body.x)||!Number.isFinite(body.z)||Math.abs(body.x)>WORLD.halfX||Math.abs(body.z)>WORLD.halfZ){send(res,400,{error:'Invalid position'});return;}
    const now=Date.now();
    if(now-peer.effectWindow>20000){peer.effectWindow=now;peer.effectCount=0;}
    if(++peer.effectCount>EFFECT_LIMIT){send(res,429,{error:'Too many effects'});return;}
    const clampUnit=value=>Number.isFinite(value)?Math.max(-1,Math.min(1,value)):0;
    broadcastNear(peer.id,'effect',{id:peer.id,effect:body.effect,x:body.x,z:body.z,
      dx:clampUnit(body.dx),dz:clampUnit(body.dz),
      size:Number.isFinite(body.size)?Math.max(.5,Math.min(2,body.size)):1});
    send(res,200,{ok:true});return;
  }
  if(req.method==='POST'&&url.pathname==='/api/voice'){
    if(!canCommunicate(peer.id)){send(res,403,{error:'Ghosts cannot use voice chat'});return;}
    const target=typeof body.target==='string'?body.target:'';
    const signal=body.signal;
    if(!target||!signal||typeof signal!=='object'||!VOICE_SIGNALS.has(signal.type)){send(res,400,{error:'Invalid voice signal'});return;}
    const now=Date.now();
    if(now-peer.voiceWindow>10000){peer.voiceWindow=now;peer.voiceCount=0;}
    if(++peer.voiceCount>VOICE_SIGNAL_LIMIT){send(res,429,{error:'Too many voice signals'});return;}
    const recipient=[...peers.values()].find(other=>other.id===target&&other!==peer);
    if(!recipient){send(res,404,{error:'Player is not available'});return;}
    // The sender id comes from the session token, so it cannot be spoofed.
    emit(recipient,'voice',{from:peer.id,signal});
    send(res,200,{ok:true});return;
  }
  if(req.method==='POST'&&url.pathname==='/api/leave'){
    // Announce the departure before dropFromRoom, while they are still a
    // member and their room-mates are still the right audience.
    broadcastNear(peer.id,'left',{id:peer.id});dropFromRoom(peer.id);peers.delete(token);if(peer.stream&&!peer.stream.destroyed)peer.stream.end();send(res,200,{ok:true});return;
  }
  send(res,404,{error:'Unknown endpoint'});
}

// Already-compressed formats: packing them again costs CPU and saves nothing.
const NEVER_COMPRESS=new Set(['.png','.jpg','.jpeg','.webp','.ogg','.mp3','.woff2','.ico','.mp4']);
const gzip=promisify(zlib.gzip), brotli=promisify(zlib.brotliCompress);
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.png':'image/png','.svg':'image/svg+xml','.ico':'image/x-icon','.woff2':'font/woff2'};
async function serveBuilt(req,res,url){
  if(req.method!=='GET'&&req.method!=='HEAD'){send(res,405,{error:'Method not allowed'});return;}
  const dist=resolve(root,'dist');
  let path=resolve(dist,`.${decodeURIComponent(url.pathname)}`);
  if(path!==dist&&!path.startsWith(dist+sep)){send(res,403,{error:'Forbidden'});return;}
  try{if(!(await stat(path)).isFile())path=join(dist,'index.html');}
  catch{path=join(dist,'index.html');}
  try{
    const content=await readFile(path);
    const type=mime[extname(path)]||'application/octet-stream';
    // Models are the bulk of the download and they compress by 74-90% -- a
    // 3.3MB mesh buffer goes out as 355KB. Serving them raw was most of the
    // wait before the district appeared.
    const headers={'Content-Type':type,'Vary':'Accept-Encoding'};
    const wants=String(req.headers['accept-encoding']||'');
    const worth=content.length>1024&&!NEVER_COMPRESS.has(extname(path));
    if(req.method==='HEAD'){res.writeHead(200,headers);res.end();return;}
    if(worth&&/\bbr\b/.test(wants)){
      const packed=await brotli(content);
      res.writeHead(200,{...headers,'Content-Encoding':'br','Content-Length':packed.length});res.end(packed);return;
    }
    if(worth&&/\bgzip\b/.test(wants)){
      const packed=await gzip(content);
      res.writeHead(200,{...headers,'Content-Encoding':'gzip','Content-Length':packed.length});res.end(packed);return;
    }
    res.writeHead(200,{...headers,'Content-Length':content.length});res.end(content);
  }
  catch{send(res,404,{error:'Run npm run build before npm run start'});}
}

const server=http.createServer((req,res)=>{
  let url;
  try{url=new URL(req.url,`http://${req.headers.host||'localhost'}`);}catch{send(res,400,{error:'Invalid URL'});return;}
  if(url.pathname.startsWith('/api/')){
    api(req,res,url).catch(error=>{if(!res.headersSent)send(res,400,{error:error.message});});return;
  }
  if(vite)vite.middlewares(req,res);
  else serveBuilt(req,res,url).catch(()=>{if(!res.headersSent)send(res,500,{error:'Server error'});});
});

if(!production){
  const {createServer}=await import('vite');
  vite=await createServer({root,appType:'spa',server:{middlewareMode:{server}}});
}
server.listen(port,host,()=>console.log(`District Zero ${production?'online':'dev'} server: http://${host}:${port}/`));

setInterval(()=>{
  const now=Date.now();
  for(const room of rooms.values()){
    if(room.mode!=='ffa'||!room.round||room.round._closed)continue;
    const before=room.round.phase,events=advanceFfa(room.round,now);
    if(events.length||before!==room.round.phase)emitFfa(room);
    for(const event of events)emitFfa(room,event);
    if(room.round.phase==='ended'){
      room.round._closed=true;emitFfa(room,{event:'ended',winnerIds:room.round.winnerIds});
      awardMatch(room).catch(error=>console.warn('Award failed:',error.message));
      room.phase='lobby';
      for(const member of room.members)member.ready=member.id===room.hostId;sendRoomState(room);broadcastRoomList();
    }
  }
},250).unref();

setInterval(()=>{
  const now=Date.now();
  for(const [token,peer] of peers){
    if(peer.stream&&!peer.stream.destroyed){peer.stream.write(': keepalive\n\n');continue;}
    if(now-peer.lastSeen>25000){broadcastNear(peer.id,'left',{id:peer.id});dropFromRoom(peer.id);peers.delete(token);}
  }
},15000).unref();

// Sweep out lobbies nobody came back to.
setInterval(()=>{
  const now=Date.now();let changed=false;
  for(const [id,room] of rooms)if(now-room.touchedAt>ROOM_IDLE_MS){rooms.delete(id);changed=true;}
  if(changed)broadcastRoomList();
},60000).unref();
