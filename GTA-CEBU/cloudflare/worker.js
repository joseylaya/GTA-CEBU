import {sanitizeRoomName,clampNpcCount,publicRoom,roomSummary,startBlocker,assignRoles,roomMode,ffaLoadout,ffaDuration,ffaMap,joinableRoom,listableRoom,ROOM_MAX_PLAYERS} from '../api/_rooms.js';
import {createRound,applyKill,openMeeting,castVote,advanceMeeting,resolveVote,publicRound} from '../api/_rounds.js';
import {registerPlayer,loginPlayer,playerForToken,logoutPlayer,restRpc} from '../api/_accounts.js';
import {wardrobeForToken,saveWardrobe} from '../api/_cosmetics.js';
import {createFfaRound,publicFfa,ffaShot,ffaMelee,ffaReload,ffaSwitch,advanceFfa,ffaSetPrimary,ffaSetOnline,ffaJoinRound,ffaClaimDrop,ffaSnapshotPlan,FFA_WEAPONS} from '../api/_ffa.js';
import {landmark} from '../src/geography.js';
import {activityById} from '../src/activities.js';

// Aim pitch is a look direction, not a position: clamp it and never trust it raw.
const cleanPitch=value=>Number.isFinite(Number(value))?Math.max(-1.4,Math.min(1.4,Number(value))):0;


const PIRATES=new Set(['Atlas','Nova']);
// Derived from the shared table so a new firearm cannot be silently downgraded
// to 'hands' on the wire, which is what hid magnum and arc from other players.
const WEAPONS=new Set(['fists','hands','knife',...Object.keys(FFA_WEAPONS)]);
const VOICE_SIGNALS=new Set(['voice:offer','voice:answer','voice:ice-candidate','voice:ready','voice:unavailable']);
const WORLD={halfX:350,halfZ:440};
const jobPoint=name=>landmark(name)?.roadPoint;
const JOB_RULES=Object.freeze({
  courier:{minimumMs:5000,hub:landmark('The Walk')?.entrance,route:['TGU Tower','HM Tower','Ayala Malls Central Bloc','eBloc 3 Tower'].map(jobPoint)},
  taxi:{minimumMs:8000,hub:jobPoint('Ayala Malls Central Bloc'),route:['Ayala Malls Central Bloc','38 Park Avenue','Calyx Centre','eBloc 1 Tower'].map(jobPoint)},
  race:{minimumMs:10000,hub:jobPoint('eBloc 1 Tower'),route:['eBloc 1 Tower','38 Park Avenue','Garden Bloc','eBloc 3 Tower','Calyx Centre','The Walk','Globe Telecom Tower'].map(jobPoint)}
});
const GARAGE_POINT=jobPoint('Globe Telecom Tower');
const JOB_PATHS=new Set(['/api/job/start','/api/job/checkpoint','/api/job/complete','/api/garage/engine','/api/activity/start','/api/activity/checkpoint','/api/activity/complete']);

const packet=(type,data)=>JSON.stringify({type,data});
const cleanName=value=>typeof value==='string'?value.replace(/[\u0000-\u001f\u007f]/g,'').trim().slice(0,20)||'Player':'Player';
const cleanAppearance=value=>value&&typeof value==='object'?value:{};

