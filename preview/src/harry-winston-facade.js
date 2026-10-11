import * as THREE from 'three';

// REF-HW-01 (user Street View screenshot, 2025). Photo-derived proportions,
// not surveyed dimensions. The mapped opening and animated door remain authoritative.
export function harryWinstonFacade({ m, keep, surface, sign, box, sheet, lettering, cladding, group, geometries }) {
  let stone, archStone, navy, crest;
  return (f, width, doors) => {
    stone ??= keep(cladding({ color: '#d8d1bf', panel: [1.5, 0.55], bond: true, tone: 0.06, joint: 0.90, veins: 0.04, roughness: 0.82 }), 'winston-travertine');
    archStone ??= keep(cladding({ color: '#c6bda8', panel: [1.5, 0.55], tone: .04, joint: .94, veins: .03, roughness: .84 }), 'winston-arch-stone');
    navy ??= surface('winston-navy-canvas', { color: '#11182b', roughness: 0.96 });
    if (!crest) {
      const canvas = document.createElement('canvas'); canvas.width = 256; canvas.height = 256;
      const c = canvas.getContext('2d'); c.strokeStyle = '#d7d9e4'; c.lineWidth = 5;
      for (const inset of [0, 9]) {
        c.beginPath(); [[85,42],[171,42],[190,64],[182,184],[151,210],[105,210],[74,184],[66,64]].forEach(([x,y],i) => {
          x=128+(x-128)*(1-inset/100); y=128+(y-128)*(1-inset/100); i ? c.lineTo(x,y) : c.moveTo(x,y);
        }); c.closePath(); c.stroke();
      }
      c.fillStyle='#e5e6ef'; c.font='64px Georgia'; c.textAlign='center'; c.fillText('H',128,117); c.fillText('W',128,174);
      const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace; texture.anisotropy = 8;
      crest = keep(new THREE.MeshStandardMaterial({ map: texture, alphaTest: 0.4, roughness: 0.9 }), 'winston-monogram');
    }
    const door = doors[0]?.s ?? width / 2, top = 11.5, spring = 3.3, radius = 1.28, outer = 1.95;
    const mesh = (shape, depth, material, s, h, d) => {
      const geometry = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false, curveSegments: 32 }); geometries.push(geometry);
      const item = new THREE.Mesh(geometry, material); item.position.fromArray(f.at(s,h,d)); item.rotation.y=f.yaw;
      item.castShadow=item.receiveShadow=true; group.add(item); return item;
    };
    const wall = (lo, hi, h0, h1) => box(f, stone, lo, hi, h0, h1, 0.02, 0.44);
    const bay = (s, upper) => {
      const h0=upper?6.3:0.45, h1=upper?9.5:3.7, half=0.65;
      sheet(f, m.shopGlass, s-half, s+half, h0, h1, 0.06);
      for (const side of [-1,1]) box(f,m.bronze,s+side*half-.045,s+side*half+.045,h0,h1,0.04,0.20);
      box(f,m.bronze,s-half,s+half,h0,h0+.06,0.04,0.20);
      box(f,stone,s-half-.14,s+half+.14,h0-.14,h0,0.02,0.56);
      // Steep navy fabric hood, then the near-vertical monogram valance.
      box(f,navy,s-.87,s+.87,h1-.13,h1-.07,0.40,1.05,0.52);
      box(f,navy,s-.87,s+.87,h1-1.45,h1-.10,0.96,1.01);
      sign(crest,f,s,h1-.78,1.06,.84,.90);
      for(const side of [-1,1]) box(f,m.charcoal,s+side*.82-.015,s+side*.82+.015,h1-1.35,h1-.1,.4,.96);
      if (upper) {
        for (const h of [h0+.20,h0+.85]) box(f,m.charcoal,s-.73,s+.73,h,h+.035,.61,.66);
        for (const dx of [-.72,0,.72]) box(f,m.charcoal,s+dx-.018,s+dx+.018,h0+.03,h0+.90,.61,.66);
        // Cross-braced iron Juliet rail, with restrained depth ahead of the window.
        for (const pitch of [-.47,.47]) {
          const bar = new THREE.Mesh(new THREE.BoxGeometry(1.58,.026,.026),m.charcoal);
          geometries.push(bar.geometry); bar.position.fromArray(f.at(s,h0+.51,.65)); bar.rotation.set(0,f.yaw,0); bar.rotateZ(pitch); group.add(bar);
        }
      }
    };
    const spacing = Math.min(3.85, (Math.min(door,width-door)-1.6)/2);
    const lower = [-2,-1,1,2].map(i=>door+i*spacing), upper = [-2,-1,0,1,2].map(i=>door+i*spacing);
    const row = (centers,h0,h1,left=0,right=width) => {
      let cursor=left;
      for(const s of centers) { wall(cursor,s-.70,h0,h1); cursor=s+.70; }
      wall(cursor,right,h0,h1);
    };
    // Separate the entry run from the display bays: no stone sheet crosses the doorway.
    wall(0,door-outer,0,.45); wall(door+outer,width,0,.45);
    row(lower.slice(0,2),.45,3.7,0,door-outer); row(lower.slice(2),.45,3.7,door+outer,width);
    wall(0,door-outer,3.7,5.7); wall(door+outer,width,3.7,5.7);
    for(const side of [-1,1]) wall(door+side*(outer+radius)/2-(outer-radius)/2,door+side*(outer+radius)/2+(outer-radius)/2,0,spring);
    for (const side of [-1,1]) {
      const a=side<0?door-radius:door+.9,b=side<0?door-.9:door+radius;
      box(f,archStone,a,b,0,spring,.02,.84);
    }
    const spandrel=new THREE.Shape(); spandrel.moveTo(-outer,spring); spandrel.absarc(0,spring,outer,Math.PI,0,true); spandrel.lineTo(outer,5.7); spandrel.lineTo(-outer,5.7); spandrel.closePath();
    mesh(spandrel,.42,stone,door,0,.02);
    // Individually jointed voussoirs produce the broad limestone arch in the photo.
    for(let i=0;i<17;i++) {
      const a=i*Math.PI/17+.005,b=(i+1)*Math.PI/17-.005,shape=new THREE.Shape();
      shape.absarc(0,0,outer,a,b,false);shape.absarc(0,0,radius,b,a,true);shape.closePath();
      mesh(shape,.84,archStone,door,spring,.02);
    }
    // Fanlight closes only above the existing 3.3 m clear opening.
    const fan=new THREE.Shape(); fan.absarc(0,0,radius,0,Math.PI,false);fan.closePath();
    mesh(fan,.06,m.bronze,door,spring,.05);
    box(f,m.gold,door-radius,door+radius,spring,spring+.04,.12,.15);
    for(let i=1;i<8;i++) {
      const a=i*Math.PI/8,shape=new THREE.Shape();
      shape.moveTo(0,0);shape.lineTo(Math.cos(a)*radius,Math.sin(a)*radius);shape.lineTo(Math.cos(a+.014)*radius,Math.sin(a+.014)*radius);shape.closePath();
      mesh(shape,.025,m.gold,door,spring,.12);
    }
    wall(0,width,5.7,6.3); row(upper,6.3,9.5); wall(0,width,9.5,top);
    lower.forEach(s=>bay(s,false));upper.forEach(s=>bay(s,true));
    for(const [h,thickness,depth] of [[.12,.16,.55],[5.64,.18,.68],[5.85,.06,.55],[11.15,.16,.60],[11.40,.12,.70]]) box(f,stone,-.12,width+.12,h,h+thickness,.02,depth);
    box(f,m.charcoal,-.14,width+.14,top,top+.05,.02,.71);
    box(f,stone,door-.22,door+.22,5.15,5.64,.40,.79);
    sign(lettering('HARRY WINSTON',{width:Math.min(width-3,15),height:.85,weight:400,spacing:.12,color:'#918878',metalness:.45}),f,door,10.38,.46,Math.min(width-3,15),.85);
    // Paired black lanterns stand outside the mapped door clearance.
    for(const side of [-1,1]) {
      const s=door+side*2.22;
      box(f,m.charcoal,s-.06,s+.06,.18,1.55,.53,.65);
      box(f,m.charcoal,s-.20,s+.20,.12,.22,.42,.78);
      box(f,m.charcoal,s-.18,s+.18,1.4,1.46,.41,.77);
      box(f,m.lamp,s-.10,s+.10,1.46,1.83,.49,.69);
      for(const dx of [-.13,.13]) box(f,m.charcoal,s+dx-.02,s+dx+.02,1.43,1.88,.46,.72);
      box(f,m.charcoal,s-.19,s+.19,1.87,1.94,.41,.77);
    }
  };
}

