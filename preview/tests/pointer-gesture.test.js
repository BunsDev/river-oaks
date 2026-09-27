import test from 'node:test';
import assert from 'node:assert/strict';
import { createPointerGesture } from '../src/pointer-gesture.js';

const pointer = (changes = {}) => ({pointerId:1, isPrimary:true, button:0, buttons:1, clientX:100, clientY:200, ...changes});

test('a tap tolerates five pixels of jitter without moving the camera', () => {
  const gesture=createPointerGesture();
  assert.equal(gesture.begin(pointer()),true);
  assert.equal(gesture.move(pointer({clientX:103,clientY:204})),null);
  assert.equal(gesture.end(pointer({clientX:103,clientY:204,buttons:0})),true);
  assert.equal(gesture.move(pointer({clientX:120})),null);
});

test('a drag includes its initial displacement and never becomes a tap again', () => {
  const gesture=createPointerGesture();
  gesture.begin(pointer());
  assert.equal(gesture.move(pointer({clientX:104})),null);
  assert.deepEqual(gesture.move(pointer({clientX:106})),[6,0]);
  assert.deepEqual(gesture.move(pointer({clientX:106,clientY:210})),[0,10]);
  assert.deepEqual(gesture.move(pointer()),[-6,-10]);
  assert.equal(gesture.end(pointer({buttons:0})),false);
});

test('release outside the tap radius cannot select even without a move event', () => {
  const gesture=createPointerGesture();gesture.begin(pointer());
  assert.equal(gesture.end(pointer({clientY:206,buttons:0})),false);
});

test('secondary contacts cannot steer, replace, release or cancel the primary gesture', () => {
  const gesture=createPointerGesture(),secondary=pointer({pointerId:2,isPrimary:false,clientX:400});
  gesture.begin(pointer());
  assert.equal(gesture.begin(secondary),false);
  assert.equal(gesture.move(secondary),null);
  assert.equal(gesture.end({...secondary,buttons:0}),false);
  gesture.cancel(secondary);
  assert.equal(gesture.end(pointer({buttons:0})),true);
  gesture.begin(pointer());
  assert.equal(gesture.begin({...secondary,isPrimary:true}),false,'a different primary device cannot steal an active pointer');
  assert.deepEqual(gesture.move(pointer({clientX:120})),[20,0]);
});

test('non-primary and non-left starts do not create a gesture', () => {
  for(const change of [{isPrimary:false},{button:1},{button:2}]) {
    const gesture=createPointerGesture();
    assert.equal(gesture.begin(pointer(change)),false);
    assert.equal(gesture.move(pointer({clientX:120})),null);
    assert.equal(gesture.end(pointer({buttons:0})),false);
  }
});

test('capture loss, cancellation and focus loss discard movement and selection', () => {
  for(const event of [pointer(),undefined]) {
    const gesture=createPointerGesture();gesture.begin(pointer());
    gesture.move(pointer({clientX:110}));gesture.cancel(event);
    assert.equal(gesture.move(pointer({clientX:160})),null);
    assert.equal(gesture.end(pointer({buttons:0})),false);
    assert.equal(gesture.begin(pointer()),true,'a new gesture can start after cancellation');
    assert.equal(gesture.end(pointer({buttons:0})),true);
  }
});

test('losing the primary button during a mouse chord ends the gesture', () => {
  const gesture=createPointerGesture();gesture.begin(pointer());
  assert.equal(gesture.move(pointer({buttons:2,clientX:110})),null);
  assert.equal(gesture.move(pointer({buttons:1,clientX:120})),null);
  assert.equal(gesture.end(pointer({buttons:0})),false);
  gesture.begin(pointer());
  assert.equal(gesture.end(pointer({button:2,buttons:0})),false);
});

test('releasing pending capture cancels a tap even when no lost-capture event fires',()=>{
  let captured=false;
  const captureTarget={hasPointerCapture:id=>id===1&&captured};
  const gesture=createPointerGesture();
  gesture.begin(pointer(),{captureTarget});
  captured=true; // setPointerCapture in the same pointerdown handler
  captured=false; // released before gotpointercapture can be dispatched
  assert.equal(gesture.end(pointer({buttons:0})),false);
  gesture.begin(pointer(),{captureTarget});captured=true;
  assert.equal(gesture.end(pointer({buttons:0})),true,'a fresh captured tap succeeds');
});

test('pending capture release also prevents camera deltas and cannot be revived by recapture',()=>{
  let captured=true;
  const captureTarget={hasPointerCapture:()=>captured},gesture=createPointerGesture();
  gesture.begin(pointer(),{captureTarget});captured=false;
  assert.equal(gesture.move(pointer({clientX:140})),null);
  captured=true;
  assert.equal(gesture.move(pointer({clientX:160})),null);
  assert.equal(gesture.end(pointer({buttons:0})),false);
});