export class DistrictCoordinator {
  constructor(ctx,env){
    this.ctx=ctx;this.env=env;this.rooms=new Map();this.loaded=false;
  }
  async load(){
    if(this.loaded)return;
    const saved=await this.ctx.storage.get('rooms');
    for(const room of saved||[])this.rooms.set(room.id,room);
    this.loaded=true;
  }
  sockets(){return this.ctx.getWebSockets();}
  attachment(ws){try{return ws.deserializeAttachment()||{};}catch{return {};}}
  // Reconnects are make-before-break, so for a moment one player has two open
  // sockets. Picking whichever the runtime lists first could hand back the old
  // one, still holding the position from before they died -- the server then
  // validated hits against that corpse, which is the clone people could kill
  // over and over. Always take the socket that reported most recently.
  peerSocket(id){
    let best=null,bestGen=-1;
    for(const ws of this.sockets()){
      const peer=this.attachment(ws);
      if(peer.id!==id)continue;
      // gen is when this connection was established. Last-activity is the wrong
      // signal: the socket being replaced keeps receiving state right up to the
      // swap, so it can look newer than the one that just took over.
      const gen=peer.gen||0;
      if(gen>=bestGen){bestGen=gen;best=ws;}
    }
    return best;
  }
  // One entry per player for the same reason: two attachments for one id put a
  // second body in everyone else's world.
  peers(except=null){
    const newest=new Map();
    for(const ws of this.sockets()){
      const peer=this.attachment(ws);
      if(!peer.id||peer.id===except)continue;
      const prev=newest.get(peer.id);
      if(!prev||(peer.gen||0)>=(prev.gen||0))newest.set(peer.id,peer);
    }
    return [...newest.values()];
  }
  send(ws,type,data){try{ws.send(packet(type,data));}catch{}}
  grantTeleport(id,count=2){
    const ws=this.peerSocket(id);if(ws)this.savePeer(ws,{teleportBudget:Math.max(count,this.attachment(ws).teleportBudget||0)});
  }
  broadcast(type,data,except=null){for(const ws of this.sockets())if(this.attachment(ws).id!==except)this.send(ws,type,data);}
  // Who shares a world with whom. Built once per broadcast so the check per
  // socket is a map lookup rather than a scan of every room.
  roomIndex(){
    const index=new Map();
    for(const room of this.rooms.values())for(const member of room.members)index.set(member.id,room.id);
    return index;
  }
  // Presence only needs to reach people who could actually see you: the room
  // you are in, or free roam if you are not in one. Every client was already
  // discarding the rest, so nothing looks different -- but a ten-player match
  // no longer pays to receive, decode and throw away a position packet from
  // everybody wandering the district, twelve times a second each.
  //
  // The room list is deliberately NOT scoped; the lobby browser needs it.
  broadcastNear(peerId,type,data,except=null){
    const index=this.roomIndex();
    const mine=index.get(peerId)||null;
    for(const ws of this.sockets()){
      const id=this.attachment(ws).id;
      if(!id||id===except)continue;
      if((index.get(id)||null)!==mine)continue;
      this.send(ws,type,data);
    }
  }
  savePeer(ws,patch){const next={...this.attachment(ws),...patch,at:Date.now()};ws.serializeAttachment(next);return next;}
  // What a position update actually needs. Name, character and appearance are
  // a third of the packet and never change between frames, so they travel on
  // join, on the heartbeat, and whenever they really do change -- not twelve
  // times a second per player.
  movingPeer(peer){return {id:peer.id,name:peer.name,x:peer.x||0,z:peer.z||0,y:peer.y||0,h:peer.h||0,inCar:peer.inCar===true,flight:peer.flight||null,ghost:peer.ghost===true,animation:peer.animation||'Idle',weapon:peer.weapon||'hands',pitch:peer.pitch||0,aiming:peer.aiming===true,reloading:peer.reloading===true,attacking:peer.attacking===true,attackArm:peer.attackArm===1?1:0};}
  publicPeer(peer){return {id:peer.id,name:peer.name,x:peer.x||0,z:peer.z||0,y:peer.y||0,h:peer.h||0,inCar:peer.inCar===true,flight:peer.flight||null,ghost:peer.ghost===true,character:PIRATES.has(peer.character)?peer.character:'Atlas',appearance:peer.appearance||{},animation:peer.animation||'Idle',weapon:peer.weapon||'hands',pitch:peer.pitch||0,aiming:peer.aiming===true,reloading:peer.reloading===true,attacking:peer.attacking===true,attackArm:peer.attackArm===1?1:0,mood:peer.moodUntil>Date.now()?peer.mood:null,moodUntil:peer.moodUntil||0};}
  roomOf(id){for(const room of this.rooms.values())if(room.members.some(member=>member.id===id))return room;return null;}
  async persistRooms(){this._dirty=false;await this.ctx.storage.put('rooms',[...this.rooms.values()]);}
  // Durable Object storage is the slowest thing in the message path, and a
  // shot or a clock tick does not need to survive a restart -- live positions
  // are not persisted either. Coalesce those into one write every 400ms
  // instead of one per action, and keep the awaited write for structural
  // changes like joining, starting and ending.
  persistSoon(){
    this._dirty=true;
    if(this._flushTimer)return;
    this._flushTimer=setTimeout(()=>{
      this._flushTimer=null;
      if(this._dirty)this.persistRooms().catch(()=>{});
    },400);
  }
  // Lobbies plus any Free-for-All still running with a seat free: hiding a live
  // match from the browser is what stopped anyone joining one.
  roomList(){return [...this.rooms.values()].filter(listableRoom).map(roomSummary);}
  publishRoomList(){this.broadcast('rooms',this.roomList());}
  publishRoom(room){const data=publicRoom(room);for(const member of room.members){const ws=this.peerSocket(member.id);if(ws)this.send(ws,'room',data);}}
  emitRound(room,event=null){for(const member of room.members){const ws=this.peerSocket(member.id);if(!ws)continue;if(event)this.send(ws,'round-event',event);this.send(ws,'round',publicRound(room.round,member.id));}}
  emitFfa(room,event=null){
    if(event?.event==='respawn'&&event.playerId)this.grantTeleport(event.playerId);
    const plan=ffaSnapshotPlan(room.round,event);
    for(const member of room.round?.roster||[]){
      const ws=this.peerSocket(member.id);if(!ws)continue;
      if(event)this.send(ws,'ffa-event',event);
      if(plan.all||plan.only?.has(member.id))this.send(ws,'ffa',publicFfa(room.round,member.id));
    }
  }
  async dropFromRoom(id){
    const room=this.roomOf(id);if(!room)return;
    // Retire their seat as well. room.members and round.roster are separate
    // lists, so filtering the member alone left a live, unattended body in the
    // arena that respawned every time it was shot.
    if(room.mode==='ffa'&&room.round&&room.round.phase!=='ended')ffaSetOnline(room.round,id,false);
    room.members=room.members.filter(member=>member.id!==id);
    if(!room.members.length)this.rooms.delete(room.id);
    else{if(room.hostId===id)room.hostId=room.members[0].id;room.npcCount=clampNpcCount(room.npcCount,room.members.length);room.touchedAt=Date.now();this.publishRoom(room);}
    await this.persistRooms();this.publishRoomList();
  }
  // Only players whose socket has reported recently can be hit. A zombie left
  // over from a reconnect otherwise stays shootable at its last known spot.
  positions(room){
    const result={},now=Date.now();
    for(const member of room.members){
      const ws=this.peerSocket(member.id),peer=ws&&this.attachment(ws);
      // Clients heartbeat about once a second, so anything quiet for five is a
      // leftover socket and must not be hittable where it last stood.
      if(peer&&now-(peer.at||0)<5000)result[member.id]={x:peer.x,y:peer.y||0,z:peer.z};
    }
    return result;
  }
  async finishRound(room,winner){room.round.phase='ended';room.phase='lobby';for(const member of room.members)member.ready=member.id===room.hostId;this.publishRoom(room);this.emitRound(room,{event:'ended',winner});await this.persistRooms();this.publishRoomList();}
  async fetch(request){
    await this.load();
    const url=new URL(request.url);
    if(JOB_PATHS.has(url.pathname))return this.progressRequest(request,url);
    if(request.headers.get('Upgrade')!=='websocket')return new Response(JSON.stringify({online:true,players:this.sockets().length}),{headers:{'content-type':'application/json'}});
    const pair=new WebSocketPair(),client=pair[0],server=pair[1];this.ctx.acceptWebSocket(server);server.serializeAttachment({});
    return new Response(null,{status:101,webSocket:client});
  }
  async webSocketMessage(ws,message){
    let event;try{event=JSON.parse(typeof message==='string'?message:new TextDecoder().decode(message));}catch{return;}
    let peer=this.attachment(ws);const now=Date.now();
    if(event.type==='join'){
      if(peer.id)return;
      const requested=typeof event.id==='string'?event.id:null,token=typeof event.token==='string'?event.token:null;
      const stored=requested&&token?await this.ctx.storage.get(`identity:${requested}`):null;
      // A first-time player sends neither id nor token, so `stored` and `token`
      // are both null. Comparing them directly made null===null look like a
      // successful resume and handed out a null identity, after which every
      // later message was dropped by the `!peer.id` guard below.
      const resuming=Boolean(requested&&token&&stored&&stored===token);
      const id=resuming?requested:crypto.randomUUID();
      const secret=resuming?token:crypto.randomUUID().replaceAll('-','')+crypto.randomUUID().replaceAll('-','').slice(0,16);
      const old=this.peerSocket(id);if(old&&old!==ws)try{old.close(1000,'replaced');}catch{}
      // The account token rides the join so the server can credit the right
      // player at the end of a match. It is only ever used to say *who* you
      // are -- the scores come from the round, which the server owns.
      peer=this.savePeer(ws,{id,token:secret,gen:Date.now(),teleportBudget:2,
        account:typeof event.account==='string'&&event.account.length<=200?event.account:null,
        name:cleanName(event.name),character:PIRATES.has(event.character)?event.character:'Atlas',appearance:cleanAppearance(event.appearance),x:0,z:0,y:0,h:0,animation:'Idle',weapon:'hands',lastChat:0,mood:null,moodUntil:0});
      await this.ctx.storage.put(`identity:${id}`,secret);
      this.send(ws,'welcome',{id,token:secret,players:this.peers(id).map(item=>this.publicPeer(item)),resumed:resuming});
      this.broadcastNear(id,'joined',this.publicPeer(peer),id);
      const room=this.roomOf(id);
      if(room){
        const member=room.members.find(entry=>entry.id===id);
        if(member){member.online=true;member.leftAt=0;}
        // Only revive a seat that was actually marked offline. A routine socket
        // rotation also lands here, and respawning on every rotation teleported
        // living players to a spawn point every time their socket cycled.
        if(room.mode==='ffa'&&room.round&&room.round.phase!=='ended'){
          const seat=room.round.roster.find(entry=>entry.id===id);
          if(seat&&seat.online===false){
            const event=ffaSetOnline(room.round,id,true);
            if(event)this.emitFfa(room,event);
          }
        }
        this.send(ws,'room',publicRoom(room));
        if(room.mode==='ffa'&&room.round&&room.round.phase!=='ended'){
          this.send(ws,'room-start',{mode:'ffa',mapId:room.round.mapId||'it-park',hostId:room.hostId,startsAt:room.round.startsAt,roster:room.round.roster.map(entry=>({id:entry.id,name:entry.name,character:entry.character})),resumed:true});
          this.send(ws,'ffa',publicFfa(room.round,id));
        }else if(room.round&&room.round.phase!=='ended'&&room.setup){
          // Rebuild their round from the original setup. The layout is derived
          // from the shared seed, so they come back to the same district with
          // the same tasks rather than a freshly randomised one.
          const seat=room.round.roster.find(entry=>entry.id===id);
          this.send(ws,'room-start',{...room.setup,hostId:room.hostId,
            role:seat?.role||'crewmate',roles:undefined,
            roster:room.members.map(entry=>({id:entry.id,name:entry.name,character:entry.character})),
            resumed:true});
        }
        if(room.round&&room.mode!=='ffa')this.send(ws,'round',publicRound(room.round,id));
        await this.persistRooms();
      }
      return;
    }
    if(!peer.id)return;
    if(event.type==='state'){
      if(!Number.isFinite(event.x)||!Number.isFinite(event.z)||!Number.isFinite(event.y)||!Number.isFinite(event.h)||Math.abs(event.x)>WORLD.halfX||Math.abs(event.z)>WORLD.halfZ||event.y<0||event.y>110)return;
      const room=this.roomOf(peer.id),inMatch=Boolean(room?.round&&room.round.phase!=='ended');
      const dt=Math.max(.05,Math.min(.5,(now-(peer.at||now))/1000));
      const reportedFlight=['jetpack','jet','helicopter'].includes(event.flight)?event.flight:null;
      const maxSpeed=inMatch?24:reportedFlight==='jet'?82:reportedFlight==='helicopter'?48:reportedFlight==='jetpack'?26:event.inCar===true?48:24;
      const horizontal=Math.hypot(event.x-(peer.x||0),event.z-(peer.z||0)),vertical=Math.abs(event.y-(peer.y||0));
      const implausible=horizontal>3.5+maxSpeed*dt||vertical>4+Math.max(18,maxSpeed*.7)*dt;
      if(implausible){
        if((peer.teleportBudget||0)<=0)return;
        peer=this.savePeer(ws,{teleportBudget:Math.max(0,(peer.teleportBudget||0)-1)});
      }
      peer=this.savePeer(ws,{x:event.x,z:event.z,y:event.y,h:event.h,inCar:event.inCar===true,ghost:event.ghost===true,flight:['jetpack','jet','helicopter'].includes(event.flight)?event.flight:null,character:PIRATES.has(event.character)?event.character:peer.character,appearance:event.appearance?cleanAppearance(event.appearance):peer.appearance,animation:['Idle','Walk','Run','Jump','Punch'].includes(event.animation)?event.animation:'Idle',weapon:WEAPONS.has(event.weapon)?event.weapon:'hands',pitch:cleanPitch(event.pitch),aiming:event.aiming===true,reloading:event.reloading===true,attacking:event.attacking===true,attackArm:event.attackArm===1?1:0});
      this.broadcastNear(peer.id,'state',this.movingPeer(peer),peer.id);return;
    }
    if(event.type==='heartbeat')return;
    if(event.type==='rooms'){await this.pruneRooms();const room=this.roomOf(peer.id);if(room)this.send(ws,'room',publicRoom(room));this.send(ws,'rooms',this.roomList());return;}
    if(event.type==='room'){await this.roomAction(ws,peer,event);return;}
    if(event.type==='round'){await this.roundAction(ws,peer,event);return;}
    if(event.type==='ffa'){await this.ffaAction(ws,peer,event);return;}
    if(event.type==='crew'){
      const room=this.roomOf(peer.id);if(!room?.round||room.hostId!==peer.id||!Array.isArray(event.bots)||event.bots.length>4)return;
      for(const member of room.members){if(member.id===peer.id)continue;const target=this.peerSocket(member.id);if(target)this.send(target,'crew',{from:peer.id,bots:event.bots});}return;
    }
    if(event.type==='voice'){
      const room=this.roomOf(peer.id),seat=room?.round?.roster.find(item=>item.id===peer.id);if(room?.mode==='ffa'&&room.round?.phase!=='ended')return;if(seat?.alive===false)return;
      if(!VOICE_SIGNALS.has(event.signal?.type)||event.target===peer.id)return;const target=this.peerSocket(event.target);if(target)this.send(target,'voice',{from:peer.id,signal:event.signal});return;
    }
    if(event.type==='chat'){
      const room=this.roomOf(peer.id),seat=room?.round?.roster.find(item=>item.id===peer.id);if(room?.mode==='ffa'&&room.round?.phase!=='ended'){this.send(ws,'error',{message:'Chat is disabled during Free-for-All'});return;}if(seat?.alive===false){this.send(ws,'error',{message:'Ghosts cannot chat'});return;}
      const text=typeof event.message==='string'?event.message.replace(/[\u0000-\u001f\u007f]/g,' ').trim().slice(0,120):'';if(!text||now-(peer.lastChat||0)<700)return;this.savePeer(ws,{lastChat:now});this.broadcastNear(peer.id,'chat',{id:peer.id,name:peer.name,message:text});return;
    }
    if(event.type==='mood'){const mood=String(event.mood||'').slice(0,16);peer=this.savePeer(ws,{mood,moodUntil:now+8000});this.broadcastNear(peer.id,'state',this.publicPeer(peer));return;}
    if(event.type==='effect')this.broadcastNear(peer.id,'effect',{id:peer.id,effect:event.effect,x:event.x,z:event.z,dx:event.dx,dz:event.dz,size:event.size},peer.id);
  }
  async roomAction(ws,peer,event){
    const action=event.action;
    if(action==='create'){
      await this.dropFromRoom(peer.id);const mode=roomMode(event.mode),room={id:crypto.randomUUID().slice(0,8),name:sanitizeRoomName(event.name,`${peer.name}'s ${mode==='ffa'?'arena':'crew'}`),mode,hostId:peer.id,phase:'lobby',npcCount:mode==='ffa'?0:clampNpcCount(event.npcCount,1),members:[{id:peer.id,name:peer.name,ready:true,character:peer.character,loadout:ffaLoadout(event.loadout)}],durationMinutes:ffaDuration(event.minutes),mapId:ffaMap(event.mapId),touchedAt:Date.now()};this.rooms.set(room.id,room);await this.persistRooms();this.send(ws,'room',publicRoom(room));this.publishRoomList();return;
    }
    if(action==='join'){
      const room=this.rooms.get(event.roomId);
      if(!room){this.send(ws,'error',{message:'That room is unavailable'});return;}if(room.members.length+room.npcCount>=ROOM_MAX_PLAYERS){this.send(ws,'error',{message:'Room is full'});return;}if(room.phase!=='lobby'&&!joinableRoom(room)){this.send(ws,'error',{message:'That round already started'});return;}
      if(event.mode&&room.mode!==roomMode(event.mode)){this.send(ws,'error',{message:'That room uses a different mode'});return;}await this.dropFromRoom(peer.id);room.members.push({id:peer.id,name:peer.name,ready:false,character:peer.character,loadout:ffaLoadout(event.loadout)});room.npcCount=room.mode==='ffa'?0:clampNpcCount(room.npcCount,room.members.length);room.touchedAt=Date.now();
      await this.persistRooms();this.publishRoom(room);this.publishRoomList();return;
    }
    if(action==='leave'){await this.dropFromRoom(peer.id);return;}
    const room=this.roomOf(peer.id);if(!room){this.send(ws,'error',{message:'You are not in a room'});return;}
    const member=room.members.find(item=>item.id===peer.id);
    if(action==='ready'){
      member.ready=event.ready===true;
      const alreadyPlaying=room.round?.roster?.some(seat=>seat.id===peer.id);
      if(member.ready&&room.mode==='ffa'&&room.round&&room.round.phase!=='ended'&&!alreadyPlaying){
        const outcome=ffaJoinRound(room.round,member);
        this.send(ws,'room-start',{mode:'ffa',mapId:room.round.mapId||'it-park',hostId:room.hostId,startsAt:room.round.startsAt,
          roster:room.round.roster.map(entry=>({id:entry.id,name:entry.name,character:entry.character})),resumed:true});
        this.send(ws,'ffa',publicFfa(room.round,peer.id));
        if(outcome.event)this.emitFfa(room,outcome.event);
      }
    }
    else if(action==='character'){if(!PIRATES.has(event.character))return;member.character=event.character;member.ready=member.id===room.hostId;this.savePeer(ws,{character:event.character});}
    else if(action==='duration'){
      if(peer.id!==room.hostId||room.mode!=='ffa')return;
      room.durationMinutes=ffaDuration(event.minutes);
    }
    else if(action==='map'){
      if(peer.id!==room.hostId||room.mode!=='ffa'||room.phase!=='lobby')return;
      room.mapId=ffaMap(event.mapId);
    }
    else if(action==='kick'){
      // Host only, and never themselves. Works in the lobby and mid-match.
      if(peer.id!==room.hostId)return;
      const target=String(event.target||'');
      if(!target||target===room.hostId)return;
      if(!room.members.some(entry=>entry.id===target))return;
      const victim=this.peerSocket(target);
      if(victim)this.send(victim,'kicked',{room:room.id});
      if(room.mode==='ffa'&&room.round)ffaSetOnline(room.round,target,false);
      await this.dropFromRoom(target);
      await this.persistRooms();this.publishRoomList();
      return;
    }
    else if(action==='loadout'){if(room.mode!=='ffa')return;member.loadout=ffaLoadout(event.loadout);member.ready=member.id===room.hostId;}
    else if(action==='npc'){if(room.hostId!==peer.id)return;room.npcCount=clampNpcCount(event.npcCount,room.members.length);}
    else if(action==='start'){
      if(room.hostId!==peer.id)return;const blocker=startBlocker(room);if(blocker){this.send(ws,'error',{message:blocker});return;}room.phase='playing';for(const item of room.members)this.grantTeleport(item.id);if(room.mode==='ffa'){room.round=createFfaRound(room);for(const item of room.members){const target=this.peerSocket(item.id);if(target)this.send(target,'room-start',{mode:'ffa',mapId:room.round.mapId,hostId:room.hostId,startsAt:room.round.startsAt,roster:room.members.map(entry=>({id:entry.id,name:entry.name,character:entry.character}))});}this.emitFfa(room);await this.persistRooms();this.publishRoomList();await this.scheduleFfaAlarm();return;}const setup=assignRoles(room);room.round=createRound(room,setup);
      room.setup=setup;
      for(const item of room.members){const target=this.peerSocket(item.id);if(target)this.send(target,'room-start',{...setup,hostId:room.hostId,role:setup.roles[item.id],roles:undefined,roster:room.members.map(entry=>({id:entry.id,name:entry.name}))});}
      this.emitRound(room);await this.persistRooms();this.publishRoomList();return;
    }else return;
    room.touchedAt=Date.now();await this.persistRooms();this.publishRoom(room);this.publishRoomList();
  }
  async roundAction(ws,peer,event){
    const room=this.roomOf(peer.id);if(!room?.round){this.send(ws,'error',{message:'You are not in a round'});return;}const round=room.round,now=Date.now();let outgoing=null,winner=null,result;
    if(event.action==='kill'){
      // The host simulates the NPC crew, so it may swing on an NPC impostor's
      // behalf. Anyone else can only ever act as themselves.
      const actor=(typeof event.asSeat==='string'&&event.asSeat.startsWith('npc-')&&room.hostId===peer.id)?event.asSeat:peer.id;
      result=applyKill(round,actor,event.targetId,this.positions(room),now);if(!result.error){outgoing={event:'killed',...result.event};winner=result.winner;}}
    else if(event.action==='report'||event.action==='emergency'){result=openMeeting(round,peer.id,event.action==='report'?event.bodyId:null,now);if(!result.error)outgoing={event:'meeting',...result.event};}
    else if(event.action==='sabotage'){
      // Only the client simulating the crew may raise one, and it goes to the
      // whole room so everybody is in the dark together.
      // Allowing the host outright meant a host who was a crewmate could cut
      // the lights. Name the seat instead: the host may act only for an NPC
      // impostor it simulates, and everyone else only for themselves. Either
      // way the acting seat has to be a living impostor.
      const actor=(typeof event.asSeat==='string'&&event.asSeat.startsWith('npc-')&&room.hostId===peer.id)
        ?round.roster.find(entry=>entry.id===event.asSeat)
        :round.roster.find(entry=>entry.id===peer.id);
      if(!actor||!actor.alive||actor.role!=='impostor')return;
      if(round.phase!=='play')return;
      outgoing={event:'sabotage',kind:String(event.kind||'LIGHTS').slice(0,12),
                stations:Array.isArray(event.stations)?event.stations.slice(0,4).map(Number):[]};
    }
    else if(event.action==='repair'){outgoing={event:'repair',station:Number(event.station),by:peer.id};}
    else if(event.action==='vote'){result=castVote(round,peer.id,event.candidateId);if(!result.error){outgoing={event:'voted',voterId:peer.id};if(result.complete){const vote=resolveVote(round,now);if(vote){this.emitRound(room,{event:'ejected',...vote.event});winner=vote.winner;}}}}
    else if(event.action==='tick'){const moved=advanceMeeting(round,now);if(moved)outgoing={event:'meeting',...moved.event};const vote=resolveVote(round,now);if(vote){this.emitRound(room,{event:'ejected',...vote.event});winner=vote.winner;}}
    else return;
    if(result?.error){this.send(ws,'error',{message:result.error});return;}
    if(outgoing?.event==='meeting')for(const member of room.members)this.grantTeleport(member.id);
    if(outgoing)this.emitRound(room,outgoing);
    if(winner)await this.finishRound(room,winner);else await this.persistRooms();
    // Any action that opens or advances a meeting moves the deadline.
    await this.scheduleMeetingAlarm();
  }
  // Credit everyone who was signed in. The scores come from the round, which
  // the server owns -- the browser only ever supplied the session token, so it
  // can say who it is but not what it earned.
  async awardMatch(room){
    if(!this.env.SUPABASE_URL||!this.env.SUPABASE_SECRET_KEY)return;
    const round=room.round;if(!round?.roster?.length)return;
    const rpc=restRpc(this.env.SUPABASE_URL,this.env.SUPABASE_SECRET_KEY);
    const winners=new Set(round.winnerIds||[]);
    await Promise.all(round.roster.map(async seat=>{
      const token=this.accountOf(seat.id);
      if(!token)return;                       // playing as a guest; nothing to credit
      try{
        const rows=await rpc('award_match',{p_token:token,p_kills:seat.score|0,
          p_deaths:seat.deaths|0,p_won:winners.has(seat.id)});
        const row=Array.isArray(rows)?rows[0]:rows;
        if(!row||row.error)return;
        const target=this.peerSocket(seat.id);
        if(target)this.send(target,'progress',{
          exp:Number(row.exp),points:Number(row.points),
          gainedExp:Number(row.gained_exp),gainedPoints:Number(row.gained_points),
          matchesPlayed:row.matches_played,kills:row.kills,deaths:row.deaths,wins:row.wins});
      }catch(error){
        // A match must never fail to end because the database was slow.
        console.warn('Award failed for',seat.id,error?.detail||error?.message);
      }
    }));
  }
  accountOf(id){
    for(const ws of this.sockets()){
      const peer=this.attachment(ws);
      if(peer.id===id&&peer.account)return peer.account;
    }
    return null;
  }
  peerForAccount(token){
    let latest=null;
    for(const ws of this.sockets()){
      const peer=this.attachment(ws);
      if(peer.account===token&&(!latest||(peer.gen||0)>=(latest.gen||0)))latest=peer;
    }
    return latest;
  }
  async progressRequest(request,url){
    const origin=request.headers.get('Origin'),headers=origin?CORS(origin):{};
    if(request.method==='OPTIONS')return new Response(null,{status:204,headers});
    if(request.method!=='POST')return Response.json({error:'Method not allowed'},{status:405,headers});
    if(!this.env.SUPABASE_URL||!this.env.SUPABASE_SECRET_KEY)
      return Response.json({error:'Accounts are not configured'},{status:503,headers});
    const body=await request.json().catch(()=>({}));
    const rpc=restRpc(this.env.SUPABASE_URL,this.env.SUPABASE_SECRET_KEY);
    try{
      const player=await playerForToken(rpc,body.token);
      if(!player)return Response.json({error:'Sign in to continue'},{status:401,headers});
      const peer=this.peerForAccount(body.token);
      if(!peer)return Response.json({error:'Enter Cebu before starting an activity'},{status:409,headers});
      const closeTo=(point,radius=13)=>Boolean(point&&Math.hypot(peer.x-point.x,peer.z-point.z)<=radius);
      const storageKey=`job:${player.id}`;
      const activityKey=`activity:${player.id}`;
      if(url.pathname==='/api/activity/start'){
        const activity=activityById(body.activityId);
        if(!activity)return Response.json({error:'Unknown activity'},{status:400,headers});
        if(this.roomOf(peer.id))return Response.json({error:'Leave the game room before joining a city activity'},{status:409,headers});
        if(peer.inCar||peer.flight)return Response.json({error:'Join this activity on foot'},{status:409,headers});
        if(!closeTo(activity.position,activity.radius+3))return Response.json({error:'Move closer to the activity marker'},{status:409,headers});
        const now=Date.now(),ticket={id:crypto.randomUUID(),activityId:activity.id,activeAt:now+activity.countdown*1000,expiresAt:now+(activity.countdown+activity.duration+10)*1000,nextCheckpoint:0};
        await this.ctx.storage.put(activityKey,ticket);
        return Response.json({activityTicket:ticket.id,activityId:activity.id},{headers});
      }
      if(url.pathname==='/api/activity/checkpoint'||url.pathname==='/api/activity/complete'){
        const ticket=await this.ctx.storage.get(activityKey),activity=ticket&&activityById(ticket.activityId);
        if(!ticket||ticket.id!==body.activityTicket||!activity||Date.now()>ticket.expiresAt){
          if(ticket)await this.ctx.storage.delete(activityKey);
          return Response.json({error:'That activity is no longer active'},{status:409,headers});
        }
        if(this.roomOf(peer.id))return Response.json({error:'City activities are unavailable inside game rooms'},{status:409,headers});
        if(peer.inCar||peer.flight)return Response.json({error:'This activity must be completed on foot'},{status:409,headers});
        if(Date.now()<ticket.activeAt)return Response.json({error:'Wait for the countdown'},{status:409,headers});
        if(url.pathname==='/api/activity/checkpoint'){
          if(body.index!==ticket.nextCheckpoint)return Response.json({error:'Checkpoint is out of order'},{status:409,headers});
          if(!closeTo(activity.checkpoints[ticket.nextCheckpoint],6.5))return Response.json({error:'Move closer to the checkpoint'},{status:409,headers});
          ticket.nextCheckpoint++;await this.ctx.storage.put(activityKey,ticket);
          return Response.json({nextCheckpoint:ticket.nextCheckpoint,complete:ticket.nextCheckpoint>=activity.checkpoints.length},{headers});
        }
        if(ticket.nextCheckpoint<activity.checkpoints.length)return Response.json({error:'Complete every checkpoint first'},{status:409,headers});
        if(ticket.completing)return Response.json({error:'Activity reward is already being saved'},{status:409,headers});
        ticket.completing=true;await this.ctx.storage.put(activityKey,ticket);
        const elapsedMs=Math.max(0,Date.now()-ticket.activeAt);
        const rows=await rpc('award_activity',{p_token:body.token,p_activity:activity.id,p_elapsed_ms:elapsedMs}),row=Array.isArray(rows)?rows[0]:rows;
        if(!row||row.error){ticket.completing=false;await this.ctx.storage.put(activityKey,ticket);return Response.json({error:row?.error||'Reward could not be saved'},{status:409,headers});}
        await this.ctx.storage.delete(activityKey);
        return Response.json({exp:Number(row.exp),gainedExp:Number(row.gained_exp),completedActivities:Number(row.completed_activities),activityWins:Number(row.activity_wins),bestSkylineSprintMs:Number(row.best_time_ms),elapsedMs},{headers});
      }
      if(url.pathname==='/api/job/start'){
        const rule=JOB_RULES[body.kind];
        if(!rule)return Response.json({error:'Unknown job'},{status:400,headers});
        if(this.roomOf(peer.id))return Response.json({error:'Leave the game room before starting a city job'},{status:409,headers});
        if(!closeTo(rule.hub,16))return Response.json({error:'Go to the job marker first'},{status:409,headers});
        const ticket={id:crypto.randomUUID(),kind:body.kind,startedAt:Date.now(),expiresAt:Date.now()+360000,minimumMs:rule.minimumMs,nextCheckpoint:0};
        await this.ctx.storage.put(storageKey,ticket);
        return Response.json({jobId:ticket.id,kind:ticket.kind},{headers});
      }
      if(url.pathname==='/api/garage/engine'){
        if(!peer.inCar)return Response.json({error:'Bring a car into the garage to upgrade it'},{status:409,headers});
        if(!closeTo(GARAGE_POINT,16))return Response.json({error:'Drive to the district garage first'},{status:409,headers});
        const rows=await rpc('buy_engine_upgrade',{p_token:body.token}),row=Array.isArray(rows)?rows[0]:rows;
        if(!row||row.error)return Response.json({error:row?.error||'Upgrade could not be saved'},{status:409,headers});
        return Response.json({money:Number(row.money),exp:Number(row.exp),streetRep:Number(row.street_rep),engineLevel:Number(row.engine_level),completedJobs:Number(row.completed_jobs),price:Number(row.price)},{headers});
      }
      const ticket=await this.ctx.storage.get(storageKey),rule=ticket&&JOB_RULES[ticket.kind];
      if(!ticket||ticket.id!==body.jobId||!rule||Date.now()>ticket.expiresAt){
        if(ticket)await this.ctx.storage.delete(storageKey);
        return Response.json({error:'That job is no longer active'},{status:409,headers});
      }
      if(url.pathname==='/api/job/checkpoint'){
        if(body.index!==ticket.nextCheckpoint)return Response.json({error:'Checkpoint is out of order'},{status:409,headers});
        if(!closeTo(rule.route[ticket.nextCheckpoint]))return Response.json({error:'Move closer to the checkpoint'},{status:409,headers});
        ticket.nextCheckpoint++;
        await this.ctx.storage.put(storageKey,ticket);
        return Response.json({nextCheckpoint:ticket.nextCheckpoint,complete:ticket.nextCheckpoint>=rule.route.length},{headers});
      }
      if(ticket.nextCheckpoint<rule.route.length)return Response.json({error:'Complete every checkpoint first'},{status:409,headers});
      if(Date.now()-ticket.startedAt<ticket.minimumMs)return Response.json({error:'Job completed too quickly'},{status:409,headers});
      const rows=await rpc('award_open_world_job',{p_token:body.token,p_kind:ticket.kind}),row=Array.isArray(rows)?rows[0]:rows;
      if(!row||row.error)return Response.json({error:row?.error||'Reward could not be saved'},{status:409,headers});
      await this.ctx.storage.delete(storageKey);
      return Response.json({money:Number(row.money),exp:Number(row.exp),streetRep:Number(row.street_rep),engineLevel:Number(row.engine_level),completedJobs:Number(row.completed_jobs),gainedMoney:Number(row.gained_money),gainedExp:Number(row.gained_exp),gainedRep:Number(row.gained_rep)},{headers});
    }catch(error){
      console.warn('Progress request failed:',error?.detail||error?.message);
      return Response.json({error:'Something went wrong, try again'},{status:500,headers});
    }
  }
  async ffaAction(ws,peer,event){
    const room=this.roomOf(peer.id);if(room?.mode!=='ffa'||!room.round){this.send(ws,'error',{message:'You are not in a Free-for-All match'});return;}
    const now=Date.now();advanceFfa(room.round,now);let result;
    if(event.action==='shot')result=ffaShot(room.round,peer.id,event,this.positions(room),now);
    else if(event.action==='melee')result=ffaMelee(room.round,peer.id,event.targetId,this.positions(room),now);
    else if(event.action==='reload')result=ffaReload(room.round,peer.id,now);
    else if(event.action==='switch')result=ffaSwitch(room.round,peer.id,event.weapon);
    else if(event.action==='loadout')result=ffaSetPrimary(room.round,peer.id,event.weapon,now);
    else if(event.action==='claim')result=ffaClaimDrop(room.round,peer.id,this.positions(room),now);
    else if(event.action==='tick')result={};
    else return;
    if(result.error){this.send(ws,'error',{message:result.error});return;}this.emitFfa(room,result.event);if(room.round.phase==='ended'&&!room.round._closed){room.round._closed=true;this.emitFfa(room,{event:'ended',winnerIds:room.round.winnerIds});await this.awardMatch(room);room.phase='lobby';for(const member of room.members)member.ready=member.id===room.hostId;this.publishRoom(room);this.publishRoomList();await this.persistRooms();await this.scheduleMeetingAlarm();return;}
    // Ordinary shots and ticks: no storage write, no alarm sweep.
    this.persistSoon();
  }
  async scheduleFfaAlarm(){await this.scheduleMeetingAlarm();}
  // Meeting deadlines are driven by the Durable Object itself. Relying on a
  // client to notice the clock ran out meant a lagging, backgrounded or
  // departed client could leave the whole room stuck reading 0s.
  async scheduleMeetingAlarm(){
    let next=null;
    for(const room of this.rooms.values()){
      const until=room.round?.meetingUntil;
      if(until&&(room.round.phase==='meeting'||room.round.phase==='voting'))next=next?Math.min(next,until):until;
      if(room.mode==='ffa'&&room.round&&!room.round._closed){
        // Supply-drop deadlines belong here for the same reason every other
        // deadline does: left to a client tick, a crate appears late, or not at
        // all once everyone's tab is backgrounded.
        const round=room.round,candidates=[round.phase==='countdown'&&round.startsAt,round.phase==='playing'&&round.endsAt,round.phase==='sudden-death'&&round.suddenDeathEndsAt,
          !round.drop&&round.nextDropAt,
          round.drop?.state==='incoming'&&round.drop.landAt,
          round.drop?.state==='landed'&&round.drop.expireAt,
          ...round.roster.map(seat=>seat.respawnAt||seat.reloadingUntil)].filter(value=>Number.isFinite(value)&&value>Date.now());
        for(const value of candidates)next=next?Math.min(next,value):value;
      }
    }
    if(next)await this.ctx.storage.setAlarm(next);
  }
  async alarm(){
    await this.load();
    const now=Date.now();
    for(const room of this.rooms.values()){
      const round=room.round;
      if(!round||(round.phase!=='meeting'&&round.phase!=='voting'))continue;
      const moved=advanceMeeting(round,now);
      if(moved)this.emitRound(room,{event:'meeting',...moved.event});
      const vote=resolveVote(round,now);
      if(vote){
        this.emitRound(room,{event:'ejected',...vote.event});
        if(vote.winner){await this.finishRound(room,vote.winner);continue;}
      }
    }
    for(const room of this.rooms.values()){
      if(room.mode!=='ffa'||!room.round||room.round._closed)continue;
      const before=room.round.phase,events=advanceFfa(room.round,now);for(const event of events)this.emitFfa(room,event);if(events.length||before!==room.round.phase)this.emitFfa(room);
      if(room.round.phase==='ended'){room.round._closed=true;this.emitFfa(room,{event:'ended',winnerIds:room.round.winnerIds});await this.awardMatch(room);room.phase='lobby';for(const member of room.members)member.ready=member.id===room.hostId;this.publishRoom(room);this.publishRoomList();}
    }
    await this.persistRooms();
    // Chain to whichever deadline comes next; an alarm only fires once.
    await this.scheduleMeetingAlarm();
  }
  async webSocketClose(ws){
    const peer=this.attachment(ws);
    if(!peer.id)return;
    // Still a room member at this point; dropFromRoom runs further down.
    this.broadcastNear(peer.id,'left',{id:peer.id},peer.id);
    const current=this.peerSocket(peer.id);
    if(current&&current!==ws)return;   // replaced by a reconnect, still seated
    const room=this.roomOf(peer.id);
    if(room?.round&&room.round.phase!=='ended'){
      const member=room.members.find(entry=>entry.id===peer.id);
      if(member){member.online=false;member.leftAt=Date.now();}
      // The seat is held for their return, but it must not keep standing in the
      // arena: alive and unattended it froze where they dropped and respawned
      // after every death, which is the clone people were farming kills on.
      if(room.mode==='ffa'){
        const event=ffaSetOnline(room.round,peer.id,false);
        if(event)this.emitFfa(room,event);
      }
      await this.persistRooms();this.publishRoom(room);
      return;                          // seat kept for them to come back to
    }
    await this.dropFromRoom(peer.id);
  }
  // Sweeps rooms whose members are all long gone. Without this, anything left
  // behind by an earlier crash or an unclean disconnect sits in the browser
  // forever advertising a lobby nobody is in.
  async pruneRooms(){
    let changed=false;
    for(const room of [...this.rooms.values()]){
      const before=room.members.length;
      const playing=room.round&&room.round.phase!=='ended';
      room.members=room.members.filter(member=>{
        if(this.peerSocket(member.id))return true;
        // Mid round, give them a few minutes to get back before the seat goes.
        return Boolean(playing&&member.leftAt&&Date.now()-member.leftAt<180000);
      });
      if(room.members.length!==before)changed=true;
      if(!room.members.length){this.rooms.delete(room.id);changed=true;continue;}
      if(!room.members.some(member=>member.id===room.hostId)){room.hostId=room.members[0].id;changed=true;}
    }
    if(changed){await this.persistRooms();this.publishRoomList();}
    return changed;
  }
  async webSocketError(ws){await this.webSocketClose(ws);}
}

