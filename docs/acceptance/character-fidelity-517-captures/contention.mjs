// #517 root-cause diagnostic: same case, same session, ABBA rounds with a second
// browser's synthetic GPU load off/on. Writes data/reports/character-fidelity-contention-517.json.
import {chromium} from 'playwright';
import {writeFile} from 'node:fs/promises';
import {startBrowserFixture} from '../../../preview/e2e/fixture-server.js';
import {holdBrowserLock} from '../../../scripts/browser-lock.mjs';
import {hostConditions} from '../../../scripts/character-fidelity-evidence.mjs';
const rounds = Number(process.argv[2] ?? 4), id = 'morgan-human', realism = 'high', counts = [1, 8, 24];
const unlock = await holdBrowserLock('517 contention diagnostic');
const fixture = await startBrowserFixture();
const flags = ['--use-angle=metal', '--ignore-gpu-blocklist', '--disable-gpu-vsync', '--disable-frame-rate-limit'];
const subject = await chromium.launch({headless: true, args: flags}), loader = await chromium.launch({headless: true, args: flags});
const ctx = await subject.newContext({viewport: {width: 1920, height: 1080}, deviceScaleFactor: 1});
await ctx.addCookies([{name: 'fixture_session', value: 'owner', url: fixture.origin}]);
await ctx.route(fixture.origin + '/e2e/fixtures/character-fidelity.html', async route => { const response = await route.fetch(); await route.fulfill({response, headers: {...response.headers(), 'cross-origin-opener-policy': 'same-origin', 'cross-origin-embedder-policy': 'require-corp'}}); });
const tab = await ctx.newPage(); tab.setDefaultTimeout(180000);
await tab.goto(fixture.origin + '/e2e/fixtures/character-fidelity.html');
await tab.waitForFunction(() => document.body.dataset.ready === 'true');
await tab.evaluate(([i, r]) => window.fidelityFixture.load(i, {realism: r}), [id, realism]);
const heavy = `<canvas width=1920 height=1080></canvas><script>const gl=document.querySelector('canvas').getContext('webgl2');
const s=(t,c)=>{const x=gl.createShader(t);gl.shaderSource(x,c);gl.compileShader(x);return x};const p=gl.createProgram();
gl.attachShader(p,s(gl.VERTEX_SHADER,'#version 300 es\\nin vec2 a;void main(){gl_Position=vec4(a,0,1);}'));
gl.attachShader(p,s(gl.FRAGMENT_SHADER,'#version 300 es\\nprecision highp float;out vec4 o;uniform float t;void main(){vec2 u=gl_FragCoord.xy/1e3;float v=0.;for(int i=0;i<160;i++){u=fract(u*1.37+t);v+=sin(u.x*u.y*91.);}o=vec4(v);}'));
gl.linkProgram(p);gl.useProgram(p);const b=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,b);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,3,-1,-1,3]),gl.STATIC_DRAW);
gl.enableVertexAttribArray(0);gl.vertexAttribPointer(0,2,gl.FLOAT,false,0,0);const u=gl.getUniformLocation(p,'t');
const f=n=>{gl.uniform1f(u,n/1e3);gl.drawArrays(gl.TRIANGLES,0,3);requestAnimationFrame(f)};requestAnimationFrame(f);</script>`;
const samples = [];
try {
  for (let round = 0; round < rounds; round++) for (const contended of round % 2 ? [true, false] : [false, true]) {
    let page = null;
    if (contended) { page = await loader.newPage({viewport: {width: 1920, height: 1080}}); await page.setContent(heavy); await page.waitForTimeout(1500); }
    for (const count of counts) {
      const host = hostConditions({ownPid: subject.process?.()?.pid});
      const r = await tab.evaluate(([i, o]) => window.fidelityFixture.frames(i, o), [id, {count, samples: 120, realism}]);
      samples.push({round, contended, count, host, frameP50: r.frameIntervalMs.p50, cpuP50: r.cpuMs.p50, gpuP50: r.gpuMs?.p50 ?? null, render: r.render});
      console.log(round, contended ? 'ON ' : 'off', `x${count}`, 'frame', r.frameIntervalMs.p50, 'cpu', r.cpuMs.p50, 'gpu', r.gpuMs?.p50, 'host gpu%', host.gpuUtilization, 'load', host.loadavg[0]);
    }
    await page?.close();
  }
} finally {
  await writeFile(new URL('../../../data/reports/character-fidelity-contention-517.json', import.meta.url), JSON.stringify({id, realism, counts, rounds, isolated: await tab.evaluate(() => crossOriginIsolated), samples}, null, 2));
  await subject.close(); await loader.close(); await fixture.close(); unlock();
}
