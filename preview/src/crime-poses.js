// Crime (#597) reuses existing gesture poses rather than adding new ones (resident-gestures.js is
// a garment-bake input): the attacker's shove is the throw's arm-forward release, a hit rival is
// startled, and a rival who is down is bowed over, winded. Non-graphic; reduced motion keeps rest.
// Residents reacting to trouble (#640 increment 3) stand startled or bend over, cowering.
export const CRIME_POSES = Object.freeze({ shove: 'throw-release', stagger: 'startled', down: 'bow', startle: 'startled', cower: 'bow' });
export const poseFor = gesture => CRIME_POSES[gesture] ?? gesture;
