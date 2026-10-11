import test from 'node:test';
import assert from 'node:assert/strict';
import { runStudioCommand, parseDesignerStream } from '../studio-command.js';
test('real subprocess is bounded, cancelable and never shells arguments', async()=>{
 assert.equal(await runStudioCommand(process.execPath,['-e','process.stdout.write(process.argv[1])','$(not-a-command)']), '$(not-a-command)');
 await assert.rejects(runStudioCommand(process.execPath,['-e','process.stdout.write("x".repeat(1000))'],{maxBytes:20}),/limit/);
 const controller=new AbortController();const pending=runStudioCommand(process.execPath,['-e','setInterval(()=>{},1000)'],{signal:controller.signal});controller.abort();await assert.rejects(pending,/canceled/);
 await assert.rejects(runStudioCommand(process.execPath,['-e','setInterval(()=>{},1000)'],{timeout:20}),/timed out/);
});
test('normalized response requires read-only init and successful terminal event',()=>{
 const frames=[{type:'system',subtype:'init',permission:'read-only'},{type:'assistant',message:{content:[{type:'text',text:'{"rationale":"a"}'}]}},{type:'result',is_error:false}];
 const encode=value=>value.map(v=>JSON.stringify(v)).join('\n');assert.deepEqual(parseDesignerStream(encode(frames)),{rationale:'a'});
 assert.throws(()=>parseDesignerStream(encode(frames.slice(1))),/incomplete/);
 assert.throws(()=>parseDesignerStream(encode([...frames.slice(0,2),{type:'result',is_error:true}])));
 assert.throws(()=>parseDesignerStream(encode([{...frames[0],permission:'full'},...frames.slice(1)])),/read-only/);
});
