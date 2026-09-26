// Picking and camera movement share a dead zone and one owning pointer.
// Returning a drag to its origin must never turn it back into a tap.
export function createPointerGesture() {
  let pointer = null;
  const outsideTap = event => Math.hypot(event.clientX-pointer.x,event.clientY-pointer.y)>5;
  // Releasing a pending capture need not dispatch lostpointercapture. Check
  // ownership at use time as well as responding to lifecycle cancellation.
  const ownsCapture = () => !pointer.captureTarget || pointer.captureTarget.hasPointerCapture(pointer.id);
  return {
    begin(event, {captureTarget=null} = {}) {
      if(pointer || !event.isPrimary || event.button!==0)return false;
      pointer={id:event.pointerId,x:event.clientX,y:event.clientY,lastX:event.clientX,lastY:event.clientY,dragged:false,captureTarget};
      return true;
    },
    move(event) {
      if(!pointer || pointer.id!==event.pointerId)return null;
      if(!ownsCapture() || !(event.buttons&1)){pointer=null;return null;}
      pointer.dragged ||= outsideTap(event);
      if(!pointer.dragged)return null;
      const delta=[event.clientX-pointer.lastX,event.clientY-pointer.lastY];
      pointer.lastX=event.clientX;pointer.lastY=event.clientY;
      return delta;
    },
    end(event) {
      if(!pointer || pointer.id!==event.pointerId)return false;
      const tap=ownsCapture() && event.button===0 && !pointer.dragged && !outsideTap(event);
      pointer=null;
      return tap;
    },
    cancel(event) {
      if(!event || pointer?.id===event.pointerId)pointer=null;
    },
  };
}
