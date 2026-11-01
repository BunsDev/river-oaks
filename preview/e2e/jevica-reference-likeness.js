// Jevica against Val's 2026-10-29 reference illustration
// (public/assets/characters/references/jevica-pink-suit-20261029.png): the
// fixture frames her the same way on white, and this journey measures how close
// the build is instead of eyeballing it: silhouette overlap, the colour of named
// regions, and the presence of every tailored piece. Thresholds are the first
// honest baseline of the procedural build, not a claim of a pixel-identical match.
async page => {
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  const origin='http://127.0.0.1:5181',reference='/assets/characters/references/jevica-pink-suit-20261029.png';
  await page.setViewportSize({width:848,height:1264});await page.emulateMedia({reducedMotion:'reduce'});
  await page.goto(`${origin}/e2e/fixtures/jevica.html?view=reference&background=white`);
  await page.waitForFunction(()=>document.body.dataset.ready==='true');
  // Let the peplum drape settle, then hold the pose the illustration shows.
  const presence=await page.evaluate(()=>{
    const f=window.jevicaFixture;for(let i=0;i<40;i++)f.render('reference',i*1000/60,0,{});
    const names=[];f.avatar.object.traverse(item=>names.push(item.name));
    const has=pattern=>names.some(name=>pattern.test(name));
    return {blazer:has(/^Jevica satin blazer$/),trousers:has(/^Jevica satin trousers$/),peplum:has(/^Jevica satin peplum$/),collar:has(/^Jevica mandarin collar$/),brooch:has(/^Jevica collar brooch$/),
      button:has(/^Jevica blazer button$/),lilies:names.filter(name=>/^Jevica lily cluster/.test(name)).length,earrings:names.filter(name=>/^Jevica earring (left|right)$/.test(name)).length,heels:names.filter(name=>/^Jevica heel/.test(name)).length,
      crown:has(/crown/i),gown:has(/gown/i),wandShown:(()=>{let shown=null;f.avatar.object.traverse(item=>{if(item.isSprite)shown=item.parent.visible;});return shown;})()};
  });
  // The same anatomical landmark in both pictures. On the illustration they were picked by
  // hand (pixel centres in its 848×1264 frame; her right side is the viewer's left). On the
  // render each is the front-most surface point of the named garment at that landmark,
  // projected through the fixture camera; a raycast records what the pixel actually shows.
  const regions={'hair-crown':[430,60],'hair-ends':[575,430],'skin-face':[420,140],'blouse':[400,260],'jacket-chest':[360,330],
    'jacket-sleeve':[310,400],'jacket-hem':[360,520],'trousers-thigh':[375,700],'trousers-shin':[395,980],'shoe':[468,1212]};
  const landmarks=await page.evaluate(()=>{
    const f=window.jevicaFixture,T=f.THREE,model=f.avatar.rig.model,root=f.avatar.object;root.updateMatrixWorld(true);
    const local=name=>root.worldToLocal(model.getObjectByName(name).getWorldPosition(new T.Vector3()));
    // The front-most skinned vertex of a mesh within 1.5 cm of (x, y) in the avatar's frame.
    const front=(meshName,x,y,reach=.015)=>{
      const mesh=model.getObjectByName(meshName)??root.getObjectByName(meshName);if(!mesh)return null;
      const count=mesh.geometry.attributes.position.count,p=new T.Vector3();let best=null;
      for(let i=0;i<count;i++){if(mesh.isSkinnedMesh)mesh.getVertexPosition(i,p);else p.fromBufferAttribute(mesh.geometry.attributes.position,i);
        p.applyMatrix4(mesh.matrixWorld);root.worldToLocal(p);if(Math.abs(p.x-x)<reach&&Math.abs(p.y-y)<reach&&(!best||p.z>best.z))best=p.clone();}
      return best;};
    const mid=(a,b)=>local(a).add(local(b)).multiplyScalar(.5),head=local('head'),neck=local('neck_01'),chest=local('spine_03');
    // Hair ends: the lowest visible strands on her left (the viewer's right) that are at least
    // 30% down the hair (well into the pink), confirmed by a raycast. None visible is a recorded gap.
    const hairEnds=(()=>{const hair=model.getObjectByName('Jevicalong01'),ombre=hair.geometry.attributes.ombre,p=new T.Vector3(),candidates=[];
      for(let i=0;i<hair.geometry.attributes.position.count;i++){if(!ombre||ombre.getX(i)<.30)continue;hair.getVertexPosition(i,p).applyMatrix4(hair.matrixWorld);candidates.push(root.worldToLocal(p.clone()));}
      const probe=new T.Raycaster(),meshes=[];f.scene.traverse(o=>{if(o.isMesh&&o.visible)meshes.push(o);});
      for(const point of candidates.filter(c=>c.x>0).sort((a,b)=>a.y-b.y).slice(0,400)){const ndc=root.localToWorld(point.clone()).project(f.camera);probe.setFromCamera(new T.Vector2(ndc.x,ndc.y),f.camera);
        if(probe.intersectObjects(meshes,false)[0]?.object===hair)return point;}
      return null;})();
    const points={'hair-crown':front('Jevicalong01',head.x,head.y+.13,.02),'hair-ends':hairEnds,
      'skin-face':front('Jevica',head.x-.035,head.y+.015),'blouse':front('Jevica_fitted_bodice',neck.x,neck.y-.12,.035),'jacket-chest':front('Jevica satin blazer',chest.x-.09,chest.y+.07),
      'jacket-sleeve':front('Jevica satin blazer',mid('upperarm_r','lowerarm_r').x,mid('upperarm_r','lowerarm_r').y,.025),'jacket-hem':front('Jevica satin blazer',-.08,local('pelvis').y+.02,.02),
      'trousers-thigh':front('Jevica satin trousers',mid('thigh_r','calf_r').x,mid('thigh_r','calf_r').y),'trousers-shin':front('Jevica satin trousers',mid('calf_r','foot_r').x,mid('calf_r','foot_r').y),
      'shoe':front('Jevicashoes01',local('ball_l').x,local('ball_l').y+.03,.025)};
    const ray=new T.Raycaster(),targets=[];f.scene.traverse(o=>{if(o.isMesh&&o.visible)targets.push(o);});
    return Object.fromEntries(Object.entries(points).map(([name,point])=>{
      if(!point)return [name,null];const world=root.localToWorld(point.clone()),ndc=world.clone().project(f.camera);
      ray.setFromCamera(new T.Vector2(ndc.x,ndc.y),f.camera);const hit=ray.intersectObjects(targets,false).find(h=>h.object.visible);
      return [name,{pixel:[Math.round((ndc.x+1)/2*innerWidth),Math.round((1-ndc.y)/2*innerHeight)],shows:hit?.object.name??null}];}));
  });
  const shot=await page.screenshot({path:'output/playwright/jevica-reference-likeness-render.png'});
  const comparison=await page.evaluate(async ({render,reference,regions,landmarks})=>{
    const load=async source=>{const blob=typeof source==='string'&&source.startsWith('/')?await(await fetch(source)).blob():new Blob([Uint8Array.from(atob(source),c=>c.charCodeAt(0))],{type:'image/png'});
      const bitmap=await createImageBitmap(blob),canvas=document.createElement('canvas');canvas.width=bitmap.width;canvas.height=bitmap.height;
      const ctx=canvas.getContext('2d');ctx.drawImage(bitmap,0,0);bitmap.close();return {canvas,width:canvas.width,height:canvas.height,data:ctx.getImageData(0,0,canvas.width,canvas.height).data};};
    const ref=await load(reference),out=await load(render);
    const figure=image=>{const mask=new Uint8Array(image.width*image.height);let minX=image.width,minY=image.height,maxX=-1,maxY=-1;
      for(let y=0;y<image.height;y++)for(let x=0;x<image.width;x++){const i=(y*image.width+x)*4,d=image.data;if(Math.max(255-d[i],255-d[i+1],255-d[i+2])>18){mask[y*image.width+x]=1;minX=Math.min(minX,x);maxX=Math.max(maxX,x);minY=Math.min(minY,y);maxY=Math.max(maxY,y);}}
      return {mask,box:[minX,minY,maxX,maxY],width:image.width,height:image.height};};
    const a=figure(ref),b=figure(out);
    // Silhouette overlap on a common 240×360 grid over each figure's own box (scale and framing aside).
    const grid=[240,360];let inter=0,union=0;
    const at=(f,u,v)=>{const x=Math.round(f.box[0]+u*(f.box[2]-f.box[0])),y=Math.round(f.box[1]+v*(f.box[3]-f.box[1]));return f.mask[y*f.width+x];};
    for(let gy=0;gy<grid[1];gy++)for(let gx=0;gx<grid[0];gx++){const u=(gx+.5)/grid[0],v=(gy+.5)/grid[1],p=at(a,u,v),q=at(b,u,v);inter+=p&&q?1:0;union+=p||q?1:0;}
    const iou=inter/union;
    const lab=([r,g,b])=>{const lin=c=>{c/=255;return c<=.04045?c/12.92:Math.pow((c+.055)/1.055,2.4);};const R=lin(r),G=lin(g),B=lin(b);
      let X=(R*.4124+G*.3576+B*.1805)/.95047,Y=R*.2126+G*.7152+B*.0722,Z=(R*.0193+G*.1192+B*.9505)/1.08883;const f=t=>t>.008856?Math.cbrt(t):7.787*t+16/116;X=f(X);Y=f(Y);Z=f(Z);return [116*Y-16,500*(X-Y),200*(Y-Z)];};
    const sample=(image,[cx,cy])=>{const channels=[[],[],[]];
      for(let dy=-4;dy<=4;dy++)for(let dx=-4;dx<=4;dx++){const x=cx+dx,y=cy+dy;if(x<0||y<0||x>=image.width||y>=image.height)continue;const i=(y*image.width+x)*4;for(let c=0;c<3;c++)channels[c].push(image.data[i+c]);}
      return {pixel:[cx,cy],rgb:channels.map(values=>{values.sort((p,q)=>p-q);return values[values.length>>1];})};};
    const regionResults={};
    for(const [name,pixel] of Object.entries(regions)){
      if(!landmarks[name]){regionResults[name]={missing:true};continue;}
      const p=sample(ref,pixel),q=sample(out,landmarks[name].pixel),la=lab(p.rgb),lb=lab(q.rgb);
      regionResults[name]={reference:p.rgb,render:q.rgb,referencePixel:p.pixel,renderPixel:q.pixel,renderShows:landmarks[name].shows,rgbDistance:+(Math.hypot(...p.rgb.map((c,i)=>c-q.rgb[i]))/441.67).toFixed(3),deltaE:+Math.hypot(...la.map((c,i)=>c-lb[i])).toFixed(1)};}
    // Side by side with the sampled regions ringed on both.
    const composite=document.createElement('canvas');composite.width=ref.width+out.width;composite.height=Math.max(ref.height,out.height);
    const ctx=composite.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,composite.width,composite.height);ctx.drawImage(ref.canvas,0,0);ctx.drawImage(out.canvas,ref.width,0);
    ctx.lineWidth=2;ctx.font='13px sans-serif';
    for(const [name,r] of Object.entries(regionResults)){if(r.missing)continue;for(const [[x,y],offset] of [[r.referencePixel,0],[r.renderPixel,ref.width]]){ctx.strokeStyle=r.deltaE<18?'#0a7':'#d33';ctx.strokeRect(x-5+offset,y-5,11,11);ctx.fillStyle='#222';ctx.fillText(`${name} ΔE${r.deltaE}`,x+9+offset,y+4);}}
    ctx.strokeStyle='#36c';ctx.strokeRect(a.box[0],a.box[1],a.box[2]-a.box[0],a.box[3]-a.box[1]);ctx.strokeRect(b.box[0]+ref.width,b.box[1],b.box[2]-b.box[0],b.box[3]-b.box[1]);
    ctx.fillStyle='#222';ctx.font='18px sans-serif';ctx.fillText(`silhouette IoU ${iou.toFixed(3)}`,12,24);
    return {iou:+iou.toFixed(3),referenceBox:a.box,renderBox:b.box,regions:regionResults,composite:composite.toDataURL('image/png')};
  },{render:shot.toString('base64'),reference,regions,landmarks});
  const {writeFile}=await import('node:fs/promises');
  await writeFile('output/playwright/jevica-reference-likeness.png',Buffer.from(comparison.composite.split(',')[1],'base64'));
  delete comparison.composite;
  // A landmark the render cannot show (hair ends hidden behind her back) is reported, not averaged.
  const deltas=Object.fromEntries(Object.entries(comparison.regions).filter(([,r])=>!r.missing).map(([name,r])=>[name,r.deltaE]));
  const notVisible=Object.entries(comparison.regions).filter(([,r])=>r.missing).map(([name])=>name);
  const meanDeltaE=+(Object.values(deltas).reduce((sum,v)=>sum+v,0)/Object.keys(deltas).length).toFixed(1);
  // Baseline (2026-10-29, measured on the first complete build: IoU .597, mean ΔE 17.7; chest 9.9,
  // sleeve 7.3, hem 23.3, thigh 14.2, shin 18.9, shoe 23.5, crown 27.7, blouse 22.2, face 12.0).
  // Each limit is that result plus a small margin for GPU and driver variation, so a regression
  // fails; it is a floor for this build, not a statement that the likeness is good enough.
  const thresholds={iou:.57,meanDeltaE:20,garments:{'jacket-chest':13,'jacket-sleeve':11,'jacket-hem':27,'trousers-thigh':18,'trousers-shin':23,'shoe':27,'hair-crown':31,'blouse':26,'skin-face':16}};
  const failures=[];
  if(comparison.iou<thresholds.iou)failures.push(`silhouette IoU ${comparison.iou} < ${thresholds.iou}`);
  if(meanDeltaE>thresholds.meanDeltaE)failures.push(`mean ΔE ${meanDeltaE} > ${thresholds.meanDeltaE}`);
  for(const [name,limit] of Object.entries(thresholds.garments))if(!(deltas[name]<=limit))failures.push(`${name} ΔE ${deltas[name]} > ${limit}`);
  const expected={blazer:true,trousers:true,peplum:true,collar:true,brooch:true,button:true,lilies:2,earrings:2,heels:2,crown:false,gown:false,wandShown:false};
  for(const [key,value] of Object.entries(expected))if(presence[key]!==value)failures.push(`${key}: ${JSON.stringify(presence[key])} (expected ${JSON.stringify(value)})`);
  if(errors.length)failures.push(`page errors: ${errors.join('; ')}`);
  if(failures.length)throw new Error(JSON.stringify({failures,iou:comparison.iou,meanDeltaE,deltas,notVisible,presence}));
  return {passed:true,iou:comparison.iou,meanDeltaE,notVisible,regions:comparison.regions,referenceBox:comparison.referenceBox,renderBox:comparison.renderBox,presence,thresholds,
    scope:'Figure-box silhouette overlap and median region colour against a 2D illustration; a procedural rig on CC0 assets is not pixel-identical and this does not claim it'};
}
