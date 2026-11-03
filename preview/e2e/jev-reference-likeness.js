// Prince Jev against the 2026-10-29 reference (preview/public/assets/characters/
// references/jev-angel-tunic-20261029.png, supplied by Val): the fixture renders
// him in the reference framing (front, full body, wings at rest, white
// background, 848×1264) and the page measures the likeness itself: silhouette
// overlap after bounding-box alignment, colour distance in named regions of the
// figure, and the presence of the fitted accessories. The numbers are a
// baseline for a procedural rig on CC0 geometry, not a claim of pixel identity.
async page => {
  const current=await page.evaluate(()=>location.origin),origin=current.startsWith('http')?current:'http://127.0.0.1:5173';
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.emulateMedia({reducedMotion:'reduce'});
  await page.setViewportSize({width:848,height:1264});
  await page.goto(`${origin}/e2e/fixtures/prince.html?view=reference`);
  await page.waitForFunction(()=>document.body.dataset.ready==='true');
  const result=await page.evaluate(async()=>{
    const f=window.princeFixture,framing=f.reference();
    const read=async source=>{
      const canvas=document.createElement('canvas');canvas.width=848;canvas.height=1264;const context=canvas.getContext('2d');
      context.drawImage(source,0,0,848,1264);return {canvas,data:context.getImageData(0,0,848,1264).data};
    };
    const image=new Image();image.src='/assets/characters/references/jev-angel-tunic-20261029.png';await image.decode();
    const reference=await read(image),rendered=await read(f.renderer.domElement);
    // Figure masks: anything that is not the white background.
    const mask=data=>{const m=new Uint8Array(848*1264);for(let i=0;i<m.length;i++){const r=data[i*4],g=data[i*4+1],b=data[i*4+2];m[i]=r>247&&g>247&&b>247?0:1;}return m;};
    const bounds=m=>{let x0=848,x1=-1,y0=1264,y1=-1;for(let y=0;y<1264;y++)for(let x=0;x<848;x++)if(m[y*848+x]){x0=Math.min(x0,x);x1=Math.max(x1,x);y0=Math.min(y0,y);y1=Math.max(y1,y);}return {x0,x1,y0,y1,w:x1-x0+1,h:y1-y0+1};};
    const a=mask(reference.data),b=mask(rendered.data),ba=bounds(a),bb=bounds(b);
    // Map a reference pixel to the rendered figure by the two bounding boxes.
    const map=(x,y)=>[Math.round(bb.x0+(x-ba.x0)/ba.w*bb.w),Math.round(bb.y0+(y-ba.y0)/ba.h*bb.h)];
    let intersection=0,union=0;
    for(let y=ba.y0;y<=ba.y1;y++)for(let x=ba.x0;x<=ba.x1;x++){const [mx,my]=map(x,y);const inA=a[y*848+x],inB=mx>=0&&mx<848&&my>=0&&my<1264?b[my*848+mx]:0;if(inA||inB)union++;if(inA&&inB)intersection++;}
    const iou=intersection/union;
    // Colour regions, named at reference pixel coordinates; the rendered sample
    // is taken at the mapped position, averaged over a 9×9 window, compared as
    // CIE76 ΔE in Lab (sRGB → linear → XYZ → Lab).
    const regions={hair:[420,80],face:[440,215],tunicChest:[520,330],placket:[425,400],belt:[425,520],bracerLeft:[235,525],bracerRight:[640,525],trousersThigh:[380,760],trousersShin:[380,930],sandalStrap:[330,1060],wingRight:[640,300],wingLeft:[330,400]};
    const lab=([r,g,b])=>{const lin=c=>{c/=255;return c<=.04045?c/12.92:Math.pow((c+.055)/1.055,2.4);};const [R,G,B]=[lin(r),lin(g),lin(b)];
      const X=(R*.4124+G*.3576+B*.1805)/.95047,Y=R*.2126+G*.7152+B*.0722,Z=(R*.0193+G*.1192+B*.9505)/1.08883;const fn=t=>t>.008856?Math.cbrt(t):7.787*t+16/116;
      return [116*fn(Y)-16,500*(fn(X)-fn(Y)),200*(fn(Y)-fn(Z))];};
    const average=(data,m,x,y)=>{let r=0,g=0,bl=0,n=0;for(let dy=-4;dy<=4;dy++)for(let dx=-4;dx<=4;dx++){const px=x+dx,py=y+dy;if(px<0||px>=848||py<0||py>=1264||!m[py*848+px])continue;const i=(py*848+px)*4;r+=data[i];g+=data[i+1];bl+=data[i+2];n++;}return n?[r/n,g/n,bl/n]:null;};
    const colours={};
    for(const [name,[x,y]]of Object.entries(regions)){
      const [mx,my]=map(x,y),ref=average(reference.data,a,x,y),got=average(rendered.data,b,mx,my);
      const deltaE=ref&&got?Math.hypot(...lab(ref).map((v,i)=>v-lab(got)[i])):null;
      colours[name]={reference:ref?.map(Math.round),rendered:got?.map(Math.round),at:[mx,my],deltaE:deltaE===null?null:+deltaE.toFixed(1)};
    }
    // Fitted accessories and the retired dress-uniform pieces.
    const fitted=f.costume.fitted,materials=f.costume.materials.map(m=>m.name);
    const presence={bracers:fitted.bracers.length,calfStraps:fitted.calves.length,feet:fitted.feet.length,belt:Boolean(fitted.waist),buckle:f.avatar.object.getObjectByName('Prince Jev buckle')!==undefined||fitted.waist?.slot.group.children.length>0,
      wingsVisible:framing.wingsVisible,retired:materials.filter(name=>['Prince Jev gold','Prince Jev royal sash','Prince Jev sapphires'].includes(name)),materials};
    // Side-by-side composite for the human reviewer.
    const composite=document.createElement('canvas');composite.width=848*2;composite.height=1264;const context=composite.getContext('2d');
    context.drawImage(reference.canvas,0,0);context.drawImage(rendered.canvas,848,0);
    return {framing,iou:+iou.toFixed(3),boxes:{reference:ba,rendered:bb},colours,presence,composite:composite.toDataURL('image/png')};
  });
  const fs=await import('node:fs/promises');
  await fs.writeFile('output/playwright/jev-reference-likeness.png',Buffer.from(result.composite.split(',')[1],'base64'));
  await page.screenshot({path:'output/playwright/jev-reference-likeness-render.png'});
  const {composite,...report}=result;
  const deltas=Object.values(report.colours).map(entry=>entry.deltaE);
  const failures=[];
  // Baseline thresholds from the first measured run (2026-10-29); see the
  // ledger docs/superpowers/plans/2026-10-29-jev-reference-look.md.
  if(!(report.iou>=0.55))failures.push(`silhouette IoU ${report.iou} below the 0.55 baseline`);
  if(deltas.some(delta=>delta===null))failures.push('a colour region fell outside the figure');
  for(const [name,entry]of Object.entries(report.colours))if(entry.deltaE>40)failures.push(`${name} ΔE ${entry.deltaE} above the 40 baseline`);
  const p=report.presence;
  if(p.bracers!==2||p.calfStraps!==2||p.feet!==2||!p.belt||!p.wingsVisible||p.retired.length)failures.push(`accessories: ${JSON.stringify(p)}`);
  if(errors.length)failures.push(`page errors: ${errors.join('; ')}`);
  if(failures.length)throw new Error(JSON.stringify({failures,report},null,1));
  return {passed:true,...report,scope:'Silhouette and colour baseline against a 2D illustration on the CC0 rig; not pixel identity, not human visual acceptance'};
}
