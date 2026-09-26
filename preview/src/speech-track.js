export const SPEECH_SHAPES='PP FF TH DD kk CH SS nn RR aa E I O U'.split(' ').map(n=>`viseme_${n}`);
const phonemes={PP:'pbm',FF:'fv',TH:'θð',DD:'tdɾ',kk:'kɡg',CH:'ʃʒʧʤ',SS:'sz',nn:'nlŋɲ',RR:'rɹɻ',aa:'aɑæʌəɐ',E:'eɛɜɞ',I:'iɪjy',O:'oɔɒ',U:'uʊw'};
const mapping=new Map(Object.entries(phonemes).flatMap(([shape,letters])=>[...letters].map(letter=>[letter,`viseme_${shape}`])));
const smooth=t=>{t=Math.max(0,Math.min(1,t));return t*t*t*(t*(t*6-15)+10);};

// Sample the actual audio clock, independent of display cadence. Short
// anticipation and release windows overlap neighbouring phoneme shapes.
export function createSpeechTrack(cues) {
 const sounds=cues.map(cue=>({...cue,shape:mapping.get(cue.phoneme)??null}));
 for(let i=0;i<sounds.length;i++){
  if(/[ˈˌ]/u.test(sounds[i].phoneme))sounds[i].shape=sounds.slice(i+1).find(s=>s.shape)?.shape??null;
  if(/[ːˑ]/u.test(sounds[i].phoneme))sounds[i].shape=sounds[i-1]?.shape??null;
 }
 const weights=Object.fromEntries(SPEECH_SHAPES.map(name=>[name,0]));
 return {
  sample(time){
   for(const name of SPEECH_SHAPES)weights[name]=0;
   if(!Number.isFinite(time)||time<0)return weights;
   for(const cue of sounds){
    if(!cue.shape||cue.end<=cue.start||time<cue.start-.045||time>cue.end+.065)continue;
    const envelope=smooth((time-(cue.start-.045))/.065)*(1-smooth((time-(cue.end-.015))/.08));
    weights[cue.shape]=Math.max(weights[cue.shape],envelope);
   }
   const sum=Object.values(weights).reduce((a,b)=>a+b,0),normalizer=Math.max(1,sum);
   for(const name of SPEECH_SHAPES)weights[name]=weights[name]/normalizer*(name==='viseme_aa'?.85:1);
   return weights;
  },
 };
}
