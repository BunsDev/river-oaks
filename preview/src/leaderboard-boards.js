// @ts-check
import { VEHICLES } from './vehicle-config.js';

// The town's leaderboards (#318 cycling; walking, hours played and one board per
// drivable vehicle kind added 2026-11-01). The server measures every total from
// accepted poses and connected time (server/world.js); this list is the one
// both sides read, so a board id the server banks is always one the client can
// show. Distances are stored in metres and shown in miles; time is stored in
// seconds and shown in hours. A vehicle kind added to vehicle-config.js gets a
// board of its own without another edit here.
/** @typedef {{id:string,label:string,unit:'miles'|'hours',eyebrow:string,empty:string}} Board */
const vehicleBoards = Object.values(VEHICLES).filter(spec => spec.kind !== 'bicycle').map(spec => ({
  id: spec.kind, label: spec.label, unit: /** @type {const} */ ('miles'), eyebrow: `${spec.label} · lifetime miles`,
  empty: `No ${spec.label} miles yet.`,
}));
/** @type {Board[]} */
export const BOARDS = [
  { id: 'cycling', label: 'Cycling', unit: 'miles', eyebrow: 'Bike racks · lifetime miles', empty: 'No miles yet. Take a bike from any bike rack.' },
  { id: 'walking', label: 'Walking', unit: 'miles', eyebrow: 'On foot · lifetime miles', empty: 'No miles walked yet.' },
  { id: 'played', label: 'Hours played', unit: 'hours', eyebrow: 'Time in town · lifetime hours', empty: 'No hours yet.' },
  ...vehicleBoards,
];
export const BOARD_IDS = BOARDS.map(board => board.id);
/** @param {unknown} value @returns {string|null} */
export const boardId = value => typeof value === 'string' && BOARD_IDS.includes(value) ? value : null;
export const METERS_PER_MILE = 1609.344;
/** A stored total (metres or seconds) as the board's unit, to one decimal. @param {string} id @param {number} total */
export function boardValue(id, total) {
  const unit = BOARDS.find(board => board.id === id)?.unit;
  return Math.round(total / (unit === 'hours' ? 3600 : METERS_PER_MILE) * 10) / 10;
}
/** @param {string} id @param {number} value */
export function formatBoardValue(id, value) {
  const unit = BOARDS.find(board => board.id === id)?.unit;
  return `${(Math.round(value * 10) / 10).toFixed(1)} ${unit === 'hours' ? 'h' : 'mi'}`;
}
