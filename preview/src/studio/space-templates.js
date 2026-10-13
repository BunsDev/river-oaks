// Original, metre-based interior layouts. All content uses the built-in catalog.
// Floor zones, furnishings and walls stay independently editable.
export const spaceTemplates = [
  {id:'house',name:'Courtyard House',description:'A warm, furnished home: living room, kitchen, bedroom, bathroom and a sheltered patio.',firstEdit:'Try “Give the living room sage upholstery and warm lighting.”',walkTargets:[{label:'living room',position:[-2,-2]},{label:'kitchen',position:[-1,4]},{label:'bedroom',position:[2,3]},{label:'bathroom',position:[4,-2]},{label:'patio',position:[-2,-8]}]},
  {id:'office',name:'Garden Office',description:'Reception, four workstations, a glazed meeting room and a kitchenette in a calm, compact workplace.',firstEdit:'Try “Rearrange the workstations and keep a clear route to the meeting room.”',walkTargets:[{label:'reception',position:[0,-4]},{label:'work area',position:[-2,1]},{label:'meeting room',position:[3,1]},{label:'kitchenette',position:[-1,5]}]},
  {id:'boutique',name:'Atelier Boutique',description:'A small retail space with window displays, product shelving, fitting rooms and a welcoming checkout.',firstEdit:'Try “Change the displays to walnut and move the central table.”',walkTargets:[{label:'sales floor',position:[0,0]},{label:'checkout',position:[-4,3]},{label:'fitting room one',position:[4,4]},{label:'fitting room two',position:[6.5,4]}]},
  {id:'cafe',name:'Corner Café',description:'A neighborhood café with a service counter, preparation area, indoor seating and a sunny terrace.',firstEdit:'Try “Add a table on the terrace and make the lighting warmer.”',walkTargets:[{label:'seating',position:[0,-2]},{label:'service',position:[0,1]},{label:'preparation',position:[0,4.5]},{label:'terrace',position:[3,-8]}]},
];

