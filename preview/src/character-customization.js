import { characterDefinitionFor } from './character-definition.js';

export const CHARACTER_PALETTES=Object.freeze({
  authored:{label:'Ivory',color:'#f1e7dd'},
  rose:{label:'Rose silk',color:'#b66e89'},
  lagoon:{label:'Lagoon',color:'#416e72'},
  midnight:{label:'Midnight',color:'#353044'},
  botanical:{label:'Botanical',color:'#65775b'},
});
export const CHARACTER_HAIR=Object.freeze({
  authored:{label:'Ash blonde',color:'#b99a7b'},
  espresso:{label:'Espresso',color:'#3d2924'},
  copper:{label:'Copper',color:'#995431'},
  silver:{label:'Silver',color:'#c1bab3'},
});
export const supportsCharacterColors=id=>id==='sable-human'||id==='woman-casual';
export function customizedCharacterDefinition(ownerId,appearanceId,{palette='authored',hair='authored',revision=0}={}){
  const value=characterDefinitionFor(ownerId,appearanceId,{revision});
  if(!Object.hasOwn(CHARACTER_PALETTES,palette)||!Object.hasOwn(CHARACTER_HAIR,hair)
    ||(!supportsCharacterColors(value.appearanceId)&&(palette!=='authored'||hair!=='authored')))throw new TypeError('Unsupported character colors');
  return {...value,schemaVersion:2,palette,hair,provenance:{kind:'authored',catalog:'river-oaks-looks-v2'}};
}
