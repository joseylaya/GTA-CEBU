export const defaultBindings={
  forward:'KeyW',back:'KeyS',left:'KeyA',right:'KeyD',sprint:'ShiftLeft',
  jump:'Space',interact:'KeyE',reload:'KeyR',fists:'Digit1',pistol:'Digit2',switchWeapon:'KeyQ',chat:'Enter'
};

let saved={};
try{saved=JSON.parse(localStorage.getItem('districtZeroSettings')||'{}')||{};}catch{}
const limit=(value,min,max,fallback)=>Number.isFinite(Number(value))?Math.max(min,Math.min(max,Number(value))):fallback;
export const settings={
  sensitivity:limit(saved.sensitivity,.4,2,1),
  volume:limit(saved.volume,0,1,.8),
  hudScale:limit(saved.hudScale,.8,1.4,1),
  bindings:{...defaultBindings}
};
if(saved.bindings&&typeof saved.bindings==='object'){
  const proposed={...defaultBindings,...saved.bindings},seen=new Set();
  for(const action of Object.keys(defaultBindings)){
    const code=proposed[action];
    if(typeof code==='string'&&code!=='KeyT'&&/^(Key[A-Z]|Digit[0-9]|Enter|Space|ShiftLeft|ShiftRight|ControlLeft|ControlRight|ArrowUp|ArrowDown|ArrowLeft|ArrowRight)$/.test(code)&&!seen.has(code)){settings.bindings[action]=code;seen.add(code);}
    else{settings.bindings[action]=defaultBindings[action];seen.add(defaultBindings[action]);}
  }
}
export function saveSettings(){try{localStorage.setItem('districtZeroSettings',JSON.stringify(settings));}catch{}}
export function keyLabel(code){return code.replace(/^Key/,'').replace(/^Digit/,'').replace('ShiftLeft','LEFT SHIFT').replace('ShiftRight','RIGHT SHIFT').replace('ControlLeft','LEFT CTRL').replace('ControlRight','RIGHT CTRL').replace('Space','SPACE');}