// Player accounts. The browser talks to this Worker, and this Worker talks to
// Supabase over HTTPS -- a Worker cannot open a TLS Postgres connection, and
// the secret key must never reach a browser, so it is held here as an
// encrypted secret and used only server side.
//
// The work itself is in Postgres functions, so this is transport and nothing
// more: the same calls the dev server makes through the driver.
const CORS = origin => ({
  'Access-Control-Allow-Origin': origin,
  'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
  'Access-Control-Allow-Headers': 'content-type',
  'Vary': 'Origin'
});

async function accountRoute(request,env,url,origin){
  const headers = origin ? CORS(origin) : {};
  if(request.method==='OPTIONS')return new Response(null,{status:204,headers});
  if(!env.SUPABASE_URL||!env.SUPABASE_SECRET_KEY)
    return Response.json({error:'Accounts are not configured'},{status:503,headers});

  const rpc = restRpc(env.SUPABASE_URL, env.SUPABASE_SECRET_KEY);
  const agent = request.headers.get('User-Agent') || '';
  const body = request.method==='POST'
    ? await request.json().catch(()=>({}))
    : {};
  try{
    if(url.pathname==='/api/register'&&request.method==='POST'){
      const result=await registerPlayer(rpc,{name:body.name,email:body.email,password:body.password,userAgent:agent});
      if(result.error)return Response.json({error:result.error},{status:400,headers});
      return Response.json({player:result.player,token:result.token},{status:201,headers});
    }
    if(url.pathname==='/api/login'&&request.method==='POST'){
      const result=await loginPlayer(rpc,{name:body.name,password:body.password,userAgent:agent});
      // 401, not 400: the credentials were understood and rejected.
      if(result.error)return Response.json({error:result.error},{status:401,headers});
      return Response.json({player:result.player,token:result.token},{headers});
    }
    if(url.pathname==='/api/logout'&&request.method==='POST'){
      await logoutPlayer(rpc,body.token);
      return Response.json({ok:true},{headers});
    }
    if(url.pathname==='/api/me'&&request.method==='GET'){
      const player=await playerForToken(rpc,url.searchParams.get('token'));
      if(!player)return Response.json({error:'Not signed in'},{status:401,headers});
      return Response.json({player},{headers});
    }
    if(url.pathname==='/api/appearance'&&request.method==='GET'){
      const wardrobe=await wardrobeForToken(rpc,url.searchParams.get('token'));
      if(!wardrobe)return Response.json({error:'Not signed in'},{status:401,headers});
      return Response.json({wardrobe},{headers});
    }
    if(url.pathname==='/api/appearance'&&request.method==='POST'){
      const wardrobe=await saveWardrobe(rpc,{token:body.token,character:body.character,appearance:body.appearance});
      if(!wardrobe)return Response.json({error:'Not signed in'},{status:401,headers});
      return Response.json({wardrobe},{headers});
    }
  }catch(error){
    // Never hand a database message to the browser; it can carry SQL.
    console.warn('Account request failed:',error?.detail||error?.message);
    return Response.json({error:'Something went wrong, try again'},{status:500,headers});
  }
  return Response.json({error:'Method not allowed'},{status:405,headers});
}

const ACCOUNT_PATHS=new Set(['/api/register','/api/login','/api/logout','/api/me','/api/appearance']);

export default {
  async fetch(request,env){
    const url=new URL(request.url),origin=request.headers.get('Origin');
    const allowed=new Set((env.ALLOWED_ORIGINS||'https://dz.jmgaming.site').split(',').map(item=>item.trim()));
    if(origin&&!allowed.has(origin))return new Response('Origin rejected',{status:403});
    if(url.pathname==='/health'||url.pathname==='/api/health')return Response.json({online:true,backend:'cloudflare-durable-objects'});
    // Accounts are plain request/response and never touch the Durable Object;
    // there is no shared state to coordinate, so there is no reason to wake it.
    if(ACCOUNT_PATHS.has(url.pathname))return accountRoute(request,env,url,origin);
    if(JOB_PATHS.has(url.pathname))return env.DISTRICT.getByName('global').fetch(request);
    if(url.pathname!=='/api/ws')return new Response('Not found',{status:404});
    return env.DISTRICT.getByName('global').fetch(request);
  }
};
