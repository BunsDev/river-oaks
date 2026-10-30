// @ts-check
/** @typedef {'rolls'|'motorcycle'|'bicycle'|'hover'} VehicleKind */
/** @typedef {[number,number,number]} Point3 */
/** @typedef {{kind:VehicleKind,label:string,length:number,width:number,height:number,wheelbase:number,maxSpeed:number,cruiseSpeed?:number,seats?:number,chauffeur?:boolean,hover?:boolean,flies?:boolean,steeringLimit:number,steeredWheels:number,wheels:Point3[],driverSeat:Point3,passengerSeat:Point3,driverFloor:number,bodyHeight:number,passengerFloor:number,grips:Point3[],steeringPivot?:Point3}} VehicleSpec */
/** @type {Record<VehicleKind,VehicleSpec>} */
export const VEHICLES = {
 rolls:{kind:'rolls',label:'Pink Rolls-Royce',length:4.62,width:1.526,height:1.98,wheelbase:2.975,maxSpeed:7,chauffeur:true,steeringLimit:.48,steeredWheels:2,
  wheels:[[-1.575,.36,-.658],[-1.575,.36,.658],[1.4,.36,-.658],[1.4,.36,.658]],driverSeat:[-.021,.67,.301],passengerSeat:[.903,.67,-.301],driverFloor:.28,passengerFloor:.28,bodyHeight:1.055,grips:[[-.336,1.03,.196],[-.336,1.03,.406]]},
 motorcycle:{kind:'motorcycle',label:'Rose motorcycle',length:2.40,width:.90,height:1.55,wheelbase:1.80,maxSpeed:6,chauffeur:true,steeringLimit:.55,steeredWheels:1,
  wheels:[[-1.02,.33,0],[.78,.33,0]],driverSeat:[-.10,.80,0],passengerSeat:[.43,.91,0],driverFloor:.32,passengerFloor:.38,bodyHeight:.95,grips:[[-.65,1.15,-.34],[-.65,1.15,.34]]},
 // The plaza bicycle: one rider on the saddle (the passenger seat IS the saddle,
 // so every seat consumer works unchanged). maxSpeed is the server's hard cap,
 // 18 mph; cruiseSpeed is the pedalling speed without the sprint key.
 bicycle:{kind:'bicycle',label:'Plaza bicycle',length:1.8,width:.6,height:1.1,wheelbase:1.05,maxSpeed:8.05,cruiseSpeed:5,seats:1,steeringLimit:.6,steeredWheels:1,
  wheels:[[-.525,.34,0],[.525,.34,0]],driverSeat:[.12,.92,0],passengerSeat:[.12,.92,0],driverFloor:.30,passengerFloor:.30,bodyHeight:.95,
  // Palm points: 3 cm above the bar's axis, where a closed hand's palm sits on it.
  grips:[[-.42,1.05,-.22],[-.42,1.05,.22]],steeringPivot:[-.46,.98,0]},
 // The landowner's flying vehicle: the Ribbonwing (#777), a two-seat
 // side-by-side petal-wing VTOL craft (geometry, mechanisms and the metric
 // contract in ribbonwing.js, ribbonwing-rig.js and ribbonwing-design.js; the
 // kind id stays `hover`, so server authority, checkpoints and the smart-ride
 // gates are unchanged). The landowner pilots it from the left seat; the
 // right seat is the passenger's. It stands on three landing feet whose pads
 // are its ground contacts (nothing steers or rolls) and flies above the
 // ground it follows, up to the world's flight ceiling (carriage-motion.js,
 // server/world.js); it lands before anyone steps out. `width` is the spread
 // span, so parking and flight clearance keep the wings clear.
 hover:{kind:'hover',label:'Ribbonwing',length:5.79,width:5.84,height:3.05,wheelbase:2.96,maxSpeed:9,seats:2,hover:true,flies:true,steeringLimit:.42,steeredWheels:0,
  wheels:[[-2.1,.06,0],[.86,.06,1.12],[.86,.06,-1.12]],driverSeat:[-1.36,.92,.34],passengerSeat:[-1.36,.92,-.34],driverFloor:.56,passengerFloor:.56,bodyHeight:2.03,
  // Right palm on the side stick, left palm on the throttle (ribbonwing-design.js CONTROLS).
  grips:[[-1.62,1.16,.07],[-1.56,1.12,.62]],steeringPivot:[-1.62,.9,.06],
  // Half-width envelope along the length ([x, half-width], front -X): nose, the deployed
  // ladder band, the wing's leading-edge vertices, the tip, the trailing hook and the petals
  // (ribbonwing-design.js). Walkers and the camera pass ahead of the wings.
  plan:[[-2.95,.1],[-2.6,.55],[-2.25,.62],[-1.72,1.84],[-1.18,1.84],[-1.06,1.3],[-.95,1.6],[-.7,1.98],[-.32,2.34],[.12,2.62],[.6,2.84],[1.1,2.92],[1.5,2.92],[1.9,2.74],[2,.9],[2.86,.72]]},
};
/** @param {unknown} value @returns {VehicleKind|null} */
export function vehicleKind(value) { return value==='rolls'||value==='motorcycle'||value==='bicycle'||value==='hover'?value:null; }
/** Jev drives this kind from its driver seat and the rider is his passenger;
 * the Ribbonwing is piloted by the rider from its driver seat instead (the
 * same field as open #767). @param {unknown} kind */
export const vehicleChauffeured=kind=>Boolean(VEHICLES[vehicleKind(kind)??'']?.chauffeur);
/** The seat a player rides in: the passenger seat beside Jev, else the driver seat. @param {VehicleSpec} spec */
export const riderSeat=spec=>vehicleChauffeured(spec.kind)?spec.passengerSeat:spec.driverSeat;
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
