import { CARS, carEntry } from './cars.js';

// The garage's paint counter. Twelve mixed colours keep a repainted car inside
// the game's slightly dusty, faceted palette; the factory swatch puts a car
// back in the finish it arrived in, and the custom well covers everything else.
export const PAINTS = [
  { name: 'Sunset Coral', color: '#d96143' },
  { name: 'Signal Red', color: '#b8232f' },
  { name: 'Clementine', color: '#e08a33' },
  { name: 'Desert Mustard', color: '#e0b44a' },
  { name: 'Sage Green', color: '#78977b' },
  { name: 'Forest Green', color: '#3f6b4a' },
  { name: 'Sea Glass', color: '#6fa9c2' },
  { name: 'Midnight Blue', color: '#2f4a6d' },
  { name: 'Alpine Ice', color: '#9fc4d5' },
  { name: 'Deep Plum', color: '#6b4a6b' },
  { name: 'Bone White', color: '#e7e3d5' },
  { name: 'Graphite', color: '#4a5257' },
];

export const FACTORY = 'factory';
const STORAGE_KEY = 'coastline-paint';
const HEX = /^#[0-9a-f]{6}$/i;

export const isPaint = value => typeof value === 'string' && HEX.test(value);
// A swatch either names a colour or asks for the car's own finish back.
export const readPaint = value => (isPaint(value) ? value.toLowerCase() : null);
export const paintName = color => PAINTS.find(paint => paint.color === color)?.name ?? null;
// What the card art and the model should show: a chosen colour, or the factory one.
export const shownPaint = (id, paints) => paints[id] ?? carEntry(id).paint;

const store = () => { try { return globalThis.localStorage ?? null; } catch { return null; } };

// Paint is kept per car, so a colour follows the car it was mixed for. Anything
// unrecognised is dropped rather than trusted: storage outlives a release.
export function loadPaints(storage = store()) {
  try {
    const saved = JSON.parse(storage?.getItem(STORAGE_KEY) ?? 'null');
    if (!saved || typeof saved !== 'object') return {};
    return Object.fromEntries(Object.entries(saved)
      .filter(([id, color]) => CARS[id] && isPaint(color))
      .map(([id, color]) => [id, color.toLowerCase()]));
  } catch { return {}; }
}

export function savePaints(paints, storage = store()) {
  try { storage?.setItem(STORAGE_KEY, JSON.stringify(paints)); } catch { /* Still drive it for this visit. */ }
}
