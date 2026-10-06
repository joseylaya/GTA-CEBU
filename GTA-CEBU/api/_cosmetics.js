import { normalizeAppearance } from '../src/appearance.js';

export const STARTER_COSMETICS=[
  'character:Atlas','character:Nova',
  ...Array.from({length:4},(_,i)=>`skin:${i}`),
  ...Array.from({length:4},(_,i)=>`hair:${i}`),
  ...Array.from({length:5},(_,i)=>`shirt:${i}`),
  ...Array.from({length:4},(_,i)=>`pants:${i}`),
  ...Array.from({length:3},(_,i)=>`top:${i}`),
  ...Array.from({length:3},(_,i)=>`haircut:${i}`)
];
const CHARACTERS=new Set(['Atlas','Nova']);
export function normalizeLoadout(value,owned=STARTER_COSMETICS){
  const ownedSet=new Set(Array.isArray(owned)?owned:STARTER_COSMETICS);
  const appearance=normalizeAppearance(value?.appearance||value);
  for(const [slot,index] of Object.entries(appearance))if(!ownedSet.has(`${slot}:${index}`))appearance[slot]=0;
  const requested=CHARACTERS.has(value?.character)?value.character:'Atlas';
  const character=ownedSet.has(`character:${requested}`)?requested:'Atlas';
  return {character,appearance};
}
export async function wardrobeForToken(rpc,token){
  const rows=await rpc('player_wardrobe',{p_token:String(token||'')});
  const row=Array.isArray(rows)?rows[0]:rows;if(!row||row.error)return null;
  const owned=Array.isArray(row.owned_cosmetics)&&row.owned_cosmetics.length?row.owned_cosmetics:STARTER_COSMETICS;
  return {...normalizeLoadout({character:row.character,appearance:row.appearance},owned),owned};
}
export async function saveWardrobe(rpc,{token,character,appearance}){
  const rows=await rpc('save_player_wardrobe',{p_token:String(token||''),p_character:String(character||''),p_appearance:normalizeAppearance(appearance)});
  const row=Array.isArray(rows)?rows[0]:rows;if(!row||row.error)return null;
  const owned=Array.isArray(row.owned_cosmetics)&&row.owned_cosmetics.length?row.owned_cosmetics:STARTER_COSMETICS;
  return {...normalizeLoadout({character:row.character,appearance:row.appearance},owned),owned};
}
