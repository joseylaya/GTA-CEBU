import { district } from './geography.js';

// Chowking's Central Bloc branch is listed by Ayala on I. Villa Street.
// The point marks that side of the mapped mall footprint; individual unit geometry is illustrative.
const additions=[{id:'chowking-central-bloc',name:'Chowking',kind:'fast_food',point:[133,-90],building:'Ayala Malls Central Bloc',street:'I. Villa Street',source:'https://ayalamalls.giftaway.ph/card/ayalamalls'}];
export const places=[...district.places,...additions];

export function placeStyle(name,kind){
  if(name==='Jollibee')return {background:'#ba272c',foreground:'#fff4d8',priority:10};
  if(name==='Chowking')return {background:'#bd242c',foreground:'#ffe5b5',priority:10};
  if(name==='Starbucks')return {background:'#17684d',foreground:'#fff8e8',priority:10};
  if(name==="McDonald's")return {background:'#a92e2b',foreground:'#ffe777',priority:9};
  if(name==='KFC')return {background:'#a9222b',foreground:'#fff6ed',priority:9};
  if(name==='7-Eleven')return {background:'#286b4b',foreground:'#f2eee3',priority:8};
  if(name==='Mercury Drug')return {background:'#c12b39',foreground:'#fff8ed',priority:8};
  if(name==='Shakey\'s'||name==='Krispy Kreme')return {background:'#9c3d2b',foreground:'#fff5db',priority:8};
  if(['cafe','coffee'].includes(kind))return {background:'#54423b',foreground:'#fff1d6',priority:5};
  if(['fast_food','restaurant','food_court','bakery'].includes(kind))return {background:'#74452e',foreground:'#fff0d7',priority:4};
  if(['bank','pharmacy','supermarket','convenience'].includes(kind))return {background:'#315967',foreground:'#edf5ed',priority:4};
  return {background:'#334d53',foreground:'#eaf0e9',priority:1};
}
export const featuredPlaces=places.filter(p=>placeStyle(p.name,p.kind).priority>=8);
