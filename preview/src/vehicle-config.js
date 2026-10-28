// @ts-check
/** @typedef {'rolls'|'motorcycle'|'bicycle'|'hover'} VehicleKind */
/** @typedef {[number,number,number]} Point3 */
/** @typedef {{kind:VehicleKind,label:string,length:number,width:number,height:number,wheelbase:number,maxSpeed:number,cruiseSpeed?:number,seats?:number,hover?:boolean,flies?:boolean,steeringLimit:number,steeredWheels:number,wheels:Point3[],driverSeat:Point3,passengerSeat:Point3,driverFloor:number,bodyHeight:number,passengerFloor:number,grips:Point3[],steeringPivot?:Point3}} VehicleSpec */
/** @type {Record<VehicleKind,VehicleSpec>} */
export const VEHICLES = {
 rolls:{kind:'rolls',label:'Pink Rolls-Royce',length:4.62,width:1.526,height:1.98,wheelbase:2.975,maxSpeed:7,steeringLimit:.48,steeredWheels:2,
  wheels:[[-1.575,.36,-.658],[-1.575,.36,.658],[1.4,.36,-.658],[1.4,.36,.658]],driverSeat:[-.021,.67,.301],passengerSeat:[.903,.67,-.301],driverFloor:.28,passengerFloor:.28,bodyHeight:1.055,grips:[[-.336,1.03,.196],[-.336,1.03,.406]]},
 motorcycle:{kind:'motorcycle',label:'Rose motorcycle',length:2.40,width:.90,height:1.55,wheelbase:1.80,maxSpeed:6,steeringLimit:.55,steeredWheels:1,
  wheels:[[-1.02,.33,0],[.78,.33,0]],driverSeat:[-.10,.80,0],passengerSeat:[.43,.91,0],driverFloor:.32,passengerFloor:.38,bodyHeight:.95,grips:[[-.65,1.15,-.34],[-.65,1.15,.34]]},
 // The plaza bicycle: one rider on the saddle (the passenger seat IS the saddle,
 // so every seat consumer works unchanged). maxSpeed is the server's hard cap,
 // 18 mph; cruiseSpeed is the pedalling speed without the sprint key.
 bicycle:{kind:'bicycle',label:'Plaza bicycle',length:1.8,width:.6,height:1.1,wheelbase:1.05,maxSpeed:8.05,cruiseSpeed:5,seats:1,steeringLimit:.6,steeredWheels:1,
  wheels:[[-.525,.34,0],[.525,.34,0]],driverSeat:[.12,.92,0],passengerSeat:[.12,.92,0],driverFloor:.30,passengerFloor:.30,bodyHeight:.95,grips:[[-.42,1.02,-.22],[-.42,1.02,.22]]},
 // The landowner hover coach: a seafoam, chrome-trimmed hover helicopter for
 // the owner accounts that hold the town's private homes. Parked and on the
 // road it travels like the car: four unseen ground-contact tyres under its
 // lift pods keep the shared suspension, parking and tyre-clearance maths,
 // while the visible pods float on their light. No pod steers; the turn still
 // follows wheelbase and steeringLimit. It also flies: lift raises it above the
 // ground it follows, up to the world's flight ceiling (carriage-motion.js,
 // server/world.js), and it lands before anyone steps out. The pilot holds a
 // yoke that turns like a wheel. The hull is 30% smaller in plan than the
 // reference's, with full-size seats (Val, 2026-10-28).
 hover:{kind:'hover',label:'Landowner hover coach',length:4.13,width:1.47,height:2.55,wheelbase:1.72,maxSpeed:9,hover:true,flies:true,steeringLimit:.42,steeredWheels:0,
  wheels:[[-1.12,.3,-.43],[-1.12,.3,.43],[.6,.3,-.43],[.6,.3,.43]],driverSeat:[-1.19,1.18,.27],passengerSeat:[-.35,1.18,-.29],driverFloor:.81,passengerFloor:.81,bodyHeight:2.3,
  grips:[[-1.48,1.51,.11],[-1.48,1.51,.43]],steeringPivot:[-1.48,1.51,.27]},
};
/** @param {unknown} value @returns {VehicleKind|null} */
export function vehicleKind(value) { return value==='rolls'||value==='motorcycle'||value==='bicycle'||value==='hover'?value:null; }
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
