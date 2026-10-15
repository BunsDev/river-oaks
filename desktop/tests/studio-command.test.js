import test from 'node:test';
import assert from 'node:assert/strict';
import { runStudioCommand } from '../studio-command.js';
test('real subprocess is bounded, cancelable and never shells arguments', async()=>{
 assert.equal(await runStudioCommand(process.execPath,['-e','process.stdout.write(process.argv[1])','$(not-a-command)']), '$(not-a-command)');
 await assert.rejects(runStudioCommand(process.execPath,['-e','process.stdout.write("x".repeat(1000))'],{maxBytes:20}),/limit/);
 const controller=new AbortController();const pending=runStudioCommand(process.execPath,['-e','setInterval(()=>{},1000)'],{signal:controller.signal});controller.abort();await assert.rejects(pending,/canceled/);
 await assert.rejects(runStudioCommand(process.execPath,['-e','setInterval(()=>{},1000)'],{timeout:20}),/timed out/);
});
test('input reaches the child whole on stdin, and a child that never reads it settles by its exit status', async()=>{
 // Far past Windows' 32,767-character command line and Linux's 128 KiB argument cap.
 const prompt='é'.repeat(300*1024)+'END';
 const echo='let s="";process.stdin.setEncoding("utf8");process.stdin.on("data",c=>s+=c).on("end",()=>process.stdout.write(s.length+":"+s.slice(-3)))';
 assert.equal(await runStudioCommand(process.execPath,['-e',echo],{input:prompt}), `${prompt.length}:END`);
 // Exiting before reading closes the pipe under the host's write; that must not crash the host.
 assert.equal(await runStudioCommand(process.execPath,['-e','process.stdout.write("ok")'],{input:'x'.repeat(4*1024*1024)}), 'ok');
 await assert.rejects(runStudioCommand(process.execPath,['-e','process.exit(3)'],{input:'x'.repeat(4*1024*1024)}),/failed/);
 // Without input the child's stdin stays closed.
 assert.equal(await runStudioCommand(process.execPath,['-e','process.stdin.on("data",()=>process.stdout.write("data")).on("end",()=>process.stdout.write("end"))']), 'end');
});
