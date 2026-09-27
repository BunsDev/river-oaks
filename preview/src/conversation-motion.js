const ease=t=>t*t*t*(t*(t*6-15)+10);

// Short nods separated by quiet beats, with an independent cadence per person.
// This is conversational body language, not speech- or phoneme-aligned motion.
export function createConversationMotion({seed='',reducedMotion=false}={}) {
 let randomState=2166136261;
 for(const char of String(seed))randomState=Math.imul(randomState^char.charCodeAt(0),16777619)>>>0;
 const random=()=>{randomState=(Math.imul(randomState,1664525)+1013904223)>>>0;return randomState/4294967296;};
 const pose={pitch:0,roll:0},velocity={pitch:0,roll:0};
 let time=0,mode=null,nextAt=Infinity,event=null;
 return {
  get pose(){return {...pose};},
  update(delta,{attending=false,speaking=false}={}) {
   if(reducedMotion||!Number.isFinite(delta)||delta<=0||delta>.25)return pose;
   const nextMode=speaking?'speaker':attending?'listener':null;
   if(nextMode!==mode) {
    mode=nextMode;event=null;
    nextAt=mode?time+.15+random()*.3:Infinity;
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
   return pose;
  },
 };
}
