async (page) => {
  const check = (condition,message) => { if(!condition) throw new Error(message); };
  const errors=[], packets=[], speechRequests=[];
  page.on('pageerror',error=>errors.push(error.message));
  page.on('request',request=>{
    if(request.method()==='POST' && request.url().endsWith('/v1/decisions')) packets.push(request.postDataJSON());
    if(request.url().endsWith('/v1/voice') && request.method()==='POST') speechRequests.push(request.url());
  });
  await page.setViewportSize({width:1920,height:1080});
  await page.goto('http://127.0.0.1:5173/');
  await page.locator('#loading').waitFor({state:'hidden'});
  const toggle=page.locator('#panel-toggle');
  // The rail sidebar shows one section at a time; select the tab a control lives in first.
  const rail = section => page.locator(`[data-section=${section}]`).click();
  const voices = async () => { await rail('settings-section'); await page.locator('details.rail-disclosure', { hasText: 'Voices & resident walks' }).evaluate(details => { details.open = true; }); };
  if(await toggle.getAttribute('aria-expanded')==='false') await toggle.click();
  check(await page.locator('#community-local option[value^=local-]').count()===24,'Need 24 distinct local encounters');
  check(await page.locator('#community-voice').inputValue()==='off','Speech must start muted');
  const palette=()=>page.evaluate(()=>{
    const style=getComputedStyle(document.documentElement);
    return {bg:style.getPropertyValue('--bg').trim(),accent:style.getPropertyValue('--accent').trim(),font:getComputedStyle(document.body).fontFamily};
  });
  await rail('settings-section');
  await page.locator('button[data-theme-preference=light]').click();
  // The retrofuturistic finish (retro-finish.css) is the district's current palette and loads last.
  const light=await palette(); check(light.bg==='#e8e5d8' && light.accent==='#286768','Light tokens must match the district visual finish');
  await page.locator('button[data-theme-preference=system]').click();
  await page.emulateMedia({colorScheme:'dark'});
  await page.waitForFunction(()=>document.documentElement.dataset.theme==='dark');
  const dark=await palette(); check(dark.bg==='#132e34' && dark.accent==='#b8e4ca','Dark tokens must match the district visual finish');
  check(dark.font.includes('Segoe UI'),'System UI font must apply');
  await page.emulateMedia({colorScheme:'light'});
  await page.waitForFunction(()=>document.documentElement.dataset.theme==='light');
  await page.locator('button[data-theme-preference=dark]').click();

  const meet=async id=>{ await rail('community-section'); await page.locator('#community-local').selectOption(id); await page.locator('#community-meet').click(); };
  await meet('local-00');
  check((await page.locator('#community-speech').textContent()).includes('I live here in River Oaks'),'Resident should speak from an in-world perspective');
  await page.locator('#community-close').click(); await meet('local-00');
  check((await page.locator('#community-speech').textContent()).includes('Welcome back'),'Resident must remember the earlier encounter');
  await page.locator('#community-about').click();
  await page.waitForFunction(()=>!document.querySelector('#community-attribution').textContent.includes('checking'));
  check(packets.some(packet=>packet.agents.some(agent=>agent.role_context?.includes('Visitor encounters 2'))),'Reaction packet must include encounter memory');

  const guests=[];
  for(const [id,name,era] of [['local-20','Ima Hogg','heritage'],['local-21','Barbara Jordan','heritage'],['local-22','Hakeem Olajuwon','no endorsement'],['local-23','Beyoncé','no endorsement']]) {
    await meet(id);
    check(await page.locator('#community-name').textContent()===name,'Named Houston encounter must be selectable');
    check((await page.locator('.community-kicker').textContent()).includes(era),'Portrayal disclosure must be visible');
    check(await page.locator('.community-biography').isVisible(),'Public biography source must be available');
    guests.push(name);
  }
  await page.setViewportSize({width:3840,height:2160});
  await page.screenshot({path:'output/playwright/houston-persona-4k.png'});
  const responsePromise=page.waitForResponse(response=>response.url().endsWith('/v1/voice') && response.request().method()==='POST' && !(response.status()===503 && response.headers()['retry-after']==='1'),{timeout:25000});
  await voices(); await page.locator('#community-voice').selectOption('kokoro');
  const response=await responsePromise;
  check(response.status()===200,`Actual local voice synthesis must succeed; HTTP ${response.status()}`);
  check(Number(response.headers()['content-length'])>10000,'UI request must receive audio');
  await page.waitForFunction(()=>document.querySelector('#community-voice-status').textContent==='Speaking locally',null,{timeout:10000});
  // Chrome may omit a consumed binary response from its inspection cache. Read
  // the identical server-cached utterance through the HTTP context for WAV checks.
  const cached=await page.request.post(response.url(),{data:response.request().postDataJSON()});
  check(cached.status()===200,'Cached utterance must remain available');
  const wav=await cached.body();
  check(Array.from(wav.subarray(0,4)).join(',')==='82,73,70,70' && wav.length>10000,`Bridge must return a real WAV: ${wav.length} bytes, header ${Array.from(wav.subarray(0,12))}`);
  await voices(); await page.locator('#community-voice').selectOption('off');
  await page.waitForTimeout(300);
  check(await page.locator('#community-voice-status').textContent()==='Muted','Muting must cancel the active line');
  check(speechRequests.every(url=>url==='http://127.0.0.1:5173/v1/voice'),'Voice requests must stay on loopback');
  check(await page.locator('#community-replay').isDisabled(),'Muted replay must be disabled');
  await page.locator('#community-close').click();
  await page.setViewportSize({width:390,height:844});
  await meet('local-20');
  await toggle.click();
  await page.waitForTimeout(400);
  check(!await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),'Mobile persona dialogue must not cause horizontal overflow');
  await page.screenshot({path:'output/playwright/houston-persona-mobile.png'});
  await page.locator('#community-close').click();
  await page.setViewportSize({width:1920,height:1080});
  await toggle.click();
  check(errors.length===0,`Browser errors: ${errors.join('; ')}`);
  return {guests,locals:24,encounterMemory:true,rolePackets:true,light,dark,systemTheme:true,localVoice:{wavBytes:wav.length,requests:speechRequests.length,mutedAfterPlayback:true},mobileNoOverflow:true,browserErrors:errors};
}
