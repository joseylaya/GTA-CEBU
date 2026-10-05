import {landmark} from './geography.js';

const point=name=>{
  const value=landmark(name)?.roadPoint;
  return value?{x:value.x,z:value.z}:null;
};

export const ACTIVITY_STATES=Object.freeze({
  AVAILABLE:'available',COUNTDOWN:'countdown',ACTIVE:'active',COMPLETE:'complete',FAILED:'failed',COOLDOWN:'cooldown'
});

export const ACTIVITY_DEFINITIONS=Object.freeze([
  Object.freeze({
    id:'skyline-sprint',name:'SKYLINE SPRINT',type:'time-trial',
    position:point('TGU Tower'),radius:5.5,minimumPlayers:1,maximumPlayers:1,
    countdown:3,duration:90,cooldown:30,
    objective:'Sprint through the district checkpoints on foot.',
    checkpoints:[point('Calyx Centre'),point('The Walk'),point('TGU Tower')],
    reward:Object.freeze({xp:75}),
  })
]);

export const activityById=id=>ACTIVITY_DEFINITIONS.find(activity=>activity.id===id)||null;
export const distanceToActivity=(position,activity)=>Math.hypot(position.x-activity.position.x,position.z-activity.position.z);

export class ActivityManager{
  constructor({getPosition,isEligible,request,onState,onObjective,onResult}){
    this.getPosition=getPosition;this.isEligible=isEligible;this.request=request;
    this.onState=onState||(()=>{});this.onObjective=onObjective||(()=>{});this.onResult=onResult||(()=>{});
    this.state=ACTIVITY_STATES.AVAILABLE;this.activity=null;this.ticket=null;this.index=0;this.deadline=0;this.countdownEnds=0;this.cooldownEnds=0;this.busy=false;
  }
  nearby(){
    if(this.state!==ACTIVITY_STATES.AVAILABLE)return null;
    const position=this.getPosition();if(!position)return null;
    return ACTIVITY_DEFINITIONS.find(activity=>distanceToActivity(position,activity)<=activity.radius)||null;
  }
  async join(id){
    if(this.state!==ACTIVITY_STATES.AVAILABLE||this.busy)return false;
    const activity=activityById(id);if(!activity||!this.isEligible(activity))return false;
    this.busy=true;
    try{
      const ticket=await this.request('/api/activity/start',{activityId:id});
      this.activity=activity;this.ticket=ticket.activityTicket;this.index=0;
      this.state=ACTIVITY_STATES.COUNTDOWN;this.countdownEnds=performance.now()+activity.countdown*1000;
      this.onState(this.snapshot());return true;
    }finally{this.busy=false;}
  }
  async update(){
    if(!this.activity)return;
    const now=performance.now();
    if(this.state===ACTIVITY_STATES.COUNTDOWN){
      if(now<this.countdownEnds){this.onState(this.snapshot());return;}
      this.state=ACTIVITY_STATES.ACTIVE;this.deadline=now+this.activity.duration*1000;
      this.onObjective(this.activity.checkpoints[0]);this.onState(this.snapshot());return;
    }
    if(this.state===ACTIVITY_STATES.ACTIVE){
      if(now>=this.deadline){this.finish(false,'TIME EXPIRED');return;}
      if(this.busy)return;
      const checkpoint=this.activity.checkpoints[this.index],position=this.getPosition();
      if(!checkpoint||!position||Math.hypot(position.x-checkpoint.x,position.z-checkpoint.z)>5.5){this.onState(this.snapshot());return;}
      this.busy=true;
      try{
        const result=await this.request('/api/activity/checkpoint',{activityTicket:this.ticket,index:this.index});
        this.index=result.nextCheckpoint;
        if(result.complete){
          const reward=await this.request('/api/activity/complete',{activityTicket:this.ticket});
          this.finish(true,'COMPLETE',reward);return;
        }
        this.onObjective(this.activity.checkpoints[this.index]);this.onState(this.snapshot());
      }catch(error){this.finish(false,error.message||'ACTIVITY ENDED');}
      finally{this.busy=false;}
    }
    if(this.state===ACTIVITY_STATES.COOLDOWN&&now>=this.cooldownEnds)this.reset();
  }
  finish(success,message,reward=null){
    if(!this.activity)return;
    this.state=success?ACTIVITY_STATES.COMPLETE:ACTIVITY_STATES.FAILED;
    this.onObjective(null);this.onState(this.snapshot());
    this.onResult({success,message,reward,activity:this.activity,snapshot:this.snapshot()});
    this.state=ACTIVITY_STATES.COOLDOWN;this.cooldownEnds=performance.now()+this.activity.cooldown*1000;this.onState(this.snapshot());
  }
  cancel(message='ACTIVITY CANCELLED'){if(this.activity)this.finish(false,message);}
  reset(){this.state=ACTIVITY_STATES.AVAILABLE;this.activity=null;this.ticket=null;this.index=0;this.deadline=0;this.countdownEnds=0;this.cooldownEnds=0;this.onState(this.snapshot());}
  snapshot(){
    const now=performance.now();
    return {state:this.state,activity:this.activity,index:this.index,total:this.activity?.checkpoints.length||0,
      countdown:Math.max(0,Math.ceil((this.countdownEnds-now)/1000)),remaining:Math.max(0,Math.ceil((this.deadline-now)/1000)),
      cooldown:Math.max(0,Math.ceil((this.cooldownEnds-now)/1000))};
  }
}
