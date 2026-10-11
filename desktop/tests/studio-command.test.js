import test from 'node:test';
import assert from 'node:assert/strict';
import { runStudioCommand } from '../studio-command.js';
test('real subprocess is bounded, cancelable and never shells arguments', async()=>{
 assert.equal(await runStudioCommand(process.execPath,['-e','process.stdout.write(process.argv[1])','$(not-a-command)']), '$(not-a-command)');
 await assert.rejects(runStudioCommand(process.execPath,['-e','process.stdout.write("x".repeat(1000))'],{maxBytes:20}),/limit/);
 const controller=new AbortController();const pending=runStudioCommand(process.execPath,['-e','setInterval(()=>{},1000)'],{signal:controller.signal});controller.abort();await assert.rejects(pending,/canceled/);
 await assert.rejects(runStudioCommand(process.execPath,['-e','setInterval(()=>{},1000)'],{timeout:20}),/timed out/);
});
