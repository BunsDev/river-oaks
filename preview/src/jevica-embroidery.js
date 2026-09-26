import * as THREE from 'three';

// Original, seamless floral scrollwork. Data textures keep the costume usable
// in the renderer and in DOM-free asset checks, without external image assets.
export function createJevicaEmbroidery() {
  const width=2048,height=512,mask=new Uint8Array(width*height);
  const mark=(u,v,radius=1.2)=>{
    const x=u*width,y=v*height;
    for(let py=Math.floor(y-radius);py<=Math.ceil(y+radius);py++)
      for(let px=Math.floor(x-radius);px<=Math.ceil(x+radius);px++) {
        if(py<0||py>=height)continue;
        const coverage=THREE.MathUtils.clamp(radius+.5-Math.hypot(px-x,py-y),0,1);
        const index=py*width+(px%width+width)%width;
        mask[index]=Math.max(mask[index],Math.round(coverage*255));
      }
  };
  const curve=(fn,radius)=>{for(let i=0;i<=160;i++){const [u,v]=fn(i/160);mark(u,v,radius);}};
  for(let motif=0;motif<12;motif++) {
    const draw=(fn,radius=1.2)=>curve(t=>{const [x,y]=fn(t);return [(motif+x)/12,y];},radius);
    // Double scalloped border, rising stems, paired leaves and inward curls.
    for(const offset of [.018,.030])draw(t=>[t,offset+.023*(1-Math.cos(t*Math.PI*2))],1.4);
    draw(t=>[.5+.025*Math.sin(t*Math.PI*2),.044+t*.19],1.7);
    for(const side of [-1,1]) {
      for(let leaf=0;leaf<3;leaf++)draw(t=>[
        .5+side*(.06+leaf*.058)*Math.sin(Math.PI*t),
        .21-leaf*.042-.036*t+.011*Math.sin(t*Math.PI*2),
      ],1.3);
      draw(t=>{
        const a=t*Math.PI*2.6,r=.18*(1-t);
        return [.5+side*(.25+r*Math.cos(a)),.088+r*.23*Math.sin(a)];
      });
      draw(t=>[.5+side*(.02+.31*t),.135-.07*t+.026*Math.sin(t*Math.PI)],1.4);
    }
  }
  const color=new Uint8Array(width*height*4),surface=new Uint8Array(color.length);
  for(let i=0;i<mask.length;i++) {
    const gold=mask[i]/255;
    color.set([Math.round(211+gold*(-21)),Math.round(131+gold*20),Math.round(156-gold*83),255],i*4);
    // G: roughness, B: metalness. Gold catches light independently of the silk.
    surface.set([255,Math.round(235-gold*100),mask[i],255],i*4);
  }
  const texture=data=>{
    const map=new THREE.DataTexture(data,width,height);
    map.wrapS=THREE.RepeatWrapping;map.magFilter=THREE.LinearFilter;
    map.minFilter=THREE.LinearMipmapLinearFilter;map.generateMipmaps=true;map.needsUpdate=true;
    return map;
  };
  const map=texture(color),properties=texture(surface);map.colorSpace=THREE.SRGBColorSpace;
  return {map,properties};
}
