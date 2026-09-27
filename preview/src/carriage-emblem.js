import * as THREE from 'three';

// Shallow cast relief on the door, in metres. Everything joins the door's
// existing material batches, so the crest adds detail without separate draws.
export function addCarriageEmblem(group, {mesh, gold, darkGold, enamel, pearl, velvet, jewel}) {
  const at=([x,y,z=0])=>[x,1.44+y,.982+z];
  const add=(geometry,material,position=[0,0,0],scale=[1,1,1])=>mesh(group,geometry,material,at(position),scale);
  const cord=(points,r=.0035,material=gold,closed=false)=>{
    const curve=new THREE.CatmullRomCurve3(points.map(p=>new THREE.Vector3(...p)),closed,'centripetal');
    return add(new THREE.TubeGeometry(curve,Math.max(32,points.length*6),r,10,closed),material);
  };
  const bead=(p,r=.0045,material=pearl)=>add(new THREE.SphereGeometry(r,12,8),material,p);
  const relief=(shape,material,z,depth=.005,scale=1)=>{
    const geometry=new THREE.ExtrudeGeometry(shape,{depth,bevelEnabled:true,bevelSegments:3,bevelSize:.002,bevelThickness:.002,curveSegments:24,steps:1});
    geometry.scale(scale,scale,1);
    return add(geometry,material,[0,0,z]);
  };
  const shield=new THREE.Shape();
  shield.moveTo(-.136,.126);shield.bezierCurveTo(-.073,.14,-.042,.116,0,.126);
  shield.bezierCurveTo(.042,.116,.073,.14,.136,.126);
  shield.bezierCurveTo(.14,.035,.108,-.082,.068,-.12);
  shield.quadraticCurveTo(.034,-.157,0,-.178);
  shield.quadraticCurveTo(-.034,-.157,-.068,-.12);
  shield.bezierCurveTo(-.108,-.082,-.14,.035,-.136,.126);
  relief(shield,darkGold,0,.010,1.06);
  relief(shield,gold,.012,.008);
  relief(shield,enamel,.023,.006,.87);
  // A fine milled inner lip and separately seated pearls cast real shadows.
  const outline=shield.getSpacedPoints(70).slice(0,-1);
  cord(outline.map(p=>[p.x*.91,p.y*.91,.031]),.0022,gold,true);
  for(let i=0;i<outline.length;i+=2)bead([outline[i].x*.985,outline[i].y*.985,.026],.0034);
  // Engine-turned lines sit below the monogram, like engraving under enamel.
  for(let i=-3;i<=3;i++)cord([[-.085,.065+i*.018,.032],[-.035,.055+i*.018,.032],[.035,.065+i*.018,.032],[.085,.055+i*.018,.032]],.00065,darkGold);
  // Raised, flowing J; its dark backing gives the lettering a recessed edge.
  const monogram=[[-.053,.062,.043],[-.024,.092,.043],[.026,.096,.043],[.057,.08,.043],[.044,.048,.043],[.032,.003,.043],[.017,-.060,.043],[-.009,-.096,.043],[-.046,-.09,.043],[-.06,-.059,.043],[-.044,-.041,.043]];
  cord(monogram.map(([x,y,z])=>[x,y,z-.003]),.0085,darkGold);
  cord(monogram,.0058,gold);
  cord([[-.018,.065,.043],[.02,.061,.043],[.058,.059,.043]],.003,gold);
  bead([-.043,-.040,.045],.0055,gold);

  // Paired laurel sprays: curved, ridged leaves rather than round wire curls.
  for(const side of [-1,1]) {
    const stem=Array.from({length:21},(_,i)=>{const t=i/20;return [side*(.082+.136*Math.sin(t*Math.PI*.73)),-.207+t*.34,.013];});
    cord(stem,.005,darkGold);cord(stem.map(([x,y,z])=>[x,y,z+.004]),.0028,gold);
    for(let i=2;i<19;i+=2)for(const direction of [-1,1]) {
      const [x,y,z]=stem[i],tip=[x+side*direction*.043,y+.047,z+.009];
      const axis=new THREE.Vector3(tip[0]-x,tip[1]-y,tip[2]-z),across=new THREE.Vector3(-axis.y,axis.x,0).normalize();
      const vertices=[],indices=[];
      for(let row=0;row<=8;row++)for(let col=0;col<3;col++) {
        const t=row/8,p=new THREE.Vector3(x,y,z).addScaledVector(axis,t).addScaledVector(across,(col-1)*.012*Math.sin(t*Math.PI));
        p.z+=Math.sin(t*Math.PI)*(col===1?.010:.001);vertices.push(...p.toArray());
      }
      for(let row=0;row<8;row++)for(let col=0;col<2;col++){const a=row*3+col;indices.push(a,a+3,a+1,a+1,a+3,a+4);}
      const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));geometry.setAttribute('uv',new THREE.Float32BufferAttribute(new Float32Array(vertices.length/3*2),2));geometry.setIndex(indices);geometry.computeVertexNormals();
      add(geometry,gold);cord([[x,y,z+.003],[x+axis.x*.5,y+axis.y*.5,z+.016],tip],.0012,darkGold);
    }
    cord([[side*.075,-.201,.019],[side*.15,-.223,.018],[side*.244,-.187,.017],[side*.257,-.16,.018],[side*.232,-.158,.021]],.0045,gold);
  }

  // Velvet crown cap, a curved jeweled band, and connected gilded arches.
  add(new THREE.SphereGeometry(1,24,16,0,Math.PI*2,0,Math.PI/2),velvet,[0,.177,.019],[.099,.092,.034]);
  const band=new THREE.Shape();band.moveTo(-.109,.161);band.quadraticCurveTo(0,.149,.109,.161);band.lineTo(.104,.185);band.quadraticCurveTo(0,.174,-.104,.185);band.closePath();
  relief(band,gold,.031,.009);
  for(let i=-4;i<=4;i++)bead([i*.023,.165+Math.abs(i)*.0018,.044],.0042,i%2?pearl:jewel);
  for(const x of [-.093,-.047,0,.047,.093]) {
    cord([[x,.184,.028],[x*.88,.224,.046],[x*.48,.259,.035],[0,.276,.023]],.0038,gold);
    const lily=new THREE.Shape();lily.moveTo(x-.009,.181);lily.quadraticCurveTo(x-.019,.204,x-.008,.2);lily.quadraticCurveTo(x-.012,.217,x,.225);lily.quadraticCurveTo(x+.012,.217,x+.008,.2);lily.quadraticCurveTo(x+.019,.204,x+.009,.181);lily.closePath();
    relief(lily,gold,.042,.003);bead([x,.196,.049],.0035);
  }
  bead([0,.278,.024],.009,gold);
  add(new THREE.OctahedronGeometry(.014),jewel,[0,.298,.024],[.75,1,.7]);
  // A pendant rose and knot finish the lower wreath without floating parts.
  for(let i=0;i<5;i++){const a=i*Math.PI*2/5;bead([Math.cos(a)*.009,-.217+Math.sin(a)*.009,.032],.006,gold);}
  bead([0,-.217,.039],.005,jewel);
}
