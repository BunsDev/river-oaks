async page => {
  const results=[];
  await page.setViewportSize({width:256,height:320});
  await page.emulateMedia({reducedMotion:'reduce'});
<<<<<<< Updated upstream
  for(const form of ['jevica','witch','alien']) {
=======
  for(const form of ['jevica']) {
>>>>>>> Stashed changes
    await page.goto(`http://127.0.0.1:5173/e2e/fixtures/jevica.html?form=${form}`);
    await page.waitForFunction(()=>document.body.dataset.ready==='true');
    await page.evaluate(form=>{
      const fixture=window.jevicaFixture;
      fixture.render('portrait');
<<<<<<< Updated upstream
      const y=form==='witch'?1.78:form==='alien'?1.54:1.50,z=form==='witch'?2.0:1.25;
=======
      const y=1.50,z=1.25;
>>>>>>> Stashed changes
      fixture.camera.position.set(0.10,y+0.025,z);fixture.camera.lookAt(0,y,0);
      fixture.renderer.render(fixture.scene,fixture.camera);
    },form);
    const path=`preview/public/assets/characters/${form}-portrait.png`;
    await page.screenshot({path});results.push(path);
  }
  return results;
}
