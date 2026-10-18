import { embedId, initMessage, parseChildMessage, prepareCloseMessage } from './office-computer-protocol.js';
// One separate-origin TypeSafe Computer frame per desk (#486). It owns creation, the
// message fence and departure; Computer owns its sign-in, account choice, documents and saves.
export const COMPUTER_SANDBOX='allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox';
export const COMPUTER_PERMISSIONS="camera 'none'; microphone 'none'; geolocation 'none'; display-capture 'none'; clipboard-read 'none'; clipboard-write 'none'; payment 'none'; usb 'none'";
export const COMPUTER_TIMEOUTS={load:15000,resend:1000,close:8000};
export function createComputerFrame({config,mount,win=window,doc=document,timers=globalThis,random,timeouts=COMPUTER_TIMEOUTS,onChange=()=>{},onRequestClose=()=>{}}){
 // state is what Place shows; reported is the child's own last state, restored after a close that did not end.
 let frame=null,instanceId=null,state='idle',reported='idle',sync='none',code=null,used=false,closing=null,loadTimer=null,resendTimer=null,closeTimer=null,listening=false;
 const snapshot=()=>({state,sync,code,mounted:Boolean(frame),instanceId});
 const emit=()=>onChange(snapshot());
 const clear=()=>{timers.clearTimeout(loadTimer);timers.clearInterval(resendTimer);timers.clearTimeout(closeTimer);loadTimer=resendTimer=closeTimer=null;};
 const post=message=>{try{frame?.contentWindow?.postMessage(message,config.origin);}catch{}};
 /** Removes the frame now, without asking the child. Idempotent; a later message from it is ignored. */
 function destroy(next='idle',detail=null){
  clear();instanceId=null;used=false;const old=frame;frame=null;
  if(listening){win.removeEventListener('message',receive);listening=false;}
  if(old){try{old.src='about:blank';}catch{}old.remove();}
  state=reported=next;code=detail;sync='none';
  const pending=closing;closing=null;pending?.resolve({outcome:'destroyed'});emit();
 }
 function start(){
  instanceId=embedId(random);state=reported='loading';sync='none';code=null;used=false;const id=instanceId;
  timers.clearTimeout(loadTimer);loadTimer=timers.setTimeout(()=>{if(id===instanceId)destroy('failed','timeout');},timeouts.load);
 }
 // The frame's document changed under it (a reload or navigation): that is a new, ungated instance.
 // Nothing the old document reported carries over, and a pending close goes unanswered.
 function renew(){
  timers.clearInterval(resendTimer);timers.clearTimeout(closeTimer);resendTimer=closeTimer=null;
  const pending=closing;closing=null;start();if(pending)state='unconfirmed';emit();pending?.resolve({outcome:'timeout'});
 }
 function receive(event){
  if(!frame||event.origin!==config.origin||event.source!==frame.contentWindow)return;
  const message=parseChildMessage(event.data);if(!message||message.instanceId!==instanceId)return;
  if(message.type==='status'){
   timers.clearInterval(resendTimer);resendTimer=null;
   if(message.state!=='loading'){timers.clearTimeout(loadTimer);loadTimer=null;}
   // Sign-in happens top-level, outside the frame; errors keep documents hidden. Neither keeps a runtime.
   // The contract requires Computer to keep unsynced work in its local copy before reporting either.
   if(message.state==='signin-required'){destroy('signin');return;}
   if(message.state==='error'){destroy('failed',message.code);return;}
   sync=message.sync;reported=message.state;used||=reported==='usable';
   if(!closing&&!['attention','unconfirmed'].includes(state))state=reported;
   emit();return;
  }
  if(message.type==='request-close'){if(reported==='usable'||reported==='account-confirmation')onRequestClose();return;}
  if(message.type==='close-result'&&closing&&message.requestId===closing.requestId){
   const pending=closing;closing=null;timers.clearTimeout(closeTimer);closeTimer=null;
   if(message.result==='ready'){destroy('idle');pending.resolve({outcome:'ready',persistence:message.persistence});return;}
   state=message.result==='cancelled'?reported:'attention';emit();pending.resolve({outcome:message.result});
  }
 }
 return {
  get state(){return snapshot();},
  get frame(){return frame;},
  /** Creates the frame if there is none and starts a fresh instance; Computer then shows its own account gate. */
  open(){
   if(frame)return;
   const el=doc.createElement('iframe');frame=el;el.className='desk-computer-frame';el.title='TypeSafe Computer';
   el.setAttribute('sandbox',COMPUTER_SANDBOX);el.setAttribute('allow',COMPUTER_PERMISSIONS);el.setAttribute('referrerpolicy','no-referrer');
   win.addEventListener('message',receive);listening=true;start();
   let loads=0;
   el.addEventListener('load',()=>{
    if(frame!==el)return;if(loads++)renew();
    const id=instanceId;post(initMessage(id));timers.clearInterval(resendTimer);
    // A child that attaches its listener after load still receives init; it ends at the first valid status.
    resendTimer=timers.setInterval(()=>{if(frame===el&&id===instanceId)post(initMessage(id));},timeouts.resend);
   });
   el.src=config.frameURL;mount.append(el);emit();
  },
  /**
   * Normal departure. An instance that never showed a usable desktop holds no edits, so the frame goes
   * at once. Once it has been usable, Computer decides: ready, cancelled, attention or no answer.
   */
  depart(){
   if(closing)return closing.promise;
   if(!frame||!used){destroy('idle');return Promise.resolve({outcome:'ready',persistence:null});}
   const requestId=embedId(random),token=instanceId;let resolve;const promise=new Promise(r=>{resolve=r;});
   closing={requestId,promise,resolve};state='closing';emit();
   post(prepareCloseMessage(token,requestId));
   closeTimer=timers.setTimeout(()=>{if(closing?.requestId!==requestId)return;closing=null;state='unconfirmed';emit();resolve({outcome:'timeout'});},timeouts.close);
   return promise;
  },
  /** Keep working after attention or an unanswered close. */
  resume(){if(frame&&['attention','unconfirmed'].includes(state)){state=reported;emit();}},
  destroy,
 };
}
