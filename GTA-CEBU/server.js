import { WORLD, SPAWN } from './src/map-config.js';
import http from 'node:http';
import { randomBytes, randomUUID } from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';
import { dirname, extname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { EMOTES, normalizeAppearance } from './src/appearance.js';
import { iceServers, rateLimited, sameOrigin as turnSameOrigin } from './api/_turn.js';

const root=dirname(fileURLToPath(import.meta.url));
const production=process.argv.includes('--production');
const host=process.env.HOST || '127.0.0.1';
const port=Number(process.env.PORT) || 5173;
const peers=new Map();
const MAX_PLAYERS=32;
const MAX_BODY=1024;
// WebRTC session descriptions do not fit in the game's usual tiny bodies.
const VOICE_BODY=16384;
const VOICE_SIGNALS=new Set(['voice:offer','voice:answer','voice:ice-candidate','voice:ready','voice:unavailable']);
const VOICE_SIGNAL_LIMIT=90;
const PIRATE_CHARACTERS=new Set(['Henry','Anne','Mako','Captain_Barbarossa','Sharky']);
let vite;

function send(res,status,data){
  res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});
  res.end(JSON.stringify(data));
}
function publicPeer(peer){return {id:peer.id,name:peer.name,x:peer.x,z:peer.z,y:peer.y,h:peer.h,inCar:peer.inCar,flight:peer.flight,character:peer.character,appearance:peer.appearance,animation:peer.animation,weapon:peer.weapon,aiming:peer.aiming,attacking:peer.attacking,attackArm:peer.attackArm,mood:peer.moodUntil>Date.now()?peer.mood:null,moodUntil:peer.moodUntil>Date.now()?peer.moodUntil:0};}
function emit(peer,event,data){
  if(peer.stream&&!peer.stream.destroyed)peer.stream.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}
function broadcast(event,data){for(const peer of peers.values())emit(peer,event,data);}
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
  if(req.method==='GET'&&url.pathname==='/api/turn'){
    if(!turnSameOrigin(req.headers.origin,req.headers.host)){send(res,403,{error:'Origin rejected'});return;}
    if(rateLimited(req.socket.remoteAddress||'local')){send(res,429,{error:'Too many credential requests'});return;}
    const result=await iceServers();
    res.writeHead(200,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});
    res.end(JSON.stringify(result));return;
  }
  if(req.method==='POST'&&!sameOrigin(req)){send(res,403,{error:'Origin rejected'});return;}
  const body=req.method==='POST'?await readBody(req,url.pathname==='/api/voice'?VOICE_BODY:MAX_BODY):{};
  if(req.method==='POST'&&url.pathname==='/api/join'){
    if(peers.size>=MAX_PLAYERS){send(res,503,{error:'District is full'});return;}
    const token=randomBytes(24).toString('hex');
    const peer={id:randomUUID(),token,name:validName(body.name),appearance:normalizeAppearance(body.appearance),character:PIRATE_CHARACTERS.has(body.character)?body.character:'Henry',animation:'Idle',weapon:'pistol',aiming:false,attacking:false,attackArm:0,mood:null,moodUntil:0,x:SPAWN.x,z:SPAWN.z,y:0,h:0,inCar:false,flight:null,stream:null,lastSeen:Date.now(),lastChat:0,lastState:0,lastMood:0,voiceWindow:0,voiceCount:0};
    peers.set(token,peer);send(res,200,{token,id:peer.id,name:peer.name,players:[...peers.values()].filter(p=>p!==peer).map(publicPeer)});
    broadcast('joined',publicPeer(peer));return;
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
    peer.x=body.x;peer.z=body.z;peer.y=body.y;peer.h=body.h;peer.inCar=body.inCar===true;peer.flight=['jetpack','jet','helicopter'].includes(body.flight)?body.flight:null;peer.character=PIRATE_CHARACTERS.has(body.character)?body.character:peer.character;peer.appearance=normalizeAppearance(body.appearance);peer.animation=['Idle','Walk','Run','Jump','Punch'].includes(body.animation)?body.animation:'Idle';peer.weapon=body.weapon==='fists'?'fists':'pistol';peer.aiming=body.aiming===true;peer.attacking=body.attacking===true;peer.attackArm=body.attackArm===1?1:0;peer.lastState=now;
    broadcast('state',publicPeer(peer));send(res,200,{ok:true});return;
  }
  if(req.method==='POST'&&url.pathname==='/api/mood'){
    if(!Object.hasOwn(EMOTES,body.mood)){send(res,400,{error:'Unknown mood'});return;}
    if(Date.now()-peer.lastMood<500){send(res,429,{error:'Please wait before changing mood'});return;}
    peer.lastMood=Date.now();peer.mood=body.mood;peer.moodUntil=Date.now()+8000;
    broadcast('state',publicPeer(peer));send(res,200,{ok:true,mood:peer.mood,moodUntil:peer.moodUntil});return;
  }
  if(req.method==='POST'&&url.pathname==='/api/chat'){
    const message=typeof body.message==='string'?body.message.replace(/[\u0000-\u001f\u007f]/g,' ').trim().slice(0,120):'';
    if(!message){send(res,400,{error:'Message is empty'});return;}
    if(Date.now()-peer.lastChat<700){send(res,429,{error:'Please wait before sending again'});return;}
    peer.lastChat=Date.now();broadcast('chat',{id:peer.id,name:peer.name,message});send(res,200,{ok:true});return;
  }
  if(req.method==='POST'&&url.pathname==='/api/voice'){
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
    peers.delete(token);if(peer.stream&&!peer.stream.destroyed)peer.stream.end();broadcast('left',{id:peer.id});send(res,200,{ok:true});return;
  }
  send(res,404,{error:'Unknown endpoint'});
}

const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.png':'image/png','.svg':'image/svg+xml','.ico':'image/x-icon','.woff2':'font/woff2'};
async function serveBuilt(req,res,url){
  if(req.method!=='GET'&&req.method!=='HEAD'){send(res,405,{error:'Method not allowed'});return;}
  const dist=resolve(root,'dist');
  let path=resolve(dist,`.${decodeURIComponent(url.pathname)}`);
  if(path!==dist&&!path.startsWith(dist+sep)){send(res,403,{error:'Forbidden'});return;}
  try{if(!(await stat(path)).isFile())path=join(dist,'index.html');}
  catch{path=join(dist,'index.html');}
  try{const content=await readFile(path);res.writeHead(200,{'Content-Type':mime[extname(path)]||'application/octet-stream'});res.end(req.method==='HEAD'?undefined:content);}
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
  for(const [token,peer] of peers){
    if(peer.stream&&!peer.stream.destroyed){peer.stream.write(': keepalive\n\n');continue;}
    if(now-peer.lastSeen>25000){peers.delete(token);broadcast('left',{id:peer.id});}
  }
},15000).unref();