function builder(name, floorFinish='oak') {
  const space={schema_version:1,document_type:'studio-space',name,lighting:'daylight',bounds_m:[-12,-11,12,10],spawn:[0,-8.5],objects:[]};
  const add=(id,kind,east,north,width,depth,height,finish='oak',yaw=0,elevation=0,label=id.split('-').map(word=>word[0].toUpperCase()+word.slice(1)).join(' '))=>{
    space.objects.push({id,kind,label,east,north,width,depth,height,yaw,elevation,finish});
  };
  const floor=(id,x,y,w,d,finish=floorFinish)=>add(id,'floor',x,y,w,d,.025,finish);
  const wall=(id,x,y,w,d,kind='wall')=>{
    const rotate=kind==='glazing'&&d>w;
    add(id,kind,x,y,rotate?d:w,rotate?w:d,3.1,kind==='glazing'?'white':'plaster',rotate?90:0);
  };
  const chair=(id,x,y,yaw=0,finish='fabric')=>add(id,'chair',x,y,.6,.65,.85,finish,yaw);
  const plant=(id,x,y)=>add(id,'plant',x,y,.55,.55,1.25,'sage');
  floor('interior-floor',0,0,16,12);
  wall('north-wall',0,6,16.2,.18);
  wall('west-wall',-8,0,.18,12);
  add('east-window','glazing',8,0,12,.12,3.1,'white',90);
  wall('entry-left',-4.5,-6,7,.14,'glazing');wall('entry-right',4.5,-6,7,.14,'glazing');
  add('entry-mat','rug',0,-5,1.8,1.4,.015,'charcoal');
  plant('entry-plant',7,-5);plant('corner-plant',-7,5);
  return {space,add,floor,wall,chair,plant};
}
function house(){
  const {space,add,floor,wall,chair,plant}=builder('Courtyard House');space.lighting='warm';
  floor('bathroom-floor',5.5,-3,4.8,5.8,'limestone');
  floor('patio-floor',-4.5,-8,7,3.6,'terracotta');
  wall('bedroom-divider-north',0,4.65,.16,2.7);wall('bedroom-divider-south',0,.4,.16,1.2);
  wall('bathroom-north',5.5,0,5,.16);wall('bathroom-entry-south',3,-4.5,.16,3);wall('bathroom-entry-north',3,-.5,.16,1);
  add('living-rug','rug',-4.5,-2.8,5.6,3.6,.035,'fabric');
  add('living-sofa','sofa',-6.6,-2.3,2.5,1,.9,'fabric',90);
  add('coffee-table','table',-4.5,-2.8,1.4,.75,.42,'walnut');
  chair('living-armchair',-2.3,-4.4,-25,'sage');
  add('media-console','shelf',-4.5,.6,2.6,.4,.75,'walnut');
  add('living-art','art',-7.88,-2.3,1.5,.04,1,'sage',90,1.3);
  add('kitchen-cabinets','cabinet',-5.85,5.5,2.8,.65,.9,'oak');add('kitchen-cabinets-east','cabinet',-2.15,5.5,2.8,.65,.9,'oak');
  add('kitchen-sink','sink',-4,5.45,.9,.65,.98,'white');
  add('refrigerator','appliance',-7.4,3.7,.7,.75,1.9,'charcoal');
  add('dining-table','table',-3.5,3,2,1,.76,'oak');
  chair('dining-chair-one',-4.1,2.1,180);chair('dining-chair-two',-2.9,2.1,180);chair('dining-chair-three',-4.1,3.9);chair('dining-chair-four',-2.9,3.9);
  add('dining-pendant','pendant',-3.5,3,1.3,.4,.35,'brass',0,2.3);
  add('bedroom-rug','rug',5,3.5,4.6,4,.03,'fabric');
  add('bed','bed',5,3.8,2,2.3,1.05,'fabric');
  add('bedside-left','cabinet',3.45,4.6,.6,.55,.55,'walnut');add('bedside-right','cabinet',6.55,4.6,.6,.55,.55,'walnut');
  add('wardrobe','cabinet',7.25,1.5,2.3,.6,2.3,'oak',-90);
  add('bathroom-vanity','sink',6,-.6,1.7,.7,.9,'limestone');
  add('toilet','toilet',4.25,-4.9,.6,.8,.8,'white');add('shower','shower',6.75,-4.8,1.5,1.6,2.2,'white');
  add('patio-table','table',-5,-8,1,.8,.72,'limestone');chair('patio-chair-one',-6.1,-8,90,'sage');chair('patio-chair-two',-3.9,-8,-90,'sage');plant('patio-plant',-7,-9);
  return space;
}
function office(){
  const {space,add,floor,wall,chair,plant}=builder('Garden Office','concrete');
  floor('meeting-floor',5,2.4,5.7,6.6,'oak');
  wall('meeting-divider-north',2,3.9,.1,4.2,'glazing');wall('meeting-divider-south',2,-.7,.1,1.4,'glazing');
  wall('meeting-south',5,-1.4,6,.1,'glazing');
  add('reception-desk','counter',-4,-4.5,2.4,.8,1.05,'limestone');chair('reception-chair',-4,-3.4,0,'sage');
  add('waiting-sofa','sofa',5,-4.6,2.6,.85,.85,'sage');add('waiting-table','table',5,-3.3,1.2,.6,.45,'oak');
  for(const [i,x,y] of [[1,-5.7,-.4],[2,-2.7,-.4],[3,-5.7,2.9],[4,-2.7,2.9]]){
    add(`work-desk-${i}`,'desk',x,y,1.8,.8,.76,'oak');chair(`work-chair-${i}`,x,y-1,180,'charcoal');
    add(`desk-lamp-${i}`,'pendant',x+.6,y,.25,.25,.3,'brass',0,1);
  }
  add('meeting-table','table',5,2.6,2.2,1.2,.76,'walnut');
  for(const [i,x,y,a] of [[1,3.4,2,90],[2,3.4,3.2,90],[3,6.6,2,-90],[4,6.6,3.2,-90]])chair(`meeting-chair-${i}`,x,y,a,'sage');
  add('meeting-pendant','pendant',5,2.6,1.8,.35,.3,'brass',0,2.4);
  add('kitchenette-cabinets','cabinet',-5.925,5.5,.65,.65,.9,'white');add('kitchenette-cabinets-east','cabinet',-3.275,5.5,3.05,.65,.9,'white');add('kitchenette-sink','sink',-5.2,5.45,.8,.65,.95,'white');
  add('office-storage','shelf',-7.5,1.5,2.4,.6,1.8,'oak',90);
  add('reception-art','art',-7.87,-4,1.3,.05,.9,'sage',90,1.4);plant('meeting-plant',7,5);plant('work-plant',.7,4.8);
  return space;
}
function boutique(){
  const {space,add,floor,wall,chair,plant}=builder('Atelier Boutique','limestone');space.lighting='warm';
  floor('fitting-floor',5.35,4.4,5.1,2.8,'oak');
  wall('fitting-divider',5.2,4.5,.14,3);wall('fitting-west',2.7,4.5,.14,3);
  // Open 1.5m fitting-room entries face the sales floor.
  wall('fitting-front-one',3,3,.6,.12);wall('fitting-front-two',5.2,3,.8,.12);wall('fitting-front-three',7.6,3,.6,.12);
  add('checkout','counter',-4,4.3,2.8,.85,1.05,'walnut');
  add('checkout-storage','cabinet',-4,5.5,3.2,.55,1.8,'oak');
  add('display-table-one','table',-3,-.7,2,1.1,.78,'limestone');add('display-table-two','table',3,-.7,2,1.1,.78,'walnut');
  add('display-product-one','plant',-3,-.7,.4,.4,.6,'sage',0,.8);add('display-product-two','cabinet',3,-.7,.55,.55,.3,'terracotta',0,.8);
  for(let i=0;i<3;i++)add(`wall-display-${i+1}`,'shelf',-7.4,-2.5+i*2.3,1.6,.7,2.1,'oak',90);
  for(let i=0;i<2;i++)add(`east-display-${i+1}`,'shelf',7.4,-2+i*2.7,1.7,.7,1.65,'walnut',-90);
  add('window-plinth-one','cabinet',-4.5,-5,1.5,.8,.55,'limestone');add('window-plinth-two','cabinet',4.5,-5,1.5,.8,.55,'limestone');
  add('window-art-one','art',-4.5,-5,.55,.08,.8,'terracotta',0,.56);add('window-art-two','art',4.5,-5,.55,.08,.8,'sage',0,.56);
  chair('fitting-chair-one',4.2,5.3,0,'fabric');chair('fitting-chair-two',6.65,5.3,0,'fabric');
  add('fitting-mirror-one','glazing',4,5.85,1.2,.05,1.7,'brass',0,.5);add('fitting-mirror-two','glazing',6.6,5.85,1.2,.05,1.7,'brass',0,.5);
  add('display-pendant-one','pendant',-3,-.7,1,.4,.3,'brass',0,2.4);add('display-pendant-two','pendant',3,-.7,1,.4,.3,'brass',0,2.4);
  plant('checkout-plant',-1.5,5);return space;
}
function cafe(){
  const {space,add,floor,chair,plant}=builder('Corner Café','terracotta');space.lighting='warm';
  floor('terrace-floor',4.6,-8,6.6,3.6,'limestone');floor('preparation-floor',0,4.5,15.7,2.6,'concrete');
  add('service-counter-left','counter',-4.6,2.6,5.6,.8,1.05,'oak');add('service-counter-right','counter',4.6,2.6,5.6,.8,1.05,'oak');
  add('prep-cabinets','cabinet',-4.525,5.5,1.95,.65,.92,'charcoal');add('prep-cabinets-east','cabinet',1.525,5.5,7.95,.65,.92,'charcoal');add('prep-sink','sink',-3,5.45,1.1,.65,.97,'white');
  add('coffee-machine','appliance',4.8,2.6,1,.6,.6,'charcoal',0,1.07);
  add('pastry-display','glazing',-4.5,2.6,1.8,.65,.55,'brass',0,1.07);
  for(const [i,x,y] of [[1,-5.8,-3.8],[2,-2.6,-.1],[3,5.5,-3.8],[4,4.6,-.1]]){
    add(`cafe-table-${i}`,'table',x,y,1.05,.8,.74,'walnut');chair(`cafe-chair-${i}-a`,x-.95,y,90,'sage');chair(`cafe-chair-${i}-b`,x+.95,y,-90,'sage');
    add(`table-vase-${i}`,'plant',x,y,.2,.2,.3,'sage',0,.75);
  }
  add('terrace-table','table',5.5,-8,1,.8,.74,'limestone');chair('terrace-chair-a',4.5,-8,90,'sage');chair('terrace-chair-b',6.5,-8,-90,'sage');
  add('counter-pendant-one','pendant',-4.6,2.6,1.2,.4,.35,'brass',0,2.3);add('counter-pendant-two','pendant',4.6,2.6,1.2,.4,.35,'brass',0,2.3);
  add('menu-art','art',0,5.88,2.3,.04,1,'charcoal',0,1.4);plant('terrace-planter',7.4,-9);return space;
}
const factories={house,office,boutique,cafe};
export function createSpace(id){if(!Object.hasOwn(factories,id))throw Error('Choose a known space template.');return factories[id]();}