// Hardware follows the existing animated leaf, never a static collider across entry.
export function decorateWinstonDoor(pivot, box, gold, dark) {
  dark = new THREE.MeshStandardMaterial({ color: '#141514', metalness: .42, roughness: .46 });
  const transform=new THREE.Object3D(), rails=[];
  for(const x of [.425,1.275])rails.push({p:[x,1.8,.015],s:[.78,2.96,.03]});
  for(const x of [.04,.85,1.66]) rails.push({p:[x,1.8,.035],s:[.055,3,.075]});
  for(const y of [.32,1.12,2.35,3.28]) rails.push({p:[.85,y,.035],s:[1.7,.045,.075]});
  for(const x of [.20,.38,.56,1.02,1.20,1.38,1.56]) rails.push({p:[x,1.8,.02],s:[.018,2.96,.04]});
  const lattice=new THREE.InstancedMesh(box,dark,rails.length);lattice.name='Winston moving iron grille';
  rails.forEach(({p,s},i)=>{transform.position.fromArray(p);transform.scale.fromArray(s);transform.updateMatrix();lattice.setMatrixAt(i,transform.matrix);});
  const rings=new THREE.InstancedMesh(new THREE.TorusGeometry(.055,.012,5,12),gold,24);rings.name='Winston moving brass rosettes';
  transform.scale.set(1,1,1);
  for(let i=0;i<24;i++){transform.position.set(.14+(i%6)*.28,.48+Math.floor(i/6)*.84,.09);transform.updateMatrix();rings.setMatrixAt(i,transform.matrix);}
  for(const mesh of [lattice,rings]){mesh.castShadow=mesh.receiveShadow=true;pivot.add(mesh);}
}
