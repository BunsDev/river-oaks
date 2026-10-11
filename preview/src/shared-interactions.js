export const INTERACTIONS=Object.freeze({
  handshake:{label:'Shake hands',active:'Shaking hands',duration:4200},
  dance:{label:'Dance together',active:'Dancing together',duration:14000},
});
export const INTERACTION_REACH=2.6, INVITATION_MS=15000;
export const interactionDistance=(a,b)=>Math.hypot(a.position[0]-b.position[0],a.position[1]-b.position[1]);
export const interactionOnFoot=player=>Boolean(player&&!player.sitting&&!player.vehicle&&player.altitude<=.1&&player.movement!=='beast');
