import * as THREE from 'three';

const boxGeometry=new THREE.BoxGeometry(1,1,1);
const material=(color,metalness=.35)=>new THREE.MeshStandardMaterial({color,metalness,roughness:.42});
function box(parent,x,y,z,w,h,d,mat){const mesh=new THREE.Mesh(boxGeometry,mat);mesh.position.set(x,y,z);mesh.scale.set(w,h,d);mesh.castShadow=true;parent.add(mesh);return mesh;}
function cylinder(parent,x,y,z,radius,length,mat,rotationX=0){const mesh=new THREE.Mesh(new THREE.CylinderGeometry(radius,radius,length,12),mat);mesh.position.set(x,y,z);mesh.rotation.x=rotationX;mesh.castShadow=true;parent.add(mesh);return mesh;}

export function createJetpackMesh(){
  const group=new THREE.Group(),steel=material(0x71878b),dark=material(0x233840),trim=material(0xe5a64c),flame=new THREE.MeshBasicMaterial({color:0xffa443,transparent:true,opacity:.84});
  box(group,0,2.05,-.58,.75,1.05,.34,dark);
  for(const side of [-1,1]){
    cylinder(group,side*.42,1.95,-.72,.25,1.25,steel);
    cylinder(group,side*.42,1.25,-.72,.29,.26,trim);
    const plume=new THREE.Mesh(new THREE.ConeGeometry(.2,.85,10),flame);plume.rotation.x=Math.PI;plume.position.set(side*.42,.68,-.72);group.add(plume);
  }
  group.userData.flames=group.children.filter(child=>child.geometry?.type==='ConeGeometry');
  return group;
}

export function createAircraftMesh(kind,police=false){
  const group=new THREE.Group(),body=material(kind==='jet'?0x657a86:police?0x315d82:0x384c45),dark=material(0x1b2b35),accent=material(kind==='jet'?0xc9d7d6:police?0xf0f2e8:0xb0ab83),glass=new THREE.MeshStandardMaterial({color:0x5290a2,metalness:.35,roughness:.12,transparent:police,opacity:police?.58:1});
  if(kind==='jet'){
    box(group,0,1.75,0,2.5,.9,9,body);
    const nose=new THREE.Mesh(new THREE.ConeGeometry(1.25,3.2,4),body);nose.rotation.x=Math.PI/2;nose.rotation.y=Math.PI/4;nose.position.set(0,1.75,6);group.add(nose);
    box(group,0,2.15,1.5,1.7,.6,2.2,glass);
    for(const side of [-1,1]){
      const wing=box(group,side*3.45,1.55,-.4,5.2,.22,3.2,body);wing.rotation.y=side*.17;
      box(group,side*1.35,2.6,-3.3,.2,2,.8,accent);
      cylinder(group,side*.68,1.7,-4.7,.48,1.1,dark,Math.PI/2);
    }
    box(group,0,.75,2.5,.22,.8,.22,dark);box(group,0,.55,-3.2,.22,.8,.22,dark);
  }else{
    box(group,0,1.7,.4,2.35,1.65,6.3,body);
    box(group,0,1.95,2.65,1.8,.95,1.1,glass);
    box(group,0,1.7,-4.2,.55,.55,4.3,body);
    box(group,0,2.05,-5.9,2.1,.15,.65,accent);
    for(const side of [-1,1]){
      box(group,side*1.9,1.38,.1,2.1,.17,1.15,body);
      box(group,side*1.3,.36,.2,.12,.16,5.7,dark);
      box(group,side*1.3,.75,-1.8,.12,.8,.12,dark);box(group,side*1.3,.75,2.1,.12,.8,.12,dark);
    }
    cylinder(group,0,3.25,0,.13,.65,dark);
    const rotor=new THREE.Group();rotor.position.y=3.63;
    box(rotor,0,0,0,11,.08,.28,accent);box(rotor,0,0,0,.28,.08,11,accent);
    group.add(rotor);group.userData.rotor=rotor;
    const tailRotor=box(group,.45,2,-6.1,.08,1.6,.13,accent);group.userData.tailRotor=tailRotor;
    if(police){
      const red=new THREE.MeshBasicMaterial({color:0xff3d48}),blue=new THREE.MeshBasicMaterial({color:0x4ea8ff});
      box(group,-.85,2.72,1.7,.38,.18,.38,red);
      box(group,.85,2.72,1.7,.38,.18,.38,blue);
    }
  }
  return group;
}

export function animateAircraft(mesh,kind,dt,active=true){
  if(kind==='helicopter'){
    mesh.userData.rotor.rotation.y+=dt*(active?24:5);
    mesh.userData.tailRotor.rotation.z+=dt*(active?30:6);
  }
}
