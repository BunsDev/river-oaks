import { wishLift } from './wishes.js';

// Local east/north/up coordinates; positions remain rooted in navigation while
// wishes move the rendered body. All encounter paths must use the same offset.
export const personElevation = local => local.position[2] + wishLift(local.wish);
export const personPosition = local => [local.position[0],local.position[1],personElevation(local)];
export const personEyeHeight = local => local.wish?.kind === 'dog' ? .76 : local.eyeHeight ?? 1.5;
export const personDistance = (local,eye) => Math.hypot(local.position[0]-eye[0],local.position[1]-eye[1],personElevation(local)+personEyeHeight(local)-eye[2]);
