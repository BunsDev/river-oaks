// @ts-check
/** @typedef {'rolls'|'motorcycle'} VehicleKind */
/** @typedef {[number,number,number]} Point3 */
/** @typedef {{kind:VehicleKind,label:string,length:number,width:number,height:number,wheelbase:number,maxSpeed:number,steeringLimit:number,steeredWheels:number,wheels:Point3[],driverSeat:Point3,passengerSeat:Point3,driverFloor:number,bodyHeight:number,passengerFloor:number,grips:Point3[]}} VehicleSpec */
/** @type {Record<VehicleKind,VehicleSpec>} */
export const VEHICLES = {
 rolls:{kind:'rolls',label:'Pink Rolls-Royce',length:4.62,width:1.526,height:1.98,wheelbase:2.975,maxSpeed:7,steeringLimit:.48,steeredWheels:2,
  wheels:[[-1.575,.36,-.658],[-1.575,.36,.658],[1.4,.36,-.658],[1.4,.36,.658]],driverSeat:[-.021,.67,.301],passengerSeat:[.903,.67,-.301],driverFloor:.28,passengerFloor:.28,bodyHeight:1.055,grips:[[-.336,1.03,.196],[-.336,1.03,.406]]},
 motorcycle:{kind:'motorcycle',label:'Rose motorcycle',length:2.40,width:.90,height:1.55,wheelbase:1.80,maxSpeed:6,steeringLimit:.55,steeredWheels:1,
  wheels:[[-1.02,.33,0],[.78,.33,0]],driverSeat:[-.10,.80,0],passengerSeat:[.43,.91,0],driverFloor:.32,passengerFloor:.38,bodyHeight:.95,grips:[[-.65,1.15,-.34],[-.65,1.15,.34]]},
};
/** @param {unknown} value @returns {VehicleKind|null} */
export function vehicleKind(value) { return value==='rolls'||value==='motorcycle'?value:null; }
/** @param {unknown} value */
const control=value=>typeof value==='number'&&Number.isFinite(value)?Math.max(-1,Math.min(1,value)):0;
/** @param {unknown} value @returns {{forward:number,turn:number,strafe:number}} */
export function drivingInput(value) {
 const input=value&&typeof value==='object'?/** @type {Record<string,unknown>} */(value):{};
 return {forward:control(input.forward),turn:control(input.turn),strafe:control(input.strafe)};
}
/** Only high-level intents cross the AI boundary. Models cannot supply poses or speed. @param {unknown} value @returns {'tour'|'stop'|null} */
export function chauffeurCommand(value) {
 if(!value||typeof value!=='object')return null;
 const mode=/** @type {Record<string,unknown>} */(value).mode;
 return mode==='tour'||mode==='stop'?mode:null;
}
