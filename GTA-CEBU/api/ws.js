import { WORLD, SPAWN } from '../src/map-config.js';
import http from 'node:http';
import { randomUUID, randomBytes } from 'node:crypto';
import Redis from 'ioredis';
import { WebSocket, WebSocketServer } from 'ws';
import { EMOTES, normalizeAppearance } from '../src/appearance.js';

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
const voiceSockets=new Map();
const PIRATE_CHARACTERS=new Set(['Henry','Anne','Mako','Captain_Barbarossa','Sharky']);
const redis=process.env.REDIS_URL?new Redis(process.env.REDIS_URL,{maxRetriesPerRequest:1,retryStrategy:times=>Math.min(times*200,3000)}):null;
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
  response.writeHead(redis?426:503,{'Content-Type':'application/json'});
  response.end(JSON.stringify({error:redis?'WebSocket upgrade required':'Multiplayer storage is not configured'}));
});
const wss=new WebSocketServer({server,maxPayload:16384});

function publicPeer(peer){
  const activeMood=peer.moodUntil>Date.now();
  return {id:peer.id,name:peer.name,x:peer.x,z:peer.z,y:peer.y,h:peer.h,inCar:peer.inCar,flight:peer.flight,character:peer.character,appearance:peer.appearance,animation:peer.animation,weapon:peer.weapon,aiming:peer.aiming,attacking:peer.attacking,attackArm:peer.attackArm,mood:activeMood?peer.mood:null,moodUntil:activeMood?peer.moodUntil:0};
}
function send(socket,type,data){if(socket.readyState===WebSocket.OPEN)socket.send(JSON.stringify({type,data}));}
async function publish(type,data){await redis.publish(CHANNEL,JSON.stringify({type,data}));}
async function persist(peer){
  const now=Date.now();
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
  try{if(origin)originAllowed=new URL(origin).host===request.headers.host;}catch{originAllowed=false;}
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
        peer={id:resumeId||randomUUID(),secret,connectionId:randomBytes(12).toString('hex'),name:validName(event.name),appearance:normalizeAppearance(event.appearance),character:PIRATE_CHARACTERS.has(event.character)?event.character:'Henry',animation:'Idle',weapon:'pistol',aiming:false,attacking:false,attackArm:0,x:SPAWN.x,z:SPAWN.z,y:0,h:0,inCar:false,flight:null,mood:null,moodUntil:0,lastState:0,lastChat:0,lastMood:0,voiceWindow:0,voiceCount:0};
        await persist(peer);
        voiceSockets.set(peer.id,socket);
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
        peer.x=event.x;peer.z=event.z;peer.y=event.y;peer.h=event.h;peer.inCar=event.inCar===true;peer.flight=['jetpack','jet','helicopter'].includes(event.flight)?event.flight:null;peer.character=PIRATE_CHARACTERS.has(event.character)?event.character:peer.character;peer.appearance=normalizeAppearance(event.appearance);peer.animation=['Idle','Walk','Run','Jump','Punch'].includes(event.animation)?event.animation:'Idle';peer.weapon=event.weapon==='fists'?'fists':'pistol';peer.aiming=event.aiming===true;peer.attacking=event.attacking===true;peer.attackArm=event.attackArm===1?1:0;peer.lastState=now;
        await persist(peer);await publish('state',publicPeer(peer));return;
      }
      if(event.type==='heartbeat'){
        if(now-peer.lastState<8000)return;
        peer.lastState=now;
        await persist(peer);return;
      }
      if(event.type==='mood'){
        if(!Object.hasOwn(EMOTES,event.mood)||now-peer.lastMood<500)return;
        peer.mood=event.mood;peer.moodUntil=now+8000;peer.lastMood=now;
        await persist(peer);await publish('state',publicPeer(peer));return;
      }
      if(event.type==='voice'){
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
    void redis.eval(RETIRE_SCRIPT,4,OWNER_KEY(peer.id),PLAYER_KEY(peer.id),SECRET_KEY(peer.id),PRESENCE,peer.connectionId,peer.id)
      .then(removed=>{ if(Number(removed)===1)return publish('left',{id:peer.id}); })
      .catch(error=>console.error('Disconnect cleanup failed',error));
  };
  socket.on('close',cleanup);socket.on('error',cleanup);
});

export default server;
