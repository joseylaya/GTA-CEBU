import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { WORLD, district, driveSegments, nearestRoad, polygonCenter, projectOnSegment, landmarks } from './geography.js';
import { places, placeStyle } from './places.js';
export { WORLD };
export const solids=[],solidMeshes=[];
const cells=new Map(),CELL=32,geometry=new THREE.BoxGeometry(1,1,1);
const mat=(color,roughness=1)=>new THREE.MeshStandardMaterial({color,roughness});
export function box(parent,x,y,z,w,h,d,material,cast=true){const mesh=new THREE.Mesh(geometry,material);mesh.position.set(x,y,z);mesh.scale.set(w,h,d);mesh.castShadow=cast;mesh.receiveShadow=true;parent.add(mesh);return mesh;}
export function insidePolygon(x,z,points){let inside=false;for(let i=0,j=points.length-1;i<points.length;j=i++){const a=points[i],b=points[j];if((a[1]>z)!==(b[1]>z)&&x<(b[0]-a[0])*(z-a[1])/(b[1]-a[1])+a[0])inside=!inside;}return inside;}
function addSolid(s){solids.push(s);for(let x=Math.floor((s.x-s.w/2)/CELL);x<=Math.floor((s.x+s.w/2)/CELL);x++)for(let z=Math.floor((s.z-s.d/2)/CELL);z<=Math.floor((s.z+s.d/2)/CELL);z++){const key=x+','+z;if(!cells.has(key))cells.set(key,[]);cells.get(key).push(s);}}
for(const b of district.buildings){const xs=b.points.map(p=>p[0]),zs=b.points.map(p=>p[1]);addSolid({x:(Math.min(...xs)+Math.max(...xs))/2,z:(Math.min(...zs)+Math.max(...zs))/2,w:Math.max(...xs)-Math.min(...xs),d:Math.max(...zs)-Math.min(...zs),points:b.points,name:b.name});}
export function collides(x,z,r=1){
  if(x-r< -WORLD.halfX+1||x+r>WORLD.halfX-1||z-r< -WORLD.halfZ+1||z+r>WORLD.halfZ-1)return true;
  const candidates=new Set();for(let cx=Math.floor((x-r)/CELL);cx<=Math.floor((x+r)/CELL);cx++)for(let cz=Math.floor((z-r)/CELL);cz<=Math.floor((z+r)/CELL);cz++)for(const s of cells.get(cx+','+cz)||[])candidates.add(s);
  for(const s of candidates){if(Math.abs(x-s.x)>=s.w/2+r||Math.abs(z-s.z)>=s.d/2+r)continue;if(!s.points||insidePolygon(x,z,s.points))return true;for(let i=0;i<s.points.length;i++){const a=s.points[i],b=s.points[(i+1)%s.points.length],q=projectOnSegment({x,z},{x:a[0],z:a[1]},{x:b[0],z:b[1]});if(Math.hypot(x-q.x,z-q.z)<r)return true;}}
  return false;
}
export function lineBlocked(ax,az,bx,bz){const steps=Math.ceil(Math.hypot(bx-ax,bz-az)/2);for(let i=1;i<steps;i++)if(collides(ax+(bx-ax)*i/steps,az+(bz-az)*i/steps,.1))return true;return false;}
function polygonMesh(points,height,materials){const shape=new THREE.Shape(points.map(p=>new THREE.Vector2(p[0],-p[1])));const geo=new THREE.ExtrudeGeometry(shape,{depth:height,bevelEnabled:false,curveSegments:1});geo.rotateX(-Math.PI/2);const mesh=new THREE.Mesh(geo,materials);mesh.receiveShadow=true;mesh.castShadow=height>1;return mesh;}
function ribbon(vertices,a,b,width,y){const dx=b.x-a.x,dz=b.z-a.z,length=Math.hypot(dx,dz);if(length<.01)return;const nx=-dz/length*width/2,nz=dx/length*width/2,p=[[a.x+nx,y,a.z+nz],[a.x-nx,y,a.z-nz],[b.x+nx,y,b.z+nz],[b.x-nx,y,b.z-nz]];for(const i of [0,2,1,1,2,3])vertices.push(...p[i]);}
function drawRibbons(scene,vertices,material){const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));const uv=[];for(let i=0;i<vertices.length;i+=3)uv.push(vertices[i]/12,vertices[i+2]/12);geo.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));geo.computeVertexNormals();const mesh=new THREE.Mesh(geo,material);mesh.receiveShadow=true;scene.add(mesh);}
function roadJunctions(scene,segments,material,extra,y){
  const points=new Map();for(const s of segments)for(const p of [s.a,s.b]){const key=p.x.toFixed(2)+','+p.z.toFixed(2);points.set(key,{x:p.x,z:p.z,r:Math.max(points.get(key)?.r||0,(s.width+extra)/2)});}
  const mesh=new THREE.InstancedMesh(new THREE.CircleGeometry(1,12),material,points.size),dummy=new THREE.Object3D();let index=0;
  for(const p of points.values()){dummy.position.set(p.x,y,p.z);dummy.rotation.x=-Math.PI/2;dummy.scale.set(p.r,p.r,1);dummy.updateMatrix();mesh.setMatrixAt(index++,dummy.matrix);}
  mesh.instanceMatrix.needsUpdate=true;mesh.receiveShadow=true;scene.add(mesh);
}
function sign(parent,text,x,y,z,width,color='#f4d18a',target=null){
  const canvas=document.createElement('canvas');canvas.width=1024;canvas.height=128;const ctx=canvas.getContext('2d');ctx.fillStyle='#122c34';ctx.fillRect(0,0,1024,128);ctx.fillStyle=color;ctx.fillRect(0,117,1024,11);ctx.font='700 49px sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(text,512,61,980);
  const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;const mesh=new THREE.Mesh(new THREE.PlaneGeometry(width,width/8),new THREE.MeshBasicMaterial({map:texture,side:THREE.DoubleSide}));mesh.position.set(x,y,z);if(target)mesh.lookAt(target.x,y,target.z);parent.add(mesh);return mesh;
}
function boundaryNear(points,target){let best=null;for(let i=0;i<points.length;i++){const a=points[i],b=points[(i+1)%points.length],q=projectOnSegment(target,{x:a[0],z:a[1]},{x:b[0],z:b[1]}),d=Math.hypot(q.x-target.x,q.z-target.z);if(!best||d<best.distance)best={...q,distance:d,length:Math.hypot(a[0]-b[0],a[1]-b[1]),a,b};}return best;}
function streetTarget(place){
  const p={x:place.point[0],z:place.point[1]};
  if(!place.street)return nearestRoad(p);
  let best=null;for(const s of driveSegments.filter(s=>s.name===place.street)){const q=projectOnSegment(p,s.a,s.b),d=Math.hypot(q.x-p.x,q.z-p.z);if(!best||d<best.distance)best={...q,distance:d};}
  return best||nearestRoad(p);
}
function entrance(scene,front,target,label,width,style){
  const outward=new THREE.Vector2(target.x-front.x,target.z-front.z).normalize();
  if(!Number.isFinite(outward.x))return;
  const group=new THREE.Group();group.position.set(front.x+outward.x*.4,0,front.z+outward.y*.4);group.rotation.y=Math.atan2(outward.x,outward.y);scene.add(group);
  const w=Math.min(width,Math.max(2.6,front.length*.7)),dark=mat(0x172d32),metal=mat(0x829396,.5),glass=new THREE.MeshStandardMaterial({color:0x81b6bd,metalness:.25,roughness:.15,transparent:true,opacity:.77}),warm=new THREE.MeshBasicMaterial({color:0xe1bb7b});
  box(group,0,1.55,.02,w,3.1,.14,dark,false);
  box(group,0,1.45,.13,w-0.32,2.6,.06,warm,false);
  box(group,-w*.25,1.42,.25,w*.48,2.55,.08,glass,false);box(group,w*.25,1.42,.25,w*.48,2.55,.08,glass,false);
  for(const x of [-w/2,0,w/2])box(group,x,1.55,.32,.07,3.1,.1,metal,false);
  box(group,0,2.8,.32,w,.09,.12,metal,false);box(group,0,.18,.8,w+.7,.18,1.2,mat(0x9c9c8d),false);
  box(group,0,3.35,.48,w+.45,.3,1.25,mat(style?.background||0x304750),false);
  const c=document.createElement('canvas');c.width=1024;c.height=160;const ctx=c.getContext('2d');ctx.fillStyle=style?.background||'#18333b';ctx.fillRect(0,0,1024,160);ctx.fillStyle=style?.foreground||'#f3e1b4';ctx.font='bold 68px sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(label,512,80,940);
  const tex=new THREE.CanvasTexture(c);tex.colorSpace=THREE.SRGBColorSpace;
  const panel=new THREE.Mesh(new THREE.PlaneGeometry(w,1.02),new THREE.MeshBasicMaterial({map:tex,side:THREE.DoubleSide}));panel.position.set(0,3.54,1.11);group.add(panel);
}
function surfaceTexture(base,variation){
  const canvas=document.createElement('canvas');canvas.width=canvas.height=128;const c=canvas.getContext('2d');
  c.fillStyle=base;c.fillRect(0,0,128,128);
  let seed=7919;const random=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296;};
  for(let i=0;i<1800;i++){const shade=Math.round(random()*variation);c.fillStyle=`rgba(${shade},${shade},${shade},${.035+random()*.055})`;c.fillRect(random()*128,random()*128,1+random()*3,1+random()*3);}
  const t=new THREE.CanvasTexture(canvas);t.colorSpace=THREE.SRGBColorSpace;t.wrapS=t.wrapT=THREE.RepeatWrapping;t.anisotropy=4;return t;
}
function facadeTexture(){
  const canvas=document.createElement('canvas');canvas.width=canvas.height=256;const c=canvas.getContext('2d');
  c.fillStyle='#c1c9c6';c.fillRect(0,0,256,256);
  for(let floor=0;floor<4;floor++){
    const y=floor*64;c.fillStyle='#788989';c.fillRect(0,y+58,256,6);
    for(let col=0;col<2;col++){
      const x=col*128+17;c.fillStyle='#536b71';c.fillRect(x,y+8,94,45);
      c.fillStyle='#213a48';c.fillRect(x+5,y+11,84,38);
      c.fillStyle='#6b8f9e';c.fillRect(x+8,y+13,32,4);c.fillRect(x+47,y+17,23,3);
      c.fillStyle='#a9bdba';c.fillRect(x+46,y+10,3,42);c.fillRect(x+3,y+49,88,4);
    }
  }
  const t=new THREE.CanvasTexture(canvas);t.colorSpace=THREE.SRGBColorSpace;t.wrapS=t.wrapT=THREE.RepeatWrapping;t.repeat.set(.1,.1);t.anisotropy=4;return t;
}
function loadMegaKit(scene){
  const loader=new GLTFLoader(),base='/models/megakit/';
  const place=(asset,x,y,z,scale=1,turn=0)=>{
    const copy=asset.clone(true);copy.position.set(x,y,z);copy.scale.setScalar(scale);copy.rotation.y=turn;
    copy.traverse(child=>{if(child.isMesh){child.castShadow=scale>1;child.receiveShadow=true;}});
    scene.add(copy);return copy;
  };
  loader.load(base+'Prop_Planter_Single.gltf',gltf=>{
    let count=0;for(const [index,s] of driveSegments.entries()){
      if(index%17!==0||count>=16)continue;
      const length=Math.hypot(s.b.x-s.a.x,s.b.z-s.a.z);if(length<25)continue;
      const side=index%2?1:-1,x=(s.a.x+s.b.x)/2-(s.b.z-s.a.z)/length*(s.width/2+3)*side,z=(s.a.z+s.b.z)/2+(s.b.x-s.a.x)/length*(s.width/2+3)*side;
      if(collides(x,z,1.5))continue;
      place(gltf.scene,x,.08,z,1.3,index*.7);addSolid({x,z,w:2.6,d:2.6});count++;
    }
  },undefined,error=>console.warn('MegaKit planters unavailable:',error));
  loader.load(base+'Prop_Bollard.gltf',gltf=>{
    let count=0;for(const [index,s] of driveSegments.entries()){
      if(index%19!==0||count>=24)continue;
      const length=Math.hypot(s.b.x-s.a.x,s.b.z-s.a.z);if(length<18)continue;
      const side=index%2?1:-1,x=(s.a.x+s.b.x)/2-(s.b.z-s.a.z)/length*(s.width/2+1.2)*side,z=(s.a.z+s.b.z)/2+(s.b.x-s.a.x)/length*(s.width/2+1.2)*side;
      if(collides(x,z,.5))continue;place(gltf.scene,x,.08,z,1.15);count++;
    }
  },undefined,error=>console.warn('MegaKit bollards unavailable:',error));
  loader.load(base+'Prop_ManholeCover.gltf',gltf=>{
    let count=0;for(const [index,s] of driveSegments.entries()){
      if(index%23!==0||count>=18||s.width<7)continue;
      const x=(s.a.x+s.b.x)/2,z=(s.a.z+s.b.z)/2;if(collides(x,z,1))continue;
      place(gltf.scene,x,.11,z,1.15,index*.3);count++;
    }
  },undefined,error=>console.warn('MegaKit street details unavailable:',error));
  loader.load(base+'Prop_ACUnit.gltf',gltf=>{
    for(const b of district.buildings.filter(b=>!b.name&&b.height>10).slice(0,12)){
      const center=polygonCenter(b.points);if(insidePolygon(center.x,center.z,b.points))place(gltf.scene,center.x,b.height+.12,center.z,2,b.id%6);
    }
  },undefined,error=>console.warn('MegaKit rooftop details unavailable:',error));
}
export function createDistrict(scene){
  scene.background=new THREE.Color(0x92b6b5);scene.fog=new THREE.Fog(0x92b6b5,230,1000);
  const ambient=new THREE.HemisphereLight(0xe4f1f2,0x52694f,2);scene.add(ambient);const sun=new THREE.DirectionalLight(0xffe4b4,2.4);sun.position.set(-260,480,160);sun.castShadow=true;sun.shadow.mapSize.set(2048,2048);Object.assign(sun.shadow.camera,{left:-450,right:450,top:490,bottom:-490,near:1,far:1100});sun.shadow.bias=-.0003;scene.add(sun);
  const pavement=new THREE.MeshStandardMaterial({map:surfaceTexture('#b8b8ad',55),roughness:1});
  const asphalt=new THREE.MeshStandardMaterial({map:surfaceTexture('#465158',50),roughness:.98});
  const grassTexture=surfaceTexture('#748d68',80);grassTexture.repeat.set(44,55);
  const grass=new THREE.MeshStandardMaterial({map:grassTexture,roughness:1});
  const roof=mat(0x8b9693),trim=mat(0x304750),bark=mat(0x796047),leaf=mat(0xffffff);
  box(scene,0,-.6,0,WORLD.halfX*2+30,1,WORLD.halfZ*2+30,grass,false);
  for(const park of district.parks){const mesh=polygonMesh(park.points,.12,mat(park.name==='Garden Bloc'?0x729966:0x819970));mesh.position.y=-.04;scene.add(mesh);}
  const streetVertices=[],walkVertices=[],lineVertices=[];
  for(const s of driveSegments){ribbon(walkVertices,s.a,s.b,s.width+5,.035);ribbon(streetVertices,s.a,s.b,s.width,.075);const dx=s.b.x-s.a.x,dz=s.b.z-s.a.z,length=Math.hypot(dx,dz);if(s.width>=8)for(let d=2;d<length-2;d+=10){const end=Math.min(length-1,d+3.5);ribbon(lineVertices,{x:s.a.x+dx*d/length,z:s.a.z+dz*d/length},{x:s.a.x+dx*end/length,z:s.a.z+dz*end/length},.17,.095);}}
  drawRibbons(scene,walkVertices,pavement);roadJunctions(scene,driveSegments,pavement,5,.036);
  drawRibbons(scene,streetVertices,asphalt);roadJunctions(scene,driveSegments,asphalt,0,.076);
  drawRibbons(scene,lineVertices,mat(0xe2d8ae));
  const windows=facadeTexture(),facades=[0xd2d8d2,0xb8cdd4,0xd6c4a8,0xa6b9c3,0xd6d0c3].map(color=>new THREE.MeshStandardMaterial({color,map:windows,roughness:.65}));
  for(const [index,b] of district.buildings.entries()){
    const h=b.height,center=polygonCenter(b.points),mesh=polygonMesh(b.points,h,[roof,facades[index%facades.length]]);scene.add(mesh);solidMeshes.push(mesh);
    const road=nearestRoad(center),front=boundaryNear(b.points,road),normal=new THREE.Vector2(road.x-front.x,road.z-front.z).normalize();
    if(b.name&&landmarks.some(p=>p.name===b.name))entrance(scene,front,road,b.name,Math.min(13,Math.max(6,front.length*.6)));
    if(b.name&&h>15)box(scene,center.x,h+.7,center.z,5,1.4,4,trim);
    if(b.name==='The Pyramid'){const pyramid=new THREE.Mesh(new THREE.ConeGeometry(12,14,4),new THREE.MeshStandardMaterial({color:0x769baf,metalness:.3,roughness:.3}));pyramid.position.set(center.x,h+7,center.z);pyramid.rotation.y=Math.PI/4;scene.add(pyramid);}
    if(b.name==='Avída Towers Riala'||b.name==='Avida Towers Cebu'){
      let count=0;const desired=b.name.includes('Riala')?5:2;
      for(let z=center.z-65;z<center.z+70&&count<desired;z+=42)for(let x=center.x-50;x<center.x+60&&count<desired;x+=40){if(![[-12,-12],[12,-12],[-12,12],[12,12]].every(([dx,dz])=>insidePolygon(x+dx,z+dz,b.points)))continue;box(scene,x,h+37+count*2,z,23,74+count*4,25,facades[(index+1)%facades.length]);count++;}
    }
  }
  const signedBuildings=new Map(),storeFronts=[];
  const shopKinds=new Set(['cafe','coffee','restaurant','fast_food','food_court','bakery','convenience','pharmacy','bank','supermarket']);
  for(const place of places.filter(p=>shopKinds.has(p.kind)).sort((a,b)=>placeStyle(b.name,b.kind).priority-placeStyle(a.name,a.kind).priority)){
    const b=place.building?district.buildings.find(b=>b.name===place.building):district.buildings.find(b=>insidePolygon(...place.point,b.points));if(!b)continue;
    const style=placeStyle(place.name,place.kind),count=signedBuildings.get(b.id)||0,max=b.name==='Ayala Malls Central Bloc'?5:b.name?3:2;
    if(count>=max||storeFronts.length>=55)continue;
    const road=streetTarget(place),front=boundaryNear(b.points,road);
    if(front.length<3||storeFronts.some(p=>p.building===b.id&&Math.hypot(p.x-front.x,p.z-front.z)<8))continue;
    entrance(scene,front,road,place.name,Math.min(style.priority>=8?8:6,front.length*.65),style);
    signedBuildings.set(b.id,count+1);storeFronts.push({building:b.id,x:front.x,z:front.z});
  }
  const streetSigns=new Set();
  for(const s of [...driveSegments].sort((a,b)=>Math.hypot(b.b.x-b.a.x,b.b.z-b.a.z)-Math.hypot(a.b.x-a.a.x,a.b.z-a.a.z))){
    if(streetSigns.has(s.name)||!s.name||s.name==='Access lane'||s.kind==='service')continue;
    const length=Math.hypot(s.b.x-s.a.x,s.b.z-s.a.z);if(length<25)continue;
    const dx=(s.b.x-s.a.x)/length,dz=(s.b.z-s.a.z)/length;
    for(const side of [1,-1]){
      const x=(s.a.x+s.b.x)/2-dz*(s.width/2+3)*side,z=(s.a.z+s.b.z)/2+dx*(s.width/2+3)*side;
      if(collides(x,z,1.2))continue;
      box(scene,x,2.25,z,.14,4.5,.14,mat(0x334b50),false);
      sign(scene,s.name,x,4.4,z,Math.min(8,Math.max(5,s.name.length*.38)),'#fff2c9',{x:x+dz,y:4.4,z:z-dx});
      streetSigns.add(s.name);break;
    }
  }
  const treePositions=district.trees.filter(([x,z])=>!collides(x,z,.6));
  for(const [index,s] of driveSegments.entries()){
    const length=Math.hypot(s.b.x-s.a.x,s.b.z-s.a.z);if(length<24||s.kind==='service')continue;
    for(let t=13;t<length;t+=26){const side=index%2?1:-1,x=s.a.x+(s.b.x-s.a.x)*t/length-(s.b.z-s.a.z)/length*(s.width/2+2.4)*side,z=s.a.z+(s.b.z-s.a.z)*t/length+(s.b.x-s.a.x)/length*(s.width/2+2.4)*side;if(!collides(x,z,1.4)&&nearestRoad({x,z}).distance>4&&!treePositions.some(p=>Math.hypot(p[0]-x,p[1]-z)<6))treePositions.push([x,z]);}
  }
  const trunks=new THREE.InstancedMesh(new THREE.CylinderGeometry(.28,.42,1,8),bark,treePositions.length),crowns=new THREE.InstancedMesh(new THREE.SphereGeometry(1,8,6),leaf,treePositions.length*2),dummy=new THREE.Object3D();
  treePositions.forEach(([x,z],i)=>{const height=4+(i%7)*.35;dummy.position.set(x,height/2,z);dummy.scale.set(1,height,1);dummy.updateMatrix();trunks.setMatrixAt(i,dummy.matrix);for(let j=0;j<2;j++){dummy.position.set(x+(j?1.1:-.4),height+j*.7,z+(j?.4:0));dummy.scale.set(2.6+j*.3,2.1,2.7);dummy.updateMatrix();crowns.setMatrixAt(i*2+j,dummy.matrix);crowns.setColorAt(i*2+j,new THREE.Color([0x4b7754,0x557f58,0x618960,0x477052][(i+j)%4]));}addSolid({x,z,w:.65,d:.65});});trunks.castShadow=crowns.castShadow=true;scene.add(trunks,crowns);
  const metal=mat(0x354e54),wood=mat(0xb1946c),warm=new THREE.MeshBasicMaterial({color:0xffe3a1});let furniture=0;
  for(const s of driveSegments){const length=Math.hypot(s.b.x-s.a.x,s.b.z-s.a.z);if(length<35)continue;const dx=(s.b.x-s.a.x)/length,dz=(s.b.z-s.a.z)/length,x=(s.a.x+s.b.x)/2-dz*(s.width/2+2),z=(s.a.z+s.b.z)/2+dx*(s.width/2+2);if(collides(x,z,1)||furniture++>55)continue;box(scene,x,3.5,z,.16,7,.16,metal);box(scene,x+dz*.65,7,z-dx*.65,1.8,.2,.6,warm,false);if(furniture%3===0){const bench=box(scene,x-dx*3,.7,z-dz*3,2.8,.22,.85,wood);bench.rotation.y=-Math.atan2(dz,dx);}}
  const garden=landmarks.find(p=>p.name==='Garden Bloc');if(garden){const lawn=district.parks.find(p=>p.name==='Garden Bloc');let stalls=0;for(let x=garden.x-30;x<=garden.x+30;x+=12){const z=garden.z+8;if(!insidePolygon(x,z,lawn.points)||collides(x,z,4))continue;const kiosk=box(scene,x,1.1,z,5,2.2,3,wood);solidMeshes.push(kiosk);addSolid({x,z,w:5,d:3});box(scene,x,2.5,z,6,.3,4,mat(stalls++%2?0xc58b55:0x4b9b86));sign(scene,'GARDEN EATS',x,2.3,z+1.6,4.7,'#ffe1a7');}}
  loadMegaKit(scene);
  return {sun,ambient};
}
