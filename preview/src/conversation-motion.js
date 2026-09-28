const ease=t=>t*t*t*(t*(t*6-15)+10);

// Short nods and hand phrases separated by quiet beats, with a cadence per person.
// This is conversational body language, not speech- or phoneme-aligned motion.
export function createConversationMotion({seed='',reducedMotion=false}={}) {
 let randomState=2166136261;
 for(const char of String(seed))randomState=Math.imul(randomState^char.charCodeAt(0),16777619)>>>0;
 const random=()=>{randomState=(Math.imul(randomState,1664525)+1013904223)>>>0;return randomState/4294967296;};
 // Keep phrase randomness separate so adding hands does not change nod cadence.
 let bodyState=(randomState^0x9e3779b9)>>>0;
 const bodyRandom=()=>{bodyState=(Math.imul(bodyState,1664525)+1013904223)>>>0;return bodyState/4294967296;};
 const bodyKeys=['lean','turn','tilt','left','right','leftBeat','rightBeat'];
 const pose={pitch:0,roll:0},velocity={pitch:0,roll:0},targets={};
 for(const key of bodyKeys)pose[key]=velocity[key]=targets[key]=0;
 let time=0,mode=null,nextAt=Infinity,event=null,nextPhraseAt=Infinity,phrase=null;
 return {
  get pose(){return {...pose};},
  update(delta,{attending=false,speaking=false,gesturing=true}={}) {
   if(reducedMotion||!Number.isFinite(delta)||delta<=0||delta>.25)return pose;
   const nextMode=speaking?'speaker':attending?'listener':null;
   if(nextMode!==mode) {
    mode=nextMode;event=null;
    nextAt=mode?time+.15+random()*.3:Infinity;
    phrase=null;nextPhraseAt=mode?time+.3+bodyRandom()*.4:Infinity;
   }
   const dt=Math.min(.08,delta);time+=dt;
   while(time>=nextAt) {
    const talking=mode==='speaker';
    event={start:nextAt,duration:.65+random()*.45,
     pitch:talking?.035+random()*.022:.014+random()*.012,
     roll:(random()-.5)*(talking?.028:.014)};
    nextAt+=event.duration+(talking?.65+random()*1.65:2.5+random()*2.5);
   }
   const phase=event?(time-event.start)/event.duration:1;
   const envelope=phase>=1?0:phase<.38?ease(phase/.38):1-ease((phase-.38)/.62);
   const frequency=14,decay=Math.exp(-frequency*dt);
   for(const axis of ['pitch','roll']) {
    const target=(event?.[axis]??0)*envelope,offset=pose[axis]-target,c=velocity[axis]+frequency*offset;
    pose[axis]=target+(offset+c*dt)*decay;
    velocity[axis]=(velocity[axis]-frequency*c*dt)*decay;
   }
   while(time>=nextPhraseAt) {
    const talking=mode==='speaker',side=bodyRandom();
    phrase={start:nextPhraseAt,duration:2.4+bodyRandom(),
     left:talking?(side<.6?.72+bodyRandom()*.28:0):0,
     right:talking?(side>.35?.72+bodyRandom()*.28:0):0,
     lean:(talking?.022:.008)*(.5+bodyRandom()*.5),
     turn:(bodyRandom()-.5)*(talking?.045:.016),tilt:(bodyRandom()-.5)*(talking?.026:.012)};
    nextPhraseAt+=phrase.duration+(talking?1.4+bodyRandom()*2:2.8+bodyRandom()*3);
   }
   const p=phrase?(time-phrase.start)/phrase.duration:1;
   // Lift, two gentle emphasis beats, then a slower return to the resting pose.
   const amount=!gesturing||p>=1?0:p<.3?ease(p/.3):p>.65?1-ease((p-.65)/.35):1;
   for(const key of bodyKeys)targets[key]=(phrase?.[key]??0)*amount;
   targets.leftBeat=targets.left*.065*Math.sin(p*Math.PI*4);
   targets.rightBeat=targets.right*.065*Math.sin(p*Math.PI*4+.45);
   const bodyFrequency=10,bodyDecay=Math.exp(-bodyFrequency*dt);
   for(const key of bodyKeys) {
    const target=targets[key],offset=pose[key]-target,c=velocity[key]+bodyFrequency*offset;
    pose[key]=target+(offset+c*dt)*bodyDecay;
    velocity[key]=(velocity[key]-bodyFrequency*c*dt)*bodyDecay;
   }
   return pose;
  },
 };
}
