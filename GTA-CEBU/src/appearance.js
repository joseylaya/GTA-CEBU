export const APPEARANCE_OPTIONS={
  skin:[['Warm',0xd6a884],['Light',0xf0c6a5],['Tan',0xb77d58],['Deep',0x81543d]],
  hair:[['Black',0x242d33],['Brown',0x674532],['Auburn',0x9b5035],['Silver',0xb6b9b7]],
  shirt:[['Amber',0xe6a74c],['Teal',0x49a7a2],['Coral',0xd97c6c],['Violet',0x9475bd],['White',0xe5e6db]],
  pants:[['Navy',0x253b49],['Charcoal',0x363b42],['Olive',0x67765a],['Sand',0xb29a78]]
};
export const STYLE_OPTIONS={top:['Cadet Suit','Peasant Outfit','Ranger Outfit'],haircut:['Short','Tall','Cap']};
export const EMOTES={happy:'🙂',cool:'😎',sad:'😢',angry:'😠',love:'❤️',wave:'👋'};
export function normalizeAppearance(value){
  const result={};
  for(const [part,options] of Object.entries(APPEARANCE_OPTIONS)){
    const index=value?.[part];result[part]=Number.isInteger(index)&&index>=0&&index<options.length?index:0;
  }
  for(const [part,options] of Object.entries(STYLE_OPTIONS)){
    const index=value?.[part];result[part]=Number.isInteger(index)&&index>=0&&index<options.length?index:0;
  }
  return result;
}
