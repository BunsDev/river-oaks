import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { physicalSurface } from '../materials.js';
import { thinStorefrontGlass } from '../storefront-materials.js';
import { buildSpaceWorld } from './space-document.js';
export { buildSpaceWorld } from './space-document.js';

const FINISHES = {
  plaster: ['#e5dfd2', .92, 0], oak: ['#b58b5c', .6, 0], walnut: ['#644634', .55, 0],
  limestone: ['#ddd1b9', .72, 0], concrete: ['#bbb9af', .83, 0], terracotta: ['#b76e50', .88, 0],
  fabric: ['#e6d8bd', 1, 0], sage: ['#83917d', .88, 0], brass: ['#bda36d', .28, .82],
  charcoal: ['#333833', .65, .08], white: ['#eeeae2', .36, 0],
};

export function createSpaceScene(space, theme = 'light') {
  const group = new THREE.Group(), items = new Map(), world = buildSpaceWorld(space);
  const geometries = new Map(), materials = new Map();
  const geometry = (name, factory) => {
    if (!geometries.has(name)) geometries.set(name,factory());
    return geometries.get(name);
  };
  const finish = (name, surface = false, variant = '') => {
    const key = `${name}:${surface}:${variant}`;
    if (!materials.has(key)) {
      const [color,roughness,metalness] = FINISHES[name] ?? FINISHES.plaster;
      const options = { color,roughness,metalness };
      const material = surface && ['limestone','concrete','terracotta'].includes(name)
        ? physicalSurface(name === 'limestone' ? 'stone' : name === 'terracotta' ? 'paver' : 'pavement', { ...options, tileSize: 2.4, normalScale: new THREE.Vector2(.22,.22), aoMapIntensity: .3, textureContrast: .5 })
        : new THREE.MeshStandardMaterial(options);
      materials.set(key,material);
    }
    return materials.get(key);
  };
  const glass = () => {
    if (!materials.has('glass')) materials.set('glass',thinStorefrontGlass());
    return materials.get('glass');
  };
  const special = (key, options) => {
    if (!materials.has(key)) materials.set(key,new THREE.MeshStandardMaterial(options));
    return materials.get(key);
  };
  const boxGeometry = () => geometry('box',()=>new THREE.BoxGeometry(1,1,1));
  const roundGeometry = () => geometry('round',()=>new RoundedBoxGeometry(1,1,1,2,.08));
  const sphereGeometry = () => geometry('sphere',()=>new THREE.SphereGeometry(.5,16,10));
  const cylinderGeometry = () => geometry('cylinder',()=>new THREE.CylinderGeometry(.5,.5,1,20));
  const mesh = (parent, shape, material, position, scale, name) => {
    const child = new THREE.Mesh(shape,material);child.position.set(...position);child.scale.set(...scale);
    child.name = name;child.castShadow = !material.transparent;child.receiveShadow = true;parent.add(child);return child;
  };
  const box = (parent, material, size, position, name, rounded = false) => mesh(parent,rounded ? roundGeometry() : boxGeometry(),material,position,size,name);
  const sphere = (parent, material, size, position, name) => mesh(parent,sphereGeometry(),material,position,size,name);
  const cylinder = (parent, material, size, position, name) => mesh(parent,cylinderGeometry(),material,position,size,name);
  const legs = (root, mat, top = .86, width = .06, inset = .4) => {
    for (const x of [-inset,inset]) for (const z of [-inset,inset]) box(root,mat,[width,top,width],[x,top/2,z],'Leg');
  };
  const cabinet = (root, mat, height = .9) => {
    box(root,mat,[.98,height-.08,.94],[0,(height+.08)/2,-.02],'Cabinet case');
    box(root,finish('charcoal'),[.88,.08,.8],[0,.04,-.05],'Recessed toe kick');
    const doors=Math.max(1,Math.min(16,Math.ceil(root.scale.x/.65))),width=.98/doors,gap=Math.min(.01,.006/root.scale.x);
    for (let i=0;i<doors;i++) {
      const x=-.49+(i+.5)*width;
      box(root,mat,[width-gap,height-.13,.035],[x,(height+.1)/2,.468],'Door',true);
      box(root,finish('brass'),[Math.min(.018,.014/root.scale.x),.12,.028],[x+width*.32,height*.7,.495-.014],'Pull');
    }
  };
  const metricBox = object => {
    const key = `metric:${object.width}:${object.height}:${object.depth}`;
    return geometry(key,()=>{
      const shape = new THREE.BoxGeometry(1,1,1), uv = shape.attributes.uv;
      for (let face = 0; face < 6; face++) {
        const [u,v] = face < 2 ? [object.depth,object.height] : face < 4 ? [object.width,object.depth] : [object.width,object.height];
        for (let vertex = 0; vertex < 4; vertex++) { const i = face*4+vertex;uv.setXY(i,uv.getX(i)*u,uv.getY(i)*v); }
      }
      return shape;
    });
  };
  let lamps = 0, floorIndex = 0;
  for (const object of space.objects) {
    const root = new THREE.Group();root.name = object.label;root.userData.studioId = object.id;root.userData.kind = object.kind;
    root.position.set(object.east,object.elevation,-object.north);root.scale.set(object.width,object.height,object.depth);root.rotation.y = object.yaw*Math.PI/180;
    group.add(root);items.set(object.id,root);
    const mat = finish(object.finish,['floor','table','desk','shower'].includes(object.kind),object.kind === 'floor' ? object.id : '');
    const wood = () => finish(['oak','walnut'].includes(object.finish) ? object.finish : 'oak');
    switch (object.kind) {
      case 'wall': {
        box(root,mat,[1,1,.92],[0,.5,0],'Plaster wall');
        const baseHeight = Math.min(.16,.09/object.height);
        for (const z of [-.48,.48]) box(root,finish('white'),[1,baseHeight,.04],[0,baseHeight/2,z],'Skirting');
        break;
      }
      case 'glazing': {
        box(root,glass(),[.96,.96,.14],[0,.5,0],'Glass pane');
        const stile = Math.min(.1,.055/object.width), rail = Math.min(.1,.055/object.height);
        for (const x of [-.5+stile/2,.5-stile/2]) box(root,mat,[stile,1,1],[x,.5,0],'Window stile');
        for (const y of [rail/2,1-rail/2]) box(root,mat,[1,rail,1],[0,y,0],'Window rail');
        const panels = Math.max(1,Math.ceil(object.width/1.6));
        for (let i = 1; i < panels; i++) box(root,mat,[stile*.6,1,.8],[-.5+i/panels,.5,0],'Mullion');
        break;
      }
      case 'floor': {
        // Floors end at their editable elevation so feet stay on the room datum.
        // Named finish zones can overlay the main room slab without depth fighting.
        mat.polygonOffset=true;mat.polygonOffsetFactor=0;mat.polygonOffsetUnits=-floorIndex++;
        mesh(root,metricBox(object),mat,[0,-.5,0],[1,1,1],'Floor surface');
        if (['oak','walnut'].includes(object.finish)) {
          // Fine board joints use one draw call; dimensions remain metres when resized.
          const positions = [], boards = Math.min(64,Math.ceil(object.width/.18));
          for (let i = 1; i < boards; i++) positions.push(-.5+i/boards,0,-.5,-.5+i/boards,0,.5);
          const rows = Math.min(12,Math.ceil(object.depth/1.8));
          for (let i = 0; i < boards; i++) for (let j = 1; j < rows; j++) {
            const z = -.5+(j+(i%3)*.26)/rows;
            positions.push(-.5+i/boards,0,z,-.5+(i+1)/boards,0,z);
          }
          const shape = new THREE.BufferGeometry();shape.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
          const lines = new THREE.LineSegments(shape,new THREE.LineBasicMaterial({ color: object.finish === 'oak' ? '#896647' : '#4b3429', transparent:true,opacity:.3 }));
          lines.name = 'Timber joints';root.add(lines);
        }
        break;
      }
      case 'sofa': {
        legs(root,finish('walnut'),.17,.055,.4);
        box(root,mat,[.98,.28,.94],[0,.29,0],'Upholstered base',true);
        box(root,mat,[.96,.64,.2],[0,.68,-.4],'Backrest',true);
        for (const x of [-.44,.44]) box(root,mat,[.12,.55,.93],[x,.565,0],'Armrest',true);
        for (const x of [-.205,.205]) {
          box(root,mat,[.395,.2,.7],[x,.52,.075],'Seat cushion',true);
          box(root,mat,[.385,.35,.13],[x,.765,-.23],'Back cushion',true);
        }
        break;
      }
      case 'chair': {
        legs(root,wood(),.49,.065,.37);
        box(root,mat,[.94,.12,.92],[0,.52,.02],'Seat cushion',true);
        box(root,mat,[.9,.43,.15],[0,.785,-.395],'Backrest',true);
        for (const x of [-.37,.37]) box(root,wood(),[.055,.43,.055],[x,.785,-.4],'Back support');
        break;
      }
      case 'table':
      case 'desk': {
        legs(root,wood(),.91,.055,.4);
        box(root,mat,[1,.09,1],[0,.955,0],'Tabletop',true);
        if (object.kind === 'desk') {
          box(root,mat,[.27,.35,.8],[.315,.715,0],'Drawer pedestal');
          for (const y of [.6,.74,.88]) {
            box(root,mat,[.25,.12,.025],[.315,y,.411],'Drawer');
            box(root,finish('brass'),[.11,.013,.02],[.315,y,.433],'Drawer handle');
          }
        }
        break;
      }
      case 'bed': {
        legs(root,wood(),.15,.055,.38);
        box(root,wood(),[.96,.25,.94],[0,.265,.025],'Bed frame');
        box(root,mat,[1,.92,.065],[0,.54,-.4675],'Headboard',true);
        box(root,finish('white'),[.92,.25,.85],[0,.515,.05],'Mattress',true);
        box(root,mat,[.925,.06,.59],[0,.67,.16],'Duvet',true);
        for (const x of [-.235,.235]) box(root,finish('fabric'),[.41,.16,.22],[x,.71,-.275],'Pillow',true);
        box(root,finish('sage'),[.92,.03,.2],[0,.715,.32],'Folded throw',true);
        break;
      }
      case 'cabinet':
      case 'counter': {
        cabinet(root,mat,.92);
        box(root,object.kind === 'counter' ? finish('limestone',true) : mat,[1,.08,1],[0,.96,0],'Countertop',true);
        break;
      }
      case 'shelf': {
        box(root,mat,[1,1,.06],[0,.5,-.47],'Back panel');
        for (const x of [-.47,.47]) box(root,mat,[.06,1,1],[x,.5,0],'Side panel');
        for (const y of [.025,.26,.495,.73,.975]) box(root,mat,[1,.05,1],[0,y,0],'Shelf');
        const bays=Math.min(12,Math.ceil(object.width/1.2));
        for(let i=1;i<bays;i++)box(root,mat,[Math.min(.04,.025/object.width),1,.96],[-.5+i/bays,.5,-.02],'Shelf divider');
        for (const [x,y,tone] of [[-.28,.4,'sage'],[.2,.17,'terracotta'],[.15,.87,'fabric']]) {
          box(root,finish(tone),[.21,.16,.5],[x,y,-.03],'Display object',true);
          box(root,finish('white'),[.27,.035,.55],[x,y-.08,0],'Book');
        }
        break;
      }
      case 'sink': {
        cabinet(root,mat,.56);
        const stone = finish('limestone',true), metal = finish('brass');
        box(root,mat,[.98,.2,.035],[0,.64,.47],'Basin fascia');
        for (const x of [-.47,.47]) box(root,mat,[.04,.2,.94],[x,.64,0],'Basin cabinet side');
        for (const x of [-.385,.385]) box(root,stone,[.23,.06,1],[x,.74,0],'Basin surround');
        for (const z of [-.39,.39]) box(root,stone,[.54,.06,.22],[0,.74,z],'Basin surround');
        box(root,finish('white'),[.54,.025,.56],[0,.57,0],'Basin bottom');
        for (const x of [-.255,.255]) box(root,finish('white'),[.03,.15,.56],[x,.66,0],'Basin side');
        for (const z of [-.265,.265]) box(root,finish('white'),[.54,.15,.03],[0,.66,z],'Basin side');
        cylinder(root,metal,[.045,.22,.045],[.1,.875,-.37],'Tap riser');
        box(root,metal,[.045,.045,.3],[.1,.9775,-.24],'Tap spout',true);
        break;
      }
      case 'toilet': {
        const ceramic = finish(object.finish === 'white' ? 'white' : object.finish);
        box(root,ceramic,[.73,.52,.28],[0,.72,-.36],'Cistern',true);
        box(root,ceramic,[.78,.035,.32],[0,.9825,-.34],'Cistern lid',true);
        const bowl = geometry('bowl',()=>new THREE.LatheGeometry([[.13,.18],[.25,.24],[.38,.48],[.36,.6],[.32,.63],[.29,.59],[.26,.46],[.1,.41],[0,.41]].map(([x,y])=>new THREE.Vector2(x,y)),28));
        mesh(root,bowl,ceramic,[0,0,.025],[1,1,1.2],'Bowl');
        box(root,ceramic,[.44,.34,.5],[0,.17,.02],'Pedestal',true);
        const ring = geometry('seat-ring',()=>new THREE.TorusGeometry(.34,.07,8,28));
        const seat = mesh(root,ring,finish('white'),[0,.63,.06],[1,1,1.04],'Seat ring');seat.rotation.x = Math.PI/2;
        box(root,finish('brass'),[.16,.025,.05],[.2,.86,-.202],'Flush control');
        break;
      }
      case 'shower': {
        box(root,finish('white'),[1,.035,1],[0,.0175,0],'Shower tray');
        box(root,glass(),[.02,.965,1],[-.49,.5175,0],'Side screen');
        box(root,glass(),[.02,.965,1],[.49,.5175,0],'Side screen');
        box(root,mat,[1,.965,.03],[0,.5175,-.485],'Shower wall');
        cylinder(root,finish('brass'),[.018,.55,.018],[.15,.61,-.43],'Riser');
        box(root,finish('brass'),[.025,.018,.28],[.15,.88,-.3],'Shower arm');
        cylinder(root,finish('brass'),[.23,.015,.23],[.15,.87,-.16],'Rain head');
        cylinder(root,finish('charcoal'),[.08,.005,.08],[.23,.037,.23],'Drain');
        break;
      }
      case 'plant': {
        const pot = geometry('pot',()=>new THREE.CylinderGeometry(.3,.23,.3,20));
        mesh(root,pot,mat,[0,.15,0],[1,1,1],'Planter');
        cylinder(root,finish('walnut'),[.52,.025,.52],[0,.295,0],'Soil');
        cylinder(root,finish('walnut'),[.025,.59,.025],[0,.59,0],'Stem');
        for (let i = 0; i < 9; i++) {
          const angle = i*2.39996, reach = i%2 ? .26 : .2, y = .43+i*.055;
          const leaf = sphere(root,finish('sage'),[.31,.065,.17],[Math.sin(angle)*reach,y,Math.cos(angle)*reach],'Leaf');
          leaf.rotation.y = angle;leaf.rotation.z = Math.sin(angle)*.28;
        }
        break;
      }
      case 'rug': {
        box(root,mat,[1,.65,1],[0,.325,0],'Woven border',true);
        box(root,finish('fabric'),[.91,.35,.91],[0,.825,0],'Woven field',true);
        for (const x of [-.43,.43]) box(root,mat,[.016,.02,.86],[x,.99,0],'Border stripe');
        break;
      }
      case 'art': {
        const frame = finish('walnut');
        box(root,finish('fabric'),[.92,.92,.2],[0,.5,0],'Canvas');
        for (const x of [-.475,.475]) box(root,frame,[.05,1,.8],[x,.5,0],'Frame');
        for (const y of [.025,.975]) box(root,frame,[1,.05,.8],[0,y,0],'Frame');
        box(root,mat,[.56,.45,.03],[-.11,.53,.13],'Abstract field');
        const disc = cylinder(root,finish('terracotta'),[.32,.03,.32],[.2,.61,.16],'Abstract circle');disc.rotation.x = Math.PI/2;
        box(root,finish('sage'),[.75,.12,.035],[0,.23,.14],'Abstract horizon');
        break;
      }
      case 'pendant': {
        cylinder(root,finish('charcoal'),[.025,.57,.025],[0,.715,0],'Suspension');
        cylinder(root,mat,[.2,.04,.2],[0,.98,0],'Ceiling rose');
        const shade = geometry('shade',()=>new THREE.CylinderGeometry(.2,.5,.38,28,1,true));
        mesh(root,shade,mat,[0,.25,0],[1,1,1],'Shade');
        const emitter = special('lamp',{ color:'#fff2d2', emissive:'#ffda98', emissiveIntensity:1.4, roughness:.45 });
        cylinder(root,emitter,[.86,.025,.86],[0,.06,0],'Diffuser');
        if (lamps++ < 4) {
          const light = new THREE.PointLight('#ffe5bd',space.lighting === 'daylight' ? 5 : 12,7,2);light.position.y=.05;root.add(light);
        }
        break;
      }
      case 'appliance': {
        // Proportions distinguish a tall refrigerator, a compact counter machine
        // and a standard cooker without adding undocumented document fields.
        if (object.height > 1.4) {
          box(root,mat,[.98,.98,.94],[0,.5,-.02],'Refrigerator case',true);
          box(root,mat,[.95,.59,.035],[0,.686,.468],'Upper refrigerator door',true);
          box(root,mat,[.95,.355,.035],[0,.195,.468],'Freezer drawer',true);
          box(root,finish('brass'),[.025,.24,.025],[.36,.58,.485],'Door handle');
          box(root,finish('brass'),[.58,.017,.025],[0,.32,.485],'Freezer handle');
          box(root,finish('charcoal'),[.12,.08,.008],[.27,.77,.489],'Temperature display');
          box(root,finish('charcoal'),[.87,.035,.82],[0,.0175,0],'Recessed base');
          break;
        }
        if (object.height < .7 && object.elevation > .5) {
          box(root,mat,[.98,.39,.93],[0,.79,-.015],'Coffee machine head',true);
          box(root,mat,[.95,.56,.08],[0,.32,-.45],'Rear panel');
          for (const x of [-.43,.43]) box(root,mat,[.12,.55,.85],[x,.35,-.045],'Side support',true);
          box(root,finish('charcoal'),[.96,.08,.96],[0,.04,0],'Drip tray');
          for (const x of [-.23,.23]) {
            cylinder(root,finish('brass'),[.08,.12,.08],[x,.545,.14],'Group head');
            cylinder(root,finish('white'),[.16,.17,.2],[x,.165,.14],'Cup');
            const dial = cylinder(root,finish('brass'),[.1,.025,.1],[x,.8,.466],'Control');dial.rotation.x=Math.PI/2;
          }
          break;
        }
        box(root,mat,[.98,.95,.94],[0,.475,0],'Appliance body',true);
        box(root,finish('charcoal'),[.88,.055,.88],[0,.9725,0],'Cooktop');
        for (const x of [-.24,.24]) for (const z of [-.23,.23]) cylinder(root,finish('charcoal'),[.26,.006,.26],[x,.999-.003,z],'Burner');
        box(root,finish('charcoal'),[.78,.52,.025],[0,.405,.48],'Oven window',true);
        box(root,finish('brass'),[.64,.027,.035],[0,.727,.4825],'Oven handle');
        for (const x of [-.3,-.1,.1,.3]) {
          const dial = cylinder(root,finish('brass'),[.06,.025,.06],[x,.85,.48],'Control dial');dial.rotation.x=Math.PI/2;
        }
        break;
      }
    }
  }
  const [west,south,east,north] = space.bounds_m;
  const environment = new THREE.Group();environment.name='@environment';group.add(environment);
  const groundMat = new THREE.MeshStandardMaterial({ color:'#c5c7b8',roughness:1 });
  box(environment,groundMat,[east-west,.04,north-south],[(east+west)/2,-.03,-(north+south)/2],'Surrounding ground');
  const fill = new THREE.HemisphereLight('#fff5e1','#858b75',.35);environment.add(fill);
  const arrival = new THREE.Group();arrival.name='Arrival';arrival.userData.studioId='@arrival';arrival.userData.kind='arrival';arrival.position.set(space.spawn[0],0,-space.spawn[1]);
  group.add(arrival);items.set('@arrival',arrival);
  const marker = special('arrival',{color:'#466e5e',roughness:.6});
  cylinder(arrival,marker,[.55,.025,.55],[0,.03,0],'Arrival disc');
  mesh(arrival,geometry('arrival-arrow',()=>new THREE.ConeGeometry(.12,.3,3)),marker,[0,.2,0],[1,1,1],'Arrival arrow');
  function setAppearance(appearance) {
    groundMat.color.set(appearance === 'dark' ? '#535c50' : '#c5c7b8');
    fill.intensity = space.lighting === 'evening' ? .2 : .35;
    fill.color.set(space.lighting === 'warm' ? '#ffe4bd' : '#fff5e1');
  }
  setAppearance(theme);group.updateMatrixWorld(true);
  return { group,items,world,setAppearance,setWalk(enabled) { arrival.visible = !enabled; } };
}
