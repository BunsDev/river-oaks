async page => {
  const { openHudSpace } = await import('./hud-navigation.js');
  const errors=[],visits=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.setViewportSize({width:1440,height:1000});
  await page.emulateMedia({reducedMotion:'no-preference'});
  await page.goto('http://127.0.0.1:5181/?motion-debug=1');
  await page.waitForFunction(()=>{
    const d=document.querySelector('#canvas-host').dataset;
    return (document.querySelector('#canvas-host')?.dataset.multiplayer==='joined')&&d.storePeopleReady===d.storePeopleTotal&&d.playerReady==='true'&&d.carriageDriverReady==='true';
  },null,{timeout:90000});
  if(await page.locator('#panel-toggle').getAttribute('aria-expanded')==='false')await page.locator('#panel-toggle').click();
  await openHudSpace(page, 'community-section');
  if(!await page.locator('#community-more').evaluate(element=>element.open))await page.locator('#community-more > summary').click();
  const ids=await page.locator('#community-local option').evaluateAll(options=>options.map(option=>option.value));
  // The shared town presents building residents only; outdoor and vehicle encounters
  // are omitted (shared-population.test.js). The directory must list exactly the
  // people the town shows, once each, rather than the old single-player count.
  const people=await page.evaluate(()=>window.__riverPeople().map(person=>person.id));
  if(!ids.length||new Set(ids).size!==ids.length)throw new Error(`Encounter directory lists ${ids.length} entries, with duplicates or none`);
  if(ids.length!==people.length||ids.some(id=>!people.includes(id)))throw new Error(`Directory lists ${ids.length} people but the town shows ${people.length}`);
  if(ids.some(id=>!id.startsWith('store-')))throw new Error(`Shared directory lists an outdoor or vehicle encounter: ${ids.filter(id=>!id.startsWith('store-')).join(', ')}`);
  const firstIndoor=ids.findIndex(id=>id.startsWith('store-'));
  ids.unshift(...ids.splice(firstIndoor,1));
  // The shared town refuses a second travel within its one-second cooldown and
  // allows about two commands a second (a 12-token bucket refilled every 500 ms;
  // server/world.js). Each visit sends six: travel and focus for both meetings and
  // a focus clear on each close. Pacing travels 1.6 s apart stays inside both,
  // rather than weakening either limit.
  let lastTravel=0;
  const travel=async action=>{await page.waitForTimeout(Math.max(0,1600-(Date.now()-lastTravel)));await action();lastTravel=Date.now();};
  // Shared travel and focus are confirmed by the town server, so conversations can
  // take seconds to open on a loaded machine; the waits below allow for that.
  // A closed conversation fades out before it hides; wait for that, so the next
  // visibility wait sees the new conversation rather than the old one.
  const close=async()=>{await page.locator('#community-close').click();await page.locator('#community-dialogue').waitFor({state:'hidden',timeout:10000});};
  for(const id of ids) {
    // Name the person and step in any failure: 74 visits make a bare timeout opaque.
    let step='';
    try {
      step='choose';
      await page.locator('#community-local').selectOption(id);
      step='meet a local';
      await travel(()=>page.locator('#community-meet').click());
      await page.locator('#community-dialogue').waitFor({state:'visible',timeout:15000});
      step='wait until reachable';
      await page.waitForFunction(id=>window.__riverPeople().find(person=>person.id===id)?.reachable,id,{timeout:10000});
      step='close the conversation';
      await close();
      // Wait past the HUD's paint interval: the button must reflect this location.
      await page.waitForTimeout(200);
      const room=await page.locator('#walking-hud').getAttribute('data-inside');
      if(!await page.locator('#walking-meet-nearby').isEnabled())throw new Error(`Nearby disabled beside reachable person ${id}`);
      // Open More actions only when it is shown and closed: the HUD moves actions between
      // the primary slot and More as context changes, and a second summary click closes it.
      if(!await page.locator('.walking-more').evaluate(more=>more.open||more.hidden))await page.locator('.walking-more summary').click();
      step='meet someone nearby';
      await travel(()=>page.locator('#walking-meet-nearby').click());
      await page.locator('#community-dialogue').waitFor({state:'visible',timeout:15000});
      const selected=await page.locator('#community-local').inputValue();
      step='wait until reachable';
      await page.waitForFunction(id=>window.__riverPeople().find(person=>person.id===id)?.reachable,selected,{timeout:10000});
      if(await page.locator('#walking-hud').getAttribute('data-inside')!==room)throw new Error(`Nearby moved rooms at ${id}`);
      visits.push({location:id,selected,room});
      step='close the nearby conversation';
      await close();
    } catch(error) { throw new Error(`${id}, ${step} (${visits.length} visits done): ${error.message.split('\n')[0]}`); }
  }
  await page.screenshot({path:'output/playwright/nearby-encounters.png'});
  if(errors.length)throw new Error(errors.join('; '));
  return {visits,errors,scope:'Real directory travel followed by the nearby button at every resident location; same-room reachable conversations.'};
}
