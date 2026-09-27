import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// Each enchanted dragon owns its batches and textures. No network assets or
// global caches: undo can release the complete creature immediately.
export function createWishDragon(localId) {
  const object = new THREE.Group();object.name = 'Wish dragon';
  const resources = new Set(), batches = new Map();
  const own = resource => {resources.add(resource);return resource;};
  // Periodic, jittered scale cells share their albedo, relief and roughness.
  // Unequal plates and narrow creases avoid a tiled checkerboard appearance.
  const size=512, heights=new Uint8Array(size*size*4), colors=new Uint8Array(size*size*4), roughness=new Uint8Array(size*size*4);
  const hash=(x,y)=>{const n=Math.sin(x*127.1+y*311.7)*43758.5453;return n-Math.floor(n);};
  const sites=Array.from({length:256},(_,i)=>({
    x:.5+(hash(i%16,Math.floor(i/16))-.5)*.55,
    y:.5+(hash(i%16+47,Math.floor(i/16)+13)-.5)*.55,
    tone:hash(i%16+71,Math.floor(i/16)+23),
  }));
  for(let y=0;y<size;y++)for(let x=0;x<size;x++) {
    const px=x/32,py=y/32,row=Math.floor(py),column=Math.floor(px);
    let nearest=Infinity,second=Infinity,cell=0;
    for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++) {
      const cx=column+dx,cy=row+dy,site=sites[((cy+16)%16)*16+(cx+16)%16];
      const distance=(px-cx-site.x)**2+(py-cy-site.y)**2;
      if(distance<nearest){second=nearest;nearest=distance;cell=site.tone;}
      else if(distance<second)second=distance;
    }
    const crease=THREE.MathUtils.smoothstep(Math.sqrt(second)-Math.sqrt(nearest),.015,.18);
    const relief=crease*(.84+.16*(1-Math.min(1,nearest))),grain=hash(x,y),i=(y*size+x)*4;
    const mottling=.92+.08*Math.sin(x/size*Math.PI*4)*Math.sin(y/size*Math.PI*6);
    const shade=(.78+.22*relief)*mottling;
    heights[i]=heights[i+1]=heights[i+2]=Math.round(30+relief*202+grain*5);heights[i+3]=255;
    colors[i]=Math.round((96+cell*10)*shade+grain*3);
    colors[i+1]=Math.round((101+cell*9)*shade+grain*3);
    colors[i+2]=Math.round((77+cell*8)*shade+grain*2);colors[i+3]=255;
    roughness[i]=roughness[i+1]=roughness[i+2]=Math.round(163+cell*24+(1-relief)*50);roughness[i+3]=255;
  }
  // Tangent-space normals retain the shallow scale edges at grazing angles.
  // The derivative wraps at the seam just like the repeating surface texture.
  const normals=new Uint8Array(size*size*4);
  const heightAt=(x,y)=>heights[(((y+size)%size)*size+(x+size)%size)*4]/255;
  for(let y=0;y<size;y++)for(let x=0;x<size;x++) {
    const nx=(heightAt(x-1,y)-heightAt(x+1,y))*1.15;
    const ny=(heightAt(x,y-1)-heightAt(x,y+1))*1.15;
    const length=Math.hypot(nx,ny,1),i=(y*size+x)*4;
    normals[i]=Math.round((nx/length*.5+.5)*255);
    normals[i+1]=Math.round((ny/length*.5+.5)*255);
    normals[i+2]=Math.round((1/length*.5+.5)*255);normals[i+3]=255;
  }
  function texture(pixels,color=false) {
    const map=own(new THREE.DataTexture(pixels,size,size));map.wrapS=map.wrapT=THREE.RepeatWrapping;
    map.magFilter=THREE.LinearFilter;map.minFilter=THREE.LinearMipmapLinearFilter;map.generateMipmaps=true;
    map.repeat.set(3,3);map.anisotropy=4;if(color)map.colorSpace=THREE.SRGBColorSpace;map.needsUpdate=true;return map;
  }
  const scaleNormals=texture(normals),albedo=texture(colors,true),scaleRoughness=texture(roughness);
  const leatherPixels=new Uint8Array(size*size*4),hornPixels=new Uint8Array(size*size*4);
  for(let y=0;y<size;y++)for(let x=0;x<size;x++) {
    const i=(y*size+x)*4,grain=hash(x,y);
    const value=110+22*Math.sin(x*.17+Math.sin(y*.045)*2)+grain*32;
    leatherPixels[i]=leatherPixels[i+1]=leatherPixels[i+2]=value;leatherPixels[i+3]=255;
    const striation=130+55*Math.sin(x*.39+Math.sin(y*.035)) + grain*15;
    hornPixels[i]=hornPixels[i+1]=hornPixels[i+2]=striation;hornPixels[i+3]=255;
  }
  const leather=texture(leatherPixels),hornGrain=texture(hornPixels);
  const material=(name,options)=>{const value=own(new THREE.MeshStandardMaterial(options));value.name=name;return value;};
  const skin=material('Dragon moss scales',{color:'#d2c9b0',map:albedo,roughness:.92,roughnessMap:scaleRoughness,metalness:0,normalMap:scaleNormals,vertexColors:true});
  const armor=material('Dragon bronze scutes',{color:'#514b39',roughness:.78,metalness:0,bumpMap:hornGrain,bumpScale:.003,vertexColors:true});
  const horn=material('Dragon worn horn',{color:'#8c7e65',roughness:.71,bumpMap:hornGrain,bumpScale:.003,vertexColors:true});
  const membrane=material('Dragon wing leather',{color:'#493e32',roughness:.86,bumpMap:leather,bumpScale:.003,vertexColors:true});
  const dark=material('Dragon mouth and nostrils',{color:'#11170f',roughness:.64,vertexColors:true});
  const eye=material('Dragon amber iris',{color:'#a78b31',roughness:.17,metalness:.05,vertexColors:true});
  const pupil=material('Dragon slit pupil',{color:'#050906',roughness:.09,vertexColors:true});
  function add(parent,mat,geometry) {
    if(geometry.index){const flat=geometry.toNonIndexed();geometry.dispose();geometry=flat;}
    const position=geometry.attributes.position,colors=[];
    for(let i=0;i<position.count;i++) {
      const x=position.getX(i),y=position.getY(i),z=position.getZ(i);
      // Broad pigmentation breaks up the repeated micro-scale pattern. Horn
      // growth bands and membrane mottling remain lit surface detail, not gloss.
      let variation=.84+.08*Math.sin(x*8+y*5+z*11)+.035*Math.cos(z*19+x*14);
      if(mat===horn||mat===armor) variation*=.74+.16*Math.sin(y*73+z*23)+.08*Math.sin(y*191+z*49);
      if(mat===horn) variation*=.64+.36*(.5+.5*Math.sin(y*17+z*7));
      if(mat===membrane) variation*=.8+.11*Math.sin(x*36+z*21)*Math.sin(y*43-z*13);
      colors.push(variation,variation*.98,variation*.94);
    }
    geometry.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));
    let parts=batches.get(parent);if(!parts){parts=new Map();batches.set(parent,parts);}
    if(!parts.has(mat))parts.set(mat,[]);parts.get(mat).push(geometry);
  }
  function ellipsoid(parent,mat,position,scale,rotation=[0,0,0],detail=20) {
    const geometry=new THREE.SphereGeometry(1,detail,Math.max(8,Math.round(detail*.65)));
    if(mat===skin) {
      const uv=geometry.attributes.uv;
      // Keep scales at a physical size across the skull, feet and larger torso.
      const circumference=2*Math.PI*Math.sqrt((scale[0]**2+scale[2]**2)/2);
      const meridian=Math.PI*Math.sqrt((scale[1]**2+scale[2]**2)/2);
      for(let i=0;i<uv.count;i++)uv.setXY(i,uv.getX(i)*circumference,uv.getY(i)*meridian);
    }
    geometry.applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3(...position),new THREE.Quaternion().setFromEuler(new THREE.Euler(...rotation)),new THREE.Vector3(...scale)));
    add(parent,mat,geometry);
  }
  // A tapered cross-section follows a curved centerline, unlike stacked cones.
  function sweep(parent,mat,points,radii,segments=24,sides=12,levelSections=false) {
    const curve=new THREE.CatmullRomCurve3(points.map(point=>new THREE.Vector3(...point)));
    const frames=curve.computeFrenetFrames(segments,false),vertices=[],uv=[],indices=[];
    if(levelSections)for(let i=0;i<=segments;i++) {
      // The shallow skull and jaw need a stable vertical axis: Frenet frames
      // can rotate their flattened cross-sections when the centerline bends.
      frames.normals[i].set(0,-1,0).addScaledVector(frames.tangents[i],frames.tangents[i].y).normalize();
      frames.binormals[i].crossVectors(frames.tangents[i],frames.normals[i]).normalize();
    }
    const uvWidth=mat===skin?2*Math.PI*Math.max(...radii.map(r=>Math.sqrt((r[0]**2+r[1]**2)/2))):1;
    const uvLength=mat===skin?curve.getLength():1;
    for(let i=0;i<=segments;i++) {
      const t=i/segments,p=curve.getPointAt(t),r=t*(radii.length-1),j=Math.min(radii.length-2,Math.floor(r)),f=r-j;
      const radius=THREE.MathUtils.lerp(radii[j][0],radii[j+1][0],f),depth=THREE.MathUtils.lerp(radii[j][1],radii[j+1][1],f);
      for(let k=0;k<=sides;k++) {
        const a=k/sides*Math.PI*2;
        const growth=mat===horn?1+.025*Math.sin(t*110)*(1-t):1;
        const point=p.clone().addScaledVector(frames.normals[i],Math.cos(a)*radius*growth).addScaledVector(frames.binormals[i],Math.sin(a)*depth*growth);
        vertices.push(...point.toArray());uv.push(k/sides*uvWidth,t*uvLength);
        if(i<segments&&k<sides){const n=i*(sides+1)+k;indices.push(n,n+1,n+sides+1,n+1,n+sides+2,n+sides+1);}
      }
    }
    for(const end of [0,1]) {
      const center=vertices.length/3;vertices.push(...curve.getPointAt(end).toArray());uv.push(.5,end);
      const ring=end*segments*(sides+1);
      for(let k=0;k<sides;k++)if(end)indices.push(center,ring+k,ring+k+1);else indices.push(center,ring+k+1,ring+k);
    }
    const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));geometry.setIndex(indices);geometry.computeVertexNormals();add(parent,mat,geometry);
  }
  const chest=new THREE.Group();chest.name='Dragon breathing chest';object.add(chest);
  sweep(chest,skin,[[0,.66,-.7],[0,.77,-.35],[0,.85,.02],[0,.88,.34]],[[.07,.07],[.27,.28],[.3,.31],[.19,.2]],40,32);
  for(let i=0;i<9;i++)ellipsoid(chest,armor,[0,.57,-.4+i*.082],[.19,.035,.065],[0,0,0],16);
  sweep(chest,skin,[[0,.84,.25],[0,1.02,.4],[0,1.26,.55],[0,1.34,.65]],[[.2,.21],[.16,.18],[.12,.14],[.11,.12]],32,24);
  for(let i=0;i<11;i++)ellipsoid(chest,armor,[0,.72+i*.052,.49+i*.026],[.139-i*.006,.027,.009],[.35,0,0],18);
  // Raised dorsal scutes break the silhouette; small surface scales are normal-lit.
  for(let i=0;i<11;i++) {
    const z=-.56+i*.095,y=.88+.17*Math.sin((i/12)*Math.PI);
    sweep(chest,armor,[[0,y,z],[0,y+.12,z-.025],[0,y+.18,z-.07]],[[.065,.055],[.035,.027],[.001,.001]],7,8);

  }
  const head=new THREE.Group();head.name='Dragon head';head.position.set(0,1.31,.63);object.add(head);
  // Continuous cranial ridges taper to a low crocodilian snout. The flattened
  // cross-sections replace the stacked round muzzle and bulbous forehead.
  sweep(head,skin,[[0,.025,-.18],[0,.035,-.035],[0,.01,.16],[0,-.013,.35],[0,-.018,.51]],[[.04,.045],[.115,.16],[.078,.123],[.052,.095],[.017,.065]],36,24,true);
  ellipsoid(head,dark,[0,-.07,.29],[.108,.006,.212]);
  sweep(head,armor,[[0,-.073,.08],[0,-.095,.22],[0,-.084,.4],[0,-.067,.5]],[[.028,.1],[.021,.109],[.014,.086],[.006,.062]],24,16,true);
  for(const side of [-1,1]) {
    sweep(head,skin,[[side*.13,.035,-.09],[side*.154,.018,.04],[side*.134,-.015,.2]],[[.048,.049],[.046,.035],[.019,.017]],18,14);
    ellipsoid(head,dark,[side*.131,.057,.123],[.025,.02,.037],[0,side*.4,0]);
    ellipsoid(head,eye,[side*.15,.057,.138],[.011,.014,.023],[0,side*.35,0]);
    ellipsoid(head,pupil,[side*.16,.057,.146],[.003,.012,.004],[0,side*.35,0],16);
    sweep(head,skin,[[side*.108,.104,.06],[side*.138,.088,.135],[side*.123,.058,.207]],[[.038,.028],[.028,.02],[.012,.009]],12,10);
    ellipsoid(head,dark,[side*.065,-.003,.456],[.012,.006,.016],[.25,side*.4,0],16);
    sweep(head,horn,[[side*.136,.12,-.09],[side*.19,.24,-.24],[side*.22,.29,-.43],[side*.2,.265,-.59]],[[.065,.067],[.046,.047],[.025,.023],[.001,.001]],22,12);
    sweep(head,armor,[[side*.16,-.04,-.065],[side*.27,-.035,-.17],[side*.3,.015,-.27]],[[.055,.056],[.03,.028],[.001,.001]],12,10);
    for(let i=0;i<6;i++) {
      const z=.18+i*.041;
      sweep(head,horn,[[side*(.117-i*.003),-.077,z],[side*(.116-i*.003),-.105,z+.009]],[[.009,.011],[.001,.001]],4,7);
    }
  }
  for(let i=0;i<5;i++)ellipsoid(head,armor,[0,.142-i*.031,.02+i*.09],[.052,.008,.054],[.2,0,0],12);
  const tail=new THREE.Group();tail.name='Dragon tail';tail.position.set(0,.69,-.61);object.add(tail);
  sweep(tail,skin,[[0,0,0],[.05,-.09,-.27],[.21,-.27,-.62],[.3,-.33,-.88],[.23,-.3,-1.03]],[[.19,.18],[.15,.14],[.075,.07],[.033,.035],[.001,.001]],34,16);
  for(let i=0;i<7;i++) {
    const t=i/7;
    sweep(tail,armor,[[.03+t*.27,.1-t*.4,-.1-t*.76],[.03+t*.27,.19-t*.42,-.14-t*.76]],[[.035*(1-t)+.01,.035],[.001,.001]],6,8);
  }
  for(const side of [-1,1])for(const rear of [false,true]) {
    const z=rear?-.43:.39,x=side*.19;
    const knee=[side*(rear?.46:.4),rear?.43:.37,z+(rear?.13:-.06)];
    const ankle=[side*(rear?.39:.36),.15,z+(rear?-.11:.035)];
    sweep(object,skin,[[x,.78,z+(rear?.09:-.17)],[side*(rear?.36:.3),.64,z+(rear?.09:-.08)],knee,ankle,[ankle[0],.075,ankle[2]+.07]],[[rear?.17:.13,rear?.17:.13],[rear?.19:.125,rear?.16:.12],[.093,.085],[.061,.062],[.075,.055]],32,20);
    ellipsoid(object,skin,knee,[.094,.072,.093],[0,0,side*.3],20);
    for(let i=0;i<4;i++)ellipsoid(object,armor,[ankle[0],.12+i*.046,ankle[2]+.057],[.057,.012,.029],[.2,0,0],12);
    const foot=new THREE.Group();foot.name=`Dragon foot ${rear?'rear':'front'} ${side}`;object.add(foot);
    ellipsoid(foot,skin,[ankle[0],.069,ankle[2]+.06],[.112,.069,.17],[],16);
    for(let toe=-1;toe<=1;toe++) {
      const tx=ankle[0]+toe*.075,tz=ankle[2]+.14-Math.abs(toe)*.025;
      sweep(foot,skin,[[tx,.072,tz-.045],[tx+toe*.018,.05,tz+.06]],[[.04,.04],[.023,.025]],8,10);
      sweep(foot,horn,[[tx+toe*.018,.055,tz+.055],[tx+toe*.018,.04,tz+.105],[tx+toe*.022,.009,tz+.145]],[[.025,.024],[.019,.017],[.001,.001]],10,10);
    }
  }
  const wings=[];
  for(const side of [-1,1]) {
    const wing=new THREE.Group();wing.name=`Dragon wing ${side}`;wing.position.set(side*.2,.99,-.1);object.add(wing);wings.push(wing);
    const wrist=[side*.68,.49,-.08],elbow=[side*.3,.3,-.2];
    sweep(wing,skin,[[0,0,0],elbow,wrist],[[.072,.074],[.045,.043],[.031,.032]],22,12);
    const tips=[[side*1.06,.14,-.18],[side*.9,-.15,-.55],[side*.52,-.23,-.84],[side*.05,-.13,-.56],[0,0,0]];
    for(let i=0;i<tips.length;i++) {
      const tip=tips[i],middle=wrist.map((value,j)=>(value+tip[j])*.5+(j===1?.035:0));
      sweep(wing,armor,[wrist,middle,tip],[[.025,.023],[.016,.014],[.004,.004]],16,9);
    }
    sweep(wing,horn,[wrist,[wrist[0]+side*.055,wrist[1]+.065,wrist[2]],[wrist[0]+side*.07,wrist[1]+.04,wrist[2]+.07]],[[.029,.026],[.017,.016],[.001,.001]],10,10);
    for(let panel=0;panel<tips.length-1;panel++) {
      const a=new THREE.Vector3(...tips[panel]),b=new THREE.Vector3(...tips[panel+1]),origin=new THREE.Vector3(...wrist);
      // Tension veins radiate from the wrist across the web and stop before
      // the scalloped edge, sharing the leather material and draw batch.
      for(const fraction of [.28,.58,.8]) {
        const edge=a.clone().lerp(b,fraction).lerp(origin,Math.sin(fraction*Math.PI)*.16);
        const vein=[];
        for(let step=0;step<5;step++) {
          const v=.13+step*.19,point=origin.clone().lerp(edge,v);
          point.z+=Math.sin(fraction*Math.PI)*Math.sin(v*Math.PI)*.07+.005;
          vein.push(point.toArray());
        }
        sweep(wing,membrane,vein,[[.0025,.0025],[.001,.001]],12,5);
      }
      const vertices=[],uv=[],indices=[],n=12;
      // Double-surface membrane with actual thickness and bowed, scalloped webs.
      for(let face=0;face<2;face++)for(let row=0;row<=n;row++)for(let col=0;col<=n;col++) {
        const u=col/n,v=row/n,edge=a.clone().lerp(b,u).lerp(origin,Math.sin(u*Math.PI)*.16);
        const point=origin.clone().lerp(edge,v);
        point.z+=Math.sin(u*Math.PI)*Math.sin(v*Math.PI)*.07+(face?-.004:.004);
        vertices.push(...point.toArray());uv.push(u,v);
      }
      const count=(n+1)*(n+1);
      for(let face=0;face<2;face++)for(let row=0;row<n;row++)for(let col=0;col<n;col++) {
        const i=face*count+row*(n+1)+col,j=i+n+1;
        if(face)indices.push(i,i+1,j,i+1,j+1,j);else indices.push(i,j,i+1,i+1,j,j+1);
      }
      for(let col=0;col<n;col++) {
        const i=n*(n+1)+col;indices.push(i,i+1,i+count,i+1,i+count+1,i+count);
      }
      for(let row=0;row<n;row++) {
        const a=row*(n+1),b=a+n+1,c=a+n,d=b+n;
        indices.push(a,a+count,b,a+count,b+count,b,c,d,c+count,d,d+count,c+count);
      }
      if(side>0)for(let i=0;i<indices.length;i+=3)[indices[i+1],indices[i+2]]=[indices[i+2],indices[i+1]];
      const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));geometry.setIndex(indices);geometry.computeVertexNormals();add(wing,membrane,geometry);
    }
  }
  for(const [parent,materials] of batches)for(const [mat,parts] of materials) {
    const geometry=own(mergeGeometries(parts));for(const part of parts)part.dispose();
    const mesh=new THREE.Mesh(geometry,mat);mesh.castShadow=mesh.receiveShadow=true;
    if(localId)mesh.userData.localId=localId;parent.add(mesh);
  }
  batches.clear();
  return {
    object,
    update(age,reducedMotion=false) {
      const time=reducedMotion?0:age;
      chest.scale.y=1+(reducedMotion?0:Math.sin(time*1.7)*.008);
      head.rotation.y=reducedMotion?0:Math.sin(time*.43)*.065;
      head.rotation.x=reducedMotion?0:Math.sin(time*.83)*.018;
      tail.rotation.y=reducedMotion?0:Math.sin(time*.7)*.06;
      wings.forEach((wing,i)=>{wing.rotation.z=reducedMotion?0:Math.sin(time*1.1)*.018*(i?1:-1);});
    },
    dispose() {object.removeFromParent();for(const resource of resources)resource.dispose();resources.clear();object.clear();},
  };
}
