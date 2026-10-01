import * as THREE from 'three';

// Reference-led facial sculpt in metres. All resources are registered with the
// owning look, so local and remote instances never mutate the cached rig.
export function createSableFace(head, { add, ball, tube, material, textures }) {
  const smooth = THREE.MathUtils.smoothstep;
  const gauss = (x, width) => Math.exp(-((x / width) ** 2));
  const amber = new THREE.Color('#ad7147'), ivory = new THREE.Color('#f3e4d6');
  const dark = material('#211512', { roughness: .44 });
  const furPixels = new Uint8Array(256 * 256 * 4);
  for (let y = 0; y < 256; y++) for (let x = 0; x < 256; x++) {
    const strand = Math.sin(x * 2.35 + Math.sin(y * .055) * 2.5);
    const grain = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453;
    const value = 128 + strand * 25 + (grain - Math.floor(grain) - .5) * 18;
    const n = (y * 256 + x) * 4;
    furPixels[n] = furPixels[n + 1] = furPixels[n + 2] = value; furPixels[n + 3] = 255;
  }
  const fur = new THREE.DataTexture(furPixels, 256, 256);
  fur.wrapS = fur.wrapT = THREE.RepeatWrapping; fur.repeat.set(3, 2); fur.needsUpdate = true; textures.add(fur);
  const faceMaterial = material('#ffffff', { vertexColors: true, roughness: .84, bumpMap: fur, bumpScale: .00035, sheen: .22, sheenColor: ivory });

  // Smooth radii, recessed sockets, nose bridge and paired muzzle pads belong
  // to a single continuous surface rather than a stack of intersecting spheres.
  const rings = [
    [-.083,.009,.036,.023],[-.072,.029,.051,.025],[-.052,.055,.064,.027],
    [-.027,.083,.078,.015],[.001,.101,.087,.003],[.036,.098,.094,-.004],
    [.071,.094,.086,-.008],[.108,.080,.076,-.012],[.138,.055,.056,-.016],
    [.154,.023,.029,-.018],[.158,0,0,-.018],
  ];
  function section(y) {
    let i = 0; while (i < rings.length - 2 && y > rings[i + 1][0]) i++;
    const t = THREE.MathUtils.clamp((y - rings[i][0]) / (rings[i + 1][0] - rings[i][0]), 0, 1);
    return [1, 2, 3].map(k => {
      const p0 = rings[Math.max(0, i - 1)][k], p1 = rings[i][k], p2 = rings[i + 1][k], p3 = rings[Math.min(rings.length - 1, i + 2)][k];
      return .5 * ((2*p1) + (-p0+p2)*t + (2*p0-5*p1+4*p2-p3)*t*t + (-p0+3*p1-3*p2+p3)*t*t*t);
    });
  }
  function surface(y, angle) {
    const [rx, rz, cz] = section(y), front = Math.max(0, Math.cos(angle));
    const x = Math.sin(angle) * Math.max(0, rx);
    const muzzle = .031 * gauss(y + .032, .028) * Math.exp(-((x / .052) ** 4));
    const bridge = .011 * gauss(x, .018) * gauss(y - .014, .055) + .019*gauss(x,.021)*gauss(y-.006,.021);
    const socket = .010 * gauss(Math.abs(x) - .043, .025) * gauss(y - .049, .023);
    return new THREE.Vector3(x, y, Math.cos(angle) * Math.max(0, rz) + cz + front ** 6 * (muzzle + bridge - socket));
  }
  function furColor(p, front) {
    const feather = .0017 * Math.sin(p.x * 1900 + Math.sin(p.y * 270) * 2);
    const marking = 1 - smooth(p.y + feather, -.025 + Math.abs(p.x) * .48, -.005 + Math.abs(p.x) * .48);
    const color = amber.clone().lerp(ivory, marking * smooth(front, .05, .45));
    const eyeshadow = gauss(Math.abs(p.x) - .045, .025) * gauss(p.y - .067, .022) * smooth(front, .5, .9);
    return color.multiplyScalar(1 - eyeshadow * .22);
  }
  const rows = 80, cols = 96, positions = [], colors = [], uv = [], indices = [];
  for (let row = 0; row <= rows; row++) for (let col = 0; col <= cols; col++) {
    const y = -.083 + row / rows * .241, angle = col / cols * Math.PI * 2;
    const p = surface(y, angle), c = furColor(p, Math.max(0, Math.cos(angle)));
    positions.push(...p); colors.push(c.r, c.g, c.b); uv.push(col / cols, row / rows);
    if (row < rows && col < cols) { const n = row * (cols + 1) + col; indices.push(n,n+1,n+cols+1,n+1,n+cols+2,n+cols+1); }
  }
  const skull = new THREE.BufferGeometry();
  skull.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  skull.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  skull.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); skull.setIndex(indices); skull.computeVertexNormals();
  add(head, skull, faceMaterial, [0,0,0], [1,1,1], 'Sable sculpted face');

  // A softly rounded triangular nose sits into the integrated nasal bridge.
  const nose=ball(head,material('#251b18',{roughness:.42,clearcoat:.2}),[0,-.006,.124],[.016,.010,.011],'Sable nose');
  const np=nose.geometry.attributes.position;
  for(let i=0;i<np.count;i++)np.setX(i,np.getX(i)*(.58+.42*(np.getY(i)+1)/2));
  nose.geometry.computeVertexNormals();
  for(const side of [-1,1])ball(head,dark,[side*.009,-.005,.132],[.0028,.0017,.0011],'Sable nostril');
  const mouth = material('#644238', { roughness: .8 });
  const onFace = points => points.map(([x,y]) => {
    const [rx] = section(y), p = surface(y, Math.asin(THREE.MathUtils.clamp(x/rx,-1,1)));
    return [x,y,p.z+.0007];
  });
  const philtrum=onFace([[0,-.020],[0,-.027],[0,-.035]]);
  tube(head, mouth, philtrum, .00065, 'Sable philtrum');
  tube(head, mouth, onFace([[-.028,-.029],[-.019,-.036],[0,-.038],[.019,-.036],[.028,-.029]]), .00085, 'Sable smile');
  const lip = material('#c49b86', { roughness: .85 });
  tube(head, lip, onFace([[-.011,-.041],[0,-.043],[.011,-.041]]), .0008, 'Sable lower lip');

  // Radial chestnut iris fibres, warm collarette and dark limbal ring. Keeping
  // the texture deterministic avoids per-instance visual shimmer or drift.
  const irisPixels = new Uint8Array(256 * 256 * 4);
  const irisBase=new THREE.Color('#754329'), irisGold=new THREE.Color('#bd8247'), irisColor=new THREE.Color();
  for (let y = 0; y < 256; y++) for (let x = 0; x < 256; x++) {
    const dx = (x-127.5)/127.5, dy = (y-127.5)/127.5, r = Math.hypot(dx,dy), a = Math.atan2(dy,dx);
    const irisRadius = r / .57;
    const fibre = Math.sin(a*93 + Math.sin(r*31)*.8)*.09 + Math.sin(a*173-r*13)*.045;
    const ring = 1 - smooth(irisRadius,.78,1)*.78;
    const c = irisColor.copy(irisBase).lerp(irisGold, (1-smooth(irisRadius,.35,.72))*.52).multiplyScalar((.90+fibre)*ring);
    if (irisRadius < .36) c.set('#110c09');
    if (irisRadius > 1) c.set('#f5e9d9');
    const n = (y*256+x)*4;c.convertLinearToSRGB();irisPixels[n]=c.r*255;irisPixels[n+1]=c.g*255;irisPixels[n+2]=c.b*255;irisPixels[n+3]=255;
  }
  const irisMap = new THREE.DataTexture(irisPixels,256,256);irisMap.colorSpace=THREE.SRGBColorSpace;irisMap.needsUpdate=true;textures.add(irisMap);

  const lid = material('#9f6845',{roughness:.8});
  const glint = material('#fff8ee',{emissive:'#b0a396',roughness:.1});
  function brow(points) {
    const curve=new THREE.CatmullRomCurve3(points.map(p=>new THREE.Vector3(...p)));
    const geometry=new THREE.TubeGeometry(curve,40,.0028,8,false),p=geometry.attributes.position;
    for(let row=0;row<=40;row++){
      const center=curve.getPointAt(row/40),taper=.08+.92*Math.sin(Math.PI*row/40)**.45;
      for(let col=0;col<=8;col++){const i=row*9+col;const v=new THREE.Vector3().fromBufferAttribute(p,i).sub(center).multiplyScalar(taper).add(center);p.setXYZ(i,v.x,v.y,v.z);}
    }
    geometry.computeVertexNormals();add(head,geometry,material('#674934'),[0,0,0],[1,1,1],'Sable brow');
  }
  const eyes=[];
  for (const side of [-1,1]) {
    const socket=new THREE.Group();socket.name=`Sable eye ${side}`;socket.position.set(side*.044,.049,.075);socket.rotation.z=side*.12;head.add(socket);
    const opening=new THREE.Group();opening.name='Sable eyelid opening';socket.add(opening);eyes.push(opening);
    const almond=new THREE.Shape();almond.moveTo(-.029,0);almond.bezierCurveTo(-.016,.020,.014,.020,.029,0);almond.bezierCurveTo(.014,-.017,-.014,-.017,-.029,0);
    const eyeGeometry=new THREE.ShapeGeometry(almond,32),ep=eyeGeometry.attributes.position;
    for(let i=0;i<ep.count;i++)ep.setZ(i,.010+.007*(1-(ep.getX(i)/.029)**2));eyeGeometry.computeVertexNormals();
    add(opening,eyeGeometry.clone(),dark,[0,0,-.0006],[1.07,1.07,1]);
    const eyeMap=irisMap.clone();eyeMap.needsUpdate=true;textures.add(eyeMap);opening.userData.irisMap=eyeMap;
    const eyeUV=eyeGeometry.attributes.uv;
    for(let i=0;i<ep.count;i++)eyeUV.setXY(i,ep.getX(i)/.058+.5,ep.getY(i)/.058+.5);
    add(opening,eyeGeometry,material('#ffffff',{map:eyeMap,roughness:.55,clearcoat:0,specularIntensity:.12}),[0,0,0],[1,1,1],'Sable chestnut eye');
    const eyeball = new THREE.Group();eyeball.name='Sable iris gaze';opening.add(eyeball);
    ball(eyeball,glint,[-.004,.006,.018],[.0023,.0028,.0008],'Sable eye catchlight');
    ball(eyeball,glint,[.005,-.006,.018],[.0008,.0008,.0005]);
    // Lid curves move with the opening: no floating eyeliner when blinking.
    tube(opening,lid,[[-.029,0,.010],[-.015,.0115,.016],[0,.015,.018],[.016,.0115,.016],[.029,0,.010]],.0024,'Sable upper eyelid');
    tube(opening,dark,[[-.029,0,.012],[-.015,.0115,.018],[0,.015,.020],[.016,.0115,.018],[.029,0,.012]],.0013,'Sable upper lashes');
    tube(opening,lid,[[-.029,0,.010],[-.014,-.010,.016],[0,-.014,.018],[.014,-.010,.016],[.029,0,.010]],.0014,'Sable lower eyelid');
    // Tapered individual lashes are merged into one mesh per eye.
    const lashes=[],lashIndices=[];
    for(let i=0;i<9;i++){
      const t=i/8,x=side*(.009+t*.018),y=.015*(1-(Math.abs(x)/.031)**2),length=.004+t*.006;
      const start=lashes.length/3;
      lashes.push(x-.0006,y,.019,x+.0006,y,.019,x+side*length*.75,y+length,.018);
      lashIndices.push(start,start+1,start+2);
    }
    const lashGeometry=new THREE.BufferGeometry();lashGeometry.setAttribute('position',new THREE.Float32BufferAttribute(lashes,3));lashGeometry.setIndex(lashIndices);lashGeometry.computeVertexNormals();
    add(opening,lashGeometry,material('#211512',{side:THREE.DoubleSide,roughness:.65}),[0,0,0],[1,1,1],'Sable individual lashes');
    brow([[side*.019,.083,.076],[side*.039,.089,.076],[side*.060,.083,.067],[side*.071,.077,.057]]);
  }

  // Short swept cheek fibres soften the silhouette without a separate mesh per
  // strand. Their colors follow the same mask as the continuous face beneath.
  const fibres=[],fibreColors=[];
  for(const side of [-1,1])for(let i=0;i<360;i++){
    const t=((i*137)%367)/367,y=-.052+t*.077,angle=side*(1.02+((i*79)%359)/359*.51);
    const p=surface(y,angle),c=furColor(p,Math.max(0,Math.cos(angle)));
    const end=p.clone().add(new THREE.Vector3(side*(.0015+(i%5)*.00035),-.0015,.0005));
    fibres.push(p.x,p.y+.00028,p.z+.0002,p.x,p.y-.00028,p.z+.0002,...end);
    for(let k=0;k<3;k++)fibreColors.push(c.r,c.g,c.b);
  }
  const fuzz=new THREE.BufferGeometry();fuzz.setAttribute('position',new THREE.Float32BufferAttribute(fibres,3));fuzz.setAttribute('color',new THREE.Float32BufferAttribute(fibreColors,3));fuzz.computeVertexNormals();
  add(head,fuzz,material('#ffffff',{vertexColors:true,roughness:1,side:THREE.DoubleSide}),[0,0,0],[1,1,1],'Sable cheek fur');
  return eyes;
}
