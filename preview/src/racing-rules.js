// Local practice timing only. No multiplayer rewards or authoritative scores.
export function createRace(gates) {
 if(!Array.isArray(gates)||gates.length<2)throw new Error('A race needs at least two gates');
 return {gates,next:1,passed:0,elapsed:0,finished:false};
}
export function advanceRace(race,from,to,dt) {
 if(race.finished||!Number.isFinite(dt)||dt<=0||![...from,...to].every(Number.isFinite))return race;
 race.elapsed+=dt;
 const gate=race.gates[race.next],a=(from[0]-gate.x)*gate.dx+(from[1]-gate.z)*gate.dz,b=(to[0]-gate.x)*gate.dx+(to[1]-gate.z)*gate.dz;
 if(a>=0||b<0)return race;
 const t=-a/(b-a),x=from[0]+(to[0]-from[0])*t,z=from[1]+(to[1]-from[1])*t;
 if(Math.abs((x-gate.x)*-gate.dz+(z-gate.z)*gate.dx)>(gate.halfWidth??4))return race;
 if(Number.isFinite(gate.altitude)){
  if(!Number.isFinite(from[2])||!Number.isFinite(to[2]))return race;
  const altitude=from[2]+(to[2]-from[2])*t;
  if(Math.abs(altitude-gate.altitude)>(gate.halfHeight??2.5))return race;
 }
 race.passed++;
 if(race.next===0)race.finished=true;
 else race.next=(race.next+1)%race.gates.length;
 return race;
}
