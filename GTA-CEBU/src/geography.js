import district from './data/it-park.json' with {type:'json'};
export { WORLD, MAP_ID, SPAWN } from './map-config.js';
export { district };
const distance=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);
const point=p=>({x:p[0],z:p[1]});
const key=p=>p.x.toFixed(2)+','+p.z.toFixed(2);
export const roadSegments=district.roads.flatMap(road=>road.segments.map(([a,b])=>({a:point(a),b:point(b),name:road.name,width:road.width,walk:road.walk,kind:road.kind,oneway:road.oneway})));
const graph=new Map();
for(const segment of roadSegments.filter(s=>!s.walk&&s.kind!=='service')){
  for(const p of [segment.a,segment.b])if(!graph.has(key(p)))graph.set(key(p),{...p,edges:[],key:key(p)});
  const a=graph.get(key(segment.a)),b=graph.get(key(segment.b)),length=distance(a,b);
  a.edges.push({node:b,length});b.edges.push({node:a,length});segment.nodeA=a;segment.nodeB=b;
}
let largest=[];const visited=new Set();
for(const node of graph.values()){
  if(visited.has(node.key))continue;
  const component=[],queue=[node];visited.add(node.key);
  while(queue.length){const at=queue.pop();component.push(at);for(const edge of at.edges)if(!visited.has(edge.node.key)){visited.add(edge.node.key);queue.push(edge.node);}}
  if(component.length>largest.length)largest=component;
}
const mainKeys=new Set(largest.map(n=>n.key));
export const driveSegments=roadSegments.filter(s=>s.nodeA&&mainKeys.has(key(s.a)));
export function projectOnSegment(p,a,b){
  const dx=b.x-a.x,dz=b.z-a.z,t=Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.z-a.z)*dz)/(dx*dx+dz*dz||1)));
  return {x:a.x+dx*t,z:a.z+dz*t,t};
}
export function nearestRoad(p){
  let best=null;
  for(const segment of driveSegments){const q=projectOnSegment(p,segment.a,segment.b),d=distance(p,q);if(!best||d<best.distance)best={...q,distance:d,segment,name:segment.name};}
  return best;
}
export function routePoints(from,to){
  const start=nearestRoad(from),end=nearestRoad(to);
  if(!start||!end)return [from,to];
  if(start.segment===end.segment)return [from,start,end,to].filter((p,i,a)=>i===0||distance(p,a[i-1])>.3);
  const costs=new Map(),previous=new Map(),queue=[];
  for(const node of [start.segment.nodeA,start.segment.nodeB]){costs.set(node.key,distance(start,node));queue.push({node,cost:distance(start,node)});}
  let finish=null,finishCost=Infinity;
  while(queue.length){
    queue.sort((a,b)=>b.cost-a.cost);const {node,cost}=queue.pop();
    if(cost!==costs.get(node.key)||cost>finishCost)continue;
    if(node===end.segment.nodeA||node===end.segment.nodeB){const total=cost+distance(node,end);if(total<finishCost){finish=node;finishCost=total;}}
    for(const edge of node.edges){const next=cost+edge.length;if(next<(costs.get(edge.node.key)??Infinity)){costs.set(edge.node.key,next);previous.set(edge.node.key,node);queue.push({node:edge.node,cost:next});}}
  }
  if(!finish)return [from,start];
  const path=[];for(let at=finish;at;at=previous.get(at.key))path.unshift({x:at.x,z:at.z});
  return [from,{x:start.x,z:start.z},...path,{x:end.x,z:end.z},to].filter((p,i,a)=>i===0||distance(p,a[i-1])>.3);
}
export function polygonCenter(points){return {x:points.reduce((sum,p)=>sum+p[0],0)/points.length,z:points.reduce((sum,p)=>sum+p[1],0)/points.length};}
const landmarkNames=['The Walk','Ayala Malls Central Bloc','Garden Bloc','Calyx Centre','eBloc 1 Tower','eBloc 2 Tower','eBloc 3 Tower','eBloc 4 Tower','TGU Tower','Skyrise 1','Skyrise 3','Skyrise 4','HM Tower','38 Park Avenue','Avída Towers Riala','Avida Towers Cebu','Seda Hotel','Globe Telecom Tower'];
export const landmarks=landmarkNames.map(name=>{
  const feature=[...district.buildings,...district.parks].find(b=>b.name===name);if(!feature)return null;
  const center=polygonCenter(feature.points),road=nearestRoad(center),length=distance(center,road)||1;
  return {name,kind:feature.kind||'park',...center,roadPoint:{x:road.x,z:road.z},entrance:{x:road.x+(center.x-road.x)/length*(road.segment.width/2+2.5),z:road.z+(center.z-road.z)/length*(road.segment.width/2+2.5)}};
}).filter(Boolean);
export const landmark=name=>landmarks.find(p=>p.name===name);
export function trafficLoop(names){
  const stops=names.map(name=>landmark(name)?.roadPoint).filter(Boolean),route=[];
  for(let i=0;i<stops.length;i++)route.push(...routePoints(stops[i],stops[(i+1)%stops.length]).slice(0,-1));
  return route.filter((p,i,a)=>i===0||distance(p,a[i-1])>1);
}
