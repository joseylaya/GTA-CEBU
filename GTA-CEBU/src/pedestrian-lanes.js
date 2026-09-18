import { driveSegments, roadSegments, nearestRoad, landmarks } from './geography.js';
import { collides } from './world.js';

// Sample actual footways and the pavements on both sides of mapped streets.
// Links stay on a pavement or join nearby pavement ends at a junction.
const nodes=[];
const cellSize=6,cells=new Map(),junctions=new Map();
const cellKey=(x,z)=>`${Math.floor(x/cellSize)},${Math.floor(z/cellSize)}`;
function addNode(x,z,junction=null){
  if(collides(x,z,.7))return null;
  const node={id:nodes.length,x,z,edges:[]};nodes.push(node);
  const key=cellKey(x,z);if(!cells.has(key))cells.set(key,[]);cells.get(key).push(node);
  if(junction){if(!junctions.has(junction))junctions.set(junction,[]);junctions.get(junction).push(node);}
  return node;
}
function connect(a,b){if(!a||!b||a===b||a.edges.includes(b.id))return;a.edges.push(b.id);b.edges.push(a.id);}
for(const segment of [...driveSegments,...roadSegments.filter(s=>s.walk)]){
  const dx=segment.b.x-segment.a.x,dz=segment.b.z-segment.a.z,length=Math.hypot(dx,dz);
  if(length<5)continue;
  for(const side of segment.walk?[0]:[-1,1]){
    let previous=null;
    const count=Math.ceil(length/5);
    for(let i=0;i<=count;i++){
      const t=i/count,offset=side*(segment.width/2+2.5);
      const x=segment.a.x+dx*t-dz/length*offset,z=segment.a.z+dz*t+dx/length*offset;
      const junction=i===0?`${segment.a.x.toFixed(2)},${segment.a.z.toFixed(2)}`:i===count?`${segment.b.x.toFixed(2)},${segment.b.z.toFixed(2)}`:null;
      const node=addNode(x,z,junction);connect(previous,node);previous=node;
    }
  }
}
// At mapped street junctions, pedestrians may turn a corner or use a crossing.
for(const ends of junctions.values())for(let i=0;i<ends.length;i++)for(let j=i+1;j<ends.length;j++){
  const a=ends[i],b=ends[j],distance=Math.hypot(a.x-b.x,a.z-b.z);if(distance>24)continue;
  let clear=true;for(let step=1;step<4;step++){const x=a.x+(b.x-a.x)*step/4,z=a.z+(b.z-a.z)*step/4;if(collides(x,z,.5)){clear=false;break;}}
  if(clear)connect(a,b);
}
// Corner links are short and must remain outside the vehicle carriageway.
for(const node of nodes){
  const cx=Math.floor(node.x/cellSize),cz=Math.floor(node.z/cellSize);
  for(let x=cx-1;x<=cx+1;x++)for(let z=cz-1;z<=cz+1;z++)for(const other of cells.get(`${x},${z}`)||[]){
    if(other.id<=node.id||node.edges.includes(other.id))continue;
    const d=Math.hypot(node.x-other.x,node.z-other.z);if(d>3.6)continue;
    const middle={x:(node.x+other.x)/2,z:(node.z+other.z)/2},road=nearestRoad(middle);
    if(!road||road.distance<road.segment.width/2+.65||collides(middle.x,middle.z,.65))continue;
    connect(node,other);
  }
}
const visited=new Set();let mainIds=[];
for(const node of nodes){
  if(visited.has(node.id))continue;
  const component=[node.id];visited.add(node.id);
  for(let i=0;i<component.length;i++)for(const next of nodes[component[i]].edges)if(!visited.has(next)){visited.add(next);component.push(next);}
  if(component.length>mainIds.length)mainIds=component;
}
const mainSet=new Set(mainIds);
export { nodes as pedestrianNodes };
export const pedestrianSpots=nodes.filter(node=>mainSet.has(node.id));
export function closestPedestrianNode(point,maxDistance=Infinity){
  let best=null,bestDistance=maxDistance;
  for(const node of pedestrianSpots){const d=Math.hypot(node.x-point.x,node.z-point.z);if(d<bestDistance){best=node;bestDistance=d;}}
  return best;
}
export const pedestrianEntrances=landmarks.filter(p=>p.kind!=='park').map(p=>({name:p.name,point:p.entrance,node:closestPedestrianNode(p.entrance,6.5)})).filter(p=>{
  if(!p.node||collides(p.point.x,p.point.z,.65))return false;
  for(let i=1;i<5;i++){
    const x=p.node.x+(p.point.x-p.node.x)*i/5,z=p.node.z+(p.point.z-p.node.z)*i/5,road=nearestRoad({x,z});
    if(collides(x,z,.65)||road&&road.distance<road.segment.width/2+.3)return false;
  }
  return true;
});
export function pedestrianPath(startId,endId){
  if(startId===endId)return [startId];
  const seen=new Set([startId]),previous=new Map(),queue=[startId];
  for(let head=0;head<queue.length;head++){
    const at=queue[head];for(const next of nodes[at].edges){
      if(seen.has(next))continue;seen.add(next);previous.set(next,at);
      if(next===endId){const path=[endId];for(let id=endId;id!==startId;){id=previous.get(id);path.unshift(id);}return path;}
      queue.push(next);
    }
  }
  return null;
}
