import test from 'node:test';
import assert from 'node:assert/strict';
import {createFfaRound,ffaShot,advanceFfa,shotBlocked} from '../api/_ffa.js';
import {publicRoom,startBlocker,joinableRoom} from '../api/_rooms.js';
import {createRound,applyKill,openMeeting,castVote} from '../api/_rounds.js';
import {ActivityManager,ACTIVITY_STATES,activityById} from '../src/activities.js';

const member=(id,ready=true)=>({id,name:id,ready,character:'Henry',loadout:'smg'});

test('FFA room requires two ready players',()=>{
  const room={id:'r',name:'Arena',mode:'ffa',hostId:'a',phase:'lobby',npcCount:0,members:[member('a')]};
  assert.match(startBlocker(room),/Needs 2 players/);
  room.members.push(member('b',false));
  assert.match(startBlocker(room),/Waiting for b/);
  room.members[1].ready=true;
  assert.equal(startBlocker(room),null);
});

test('FFA map and joinable state survive public serialization',()=>{
  const room={id:'r',name:'Office',mode:'ffa',hostId:'a',phase:'playing',npcCount:0,mapId:'office',durationMinutes:5,members:[member('a'),member('b')]};
  room.round=createFfaRound(room,1000);
  assert.equal(publicRoom(room).mapId,'office');
  assert.equal(joinableRoom(room),true);
});

test('FFA rejects duplicate shots and owns damage',()=>{
  const room={mode:'ffa',mapId:'it-park',durationMinutes:5,members:[member('a'),member('b')]};
  const round=createFfaRound(room,0);advanceFfa(round,4000);
  const positions={a:{x:0,y:0,z:0},b:{x:0,y:0,z:-10}};
  const payload={shotId:'one',weapon:'smg',targetId:'b',origin:{x:0,y:2.65,z:0},direction:{x:0,y:0,z:-1}};
  const hit=ffaShot(round,'a',payload,positions,5000);
  assert.equal(hit.event.event,'hit');
  assert.ok(round.roster.find(seat=>seat.id==='b').health<100);
  assert.equal(ffaShot(round,'a',payload,positions,6000).error,'Duplicate shot');
});

test('Office walls block server-authoritative shots',()=>{
  assert.equal(shotBlocked('office',{x:280,y:2.65,z:0},{x:1,y:0,z:0},40),true);
  assert.equal(shotBlocked('office',{x:265,y:2.65,z:0},{x:1,y:0,z:0},12),false);
  assert.equal(shotBlocked('it-park',{x:280,y:2.65,z:0},{x:1,y:0,z:0},40),false);
});

test('deduction rules enforce role, distance, and one vote',()=>{
  const room={hostId:'a',npcCount:0,members:[member('a'),member('b')]};
  const round=createRound(room,{seed:1,roles:{a:'impostor',b:'crewmate'},npcNames:[],npcImpostors:[]});
  assert.equal(applyKill(round,'b','a',{a:{x:0,z:0},b:{x:0,z:0}},1000).error,'Only the impostor can do that');
  assert.equal(applyKill(round,'a','b',{a:{x:0,z:0},b:{x:20,z:0}},1000).error,'Move closer');
  const meeting=openMeeting(round,'a',null,2000);
  assert.equal(meeting.event.stage,'discussion');
  round.phase='voting';
  assert.equal(castVote(round,'a','skip').error,undefined);
  assert.equal(castVote(round,'a','skip').error,'You already voted');
});

test('Skyline Sprint completes the reusable activity lifecycle in order',async()=>{
  const activity=activityById('skyline-sprint');
  assert.ok(activity.position&&activity.checkpoints.every(Boolean));
  let position={...activity.position},result=null;
  const calls=[];
  const manager=new ActivityManager({
    getPosition:()=>position,isEligible:()=>true,
    request:async(path,body)=>{
      calls.push([path,body]);
      if(path.endsWith('/start'))return {activityTicket:'ticket'};
      if(path.endsWith('/checkpoint'))return {nextCheckpoint:body.index+1,complete:body.index+1===activity.checkpoints.length};
      return {gainedExp:75,elapsedMs:12000};
    },
    onResult:value=>{result=value;}
  });
  assert.equal(await manager.join(activity.id),true);
  assert.equal(manager.state,ACTIVITY_STATES.COUNTDOWN);
  manager.countdownEnds=0;await manager.update();
  for(const checkpoint of activity.checkpoints){position={...checkpoint};await manager.update();}
  assert.equal(result.success,true);
  assert.equal(result.reward.gainedExp,75);
  assert.equal(manager.state,ACTIVITY_STATES.COOLDOWN);
  assert.deepEqual(calls.map(call=>call[0]),['/api/activity/start','/api/activity/checkpoint','/api/activity/checkpoint','/api/activity/checkpoint','/api/activity/complete']);
});
