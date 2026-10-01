// Pure data shared by the browser and the authoritative town. IDs are stable
// checkpoint values; changing a label or model does not invalidate old builds.
export const BUILD_KINDS = [
  {id:'seat',label:'Garden seat',radius:.88,height:.9},
  {id:'planter',label:'Flower planter',radius:.65,height:.8},
  {id:'lamp',label:'Orbital lamp',radius:.48,height:2.8},
  {id:'sculpture',label:'Ribbon sculpture',radius:.72,height:2.1},
];
export const BUILD_FINISHES = [
  {id:'rose',label:'Rose',color:'#b97986',accent:'#edc6bc'},
  {id:'teal',label:'Deep teal',color:'#386b69',accent:'#a5d3c4'},
  {id:'brass',label:'Warm brass',color:'#a77e4c',accent:'#efd39a'},
  {id:'slate',label:'Blue slate',color:'#596a83',accent:'#c0c7d8'},
];
export const buildKind = id => BUILD_KINDS.find(item=>item.id===id)??null;
export const buildFinish = id => BUILD_FINISHES.find(item=>item.id===id)??null;
