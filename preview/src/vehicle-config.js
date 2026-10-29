// @ts-check
/** @typedef {'rolls'|'motorcycle'|'bicycle'} VehicleKind */
/** @typedef {[number,number,number]} Point3 */
/** @typedef {{kind:VehicleKind,label:string,length:number,width:number,height:number,wheelbase:number,maxSpeed:number,cruiseSpeed?:number,seats?:number,chauffeur?:boolean,shared?:boolean,steeringLimit:number,steeredWheels:number,wheels:Point3[],driverSeat:Point3,passengerSeat:Point3,driverFloor:number,bodyHeight:number,passengerFloor:number,grips:Point3[]}} VehicleSpec */
// Who drives, and who may ride (Val, 2026-10-29): Jev chauffeurs only the pink
// car (`chauffeur`), so Jevica rides in its passenger seat and may hand him the
// route. Every other kind is driven by the player from its driver seat, with no
// Jev aboard: the motorcycle, the plaza bicycle and any later garage vehicle.
// A kind without `shared` stays exclusive to the Jevica owner (server/world.js);
// the motorcycle is shared, so every account may call and ride one.
/** @type {Record<VehicleKind,VehicleSpec>} */
export const VEHICLES = {
 rolls:{kind:'rolls',label:'Pink Rolls-Royce',length:4.62,width:1.526,height:1.98,wheelbase:2.975,maxSpeed:7,chauffeur:true,steeringLimit:.48,steeredWheels:2,
  wheels:[[-1.575,.36,-.658],[-1.575,.36,.658],[1.4,.36,-.658],[1.4,.36,.658]],driverSeat:[-.021,.67,.301],passengerSeat:[.903,.67,-.301],driverFloor:.28,passengerFloor:.28,bodyHeight:1.055,grips:[[-.336,1.03,.196],[-.336,1.03,.406]]},
 motorcycle:{kind:'motorcycle',label:'Rose motorcycle',length:2.40,width:.90,height:1.55,wheelbase:1.80,maxSpeed:6,shared:true,steeringLimit:.55,steeredWheels:1,
  wheels:[[-1.02,.33,0],[.78,.33,0]],driverSeat:[-.10,.80,0],passengerSeat:[.43,.91,0],driverFloor:.32,passengerFloor:.38,bodyHeight:.95,grips:[[-.65,1.15,-.34],[-.65,1.15,.34]]},
 // The plaza bicycle: one rider on the saddle (the passenger seat IS the saddle,
 // so every seat consumer works unchanged). maxSpeed is the server's hard cap,
 // 18 mph; cruiseSpeed is the pedalling speed without the sprint key.
 bicycle:{kind:'bicycle',label:'Plaza bicycle',length:1.8,width:.6,height:1.1,wheelbase:1.05,maxSpeed:8.05,cruiseSpeed:5,seats:1,steeringLimit:.6,steeredWheels:1,
  wheels:[[-.525,.34,0],[.525,.34,0]],driverSeat:[.12,.92,0],passengerSeat:[.12,.92,0],driverFloor:.30,passengerFloor:.30,bodyHeight:.95,
  // Palm points: 3 cm above the bar's axis, where a closed hand's palm sits on it.
  grips:[[-.42,1.05,-.22],[-.42,1.05,.22]],steeringPivot:[-.46,.98,0]},
};
/** @param {unknown} value @returns {VehicleKind|null} */
export function vehicleKind(value) { return value==='rolls'||value==='motorcycle'||value==='bicycle'?value:null; }
/** Jev drives this kind from its driver seat; the rider is his passenger. @param {unknown} kind */
export const vehicleChauffeured=kind=>Boolean(VEHICLES[vehicleKind(kind)??'']?.chauffeur);
/** Any account may ride this kind; the others belong to the Jevica owner. @param {unknown} kind */
export const vehicleShared=kind=>Boolean(VEHICLES[vehicleKind(kind)??'']?.shared);
/** @param {unknown} value */
const control=value=>typeof value==='number'&&Number.isFinite(value)?Math.max(-1,Math.min(1,value)):0;
/** `sprint` (or the walking console's `fast`) lifts a bicycle from cruise to its cap. @param {unknown} value @returns {{forward:number,turn:number,strafe:number,brake?:boolean,sprint?:boolean}} */
export function drivingInput(value) {
 const input=value&&typeof value==='object'?/** @type {Record<string,unknown>} */(value):{};
 return {forward:control(input.forward),turn:control(input.turn),strafe:control(input.strafe),...(input.brake===true?{brake:true}:{}),...(input.sprint===true||input.fast===true?{sprint:true}:{})};
}
/** Only high-level intents cross the AI boundary. Models cannot supply poses or speed. @param {unknown} value @returns {'tour'|'stop'|'pause'|'resume'|null} */
export function chauffeurCommand(value) {
 if(!value||typeof value!=='object')return null;
 const mode=/** @type {Record<string,unknown>} */(value).mode;
 return ['tour','stop','pause','resume'].includes(mode)?mode:null;
}
