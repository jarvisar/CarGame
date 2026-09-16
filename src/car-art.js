import { carEntry } from './cars.js';

// A side profile drawn from the same numbers the model is built from, so each
// card shows the car the player will actually be driving.
const SCALE = 47, GROUND = 130, CENTER = 140;
const PAINT = 'var(--car-paint)', GLASS = '#3d5b63', TIRE = '#2b3434', HUB = '#bfc4b9', TRIM = '#b9bfb4';

export function carArt(id) {
  const entry = carEntry(id), shape = entry.shape;
  const { length: l, cabin: [, cabinHeight, cabinLength], cabinZ: cz, drop = 0 } = shape;
  const cabinY = shape.cabinY ?? 1.22, roofY = cabinY + cabinHeight;
  const radius = shape.wheelRadius ?? .43, wheelZ = shape.wheelZ ?? l * .3;
  const px = z => (CENTER - z * SCALE).toFixed(1);
  const py = y => (GROUND - (y - drop) * SCALE).toFixed(1);
  const size = value => (value * SCALE).toFixed(1);
  const slab = (front, rear, bottom, top, fill, rx = 1.5) =>
    `<rect x="${px(rear)}" y="${py(top)}" width="${size(rear - front)}" height="${size(top - bottom)}" rx="${rx}" fill="${fill}"/>`;
  const shape2d = (points, fill) => `<polygon points="${points.map(([z, y]) => `${px(z)},${py(y)}`).join(' ')}" fill="${fill}"/>`;
  const wheel = z => `<circle cx="${px(z)}" cy="${(GROUND - radius * SCALE).toFixed(1)}" r="${size(radius)}" fill="${TIRE}"/>`
    + `<circle cx="${px(z)}" cy="${(GROUND - radius * SCALE).toFixed(1)}" r="${size(radius * .46)}" fill="${HUB}"/>`;
  const glassInset = .09;
  const parts = [
    `<ellipse cx="${CENTER}" cy="${GROUND + 4}" rx="${size(l * .55)}" ry="4.5" fill="#00000022"/>`,
    slab(-l / 2, l / 2, .565, cabinY, PAINT, 5),
    // Cabin, then a smaller glass house inside it, keeps the faceted look.
    shape2d([[cz - cabinLength / 2, cabinY], [cz - cabinLength / 2 + .24, roofY], [cz + cabinLength / 2 - .12, roofY], [cz + cabinLength / 2, cabinY]], PAINT),
    shape2d([
      [cz - cabinLength / 2 + glassInset, cabinY + glassInset], [cz - cabinLength / 2 + .24 + glassInset, roofY - glassInset],
      [cz + cabinLength / 2 - .12 - glassInset, roofY - glassInset], [cz + cabinLength / 2 - glassInset, cabinY + glassInset],
    ], GLASS),
    slab(-l / 2, l / 2, .6, .72, TRIM, 2),
    // Lamps at each end.
    slab(-l / 2 - .02, -l / 2 + .16, .9, 1.12, '#ffeec2', 2),
    slab(l / 2 - .16, l / 2 + .02, .9, 1.1, '#c4483a', 2),
    // The wheels stand outboard of the bodywork, so they sit over it.
    wheel(-wheelZ), wheel(wheelZ),
  ];
  parts.push(...accessories(entry, { slab, shape2d, px, py, size, l, cz, cabinLength, roofY, radius }));
  return `<svg class="chooser-art car-art" viewBox="0 0 280 142" aria-hidden="true">${parts.join('')}</svg>`;
}

function accessories(entry, draw) {
  const { slab, shape2d, px, py, size, l, cz, cabinLength, roofY, radius } = draw;
  const rack = (front, rear) => slab(front, rear, roofY, roofY + .09, '#3a4441', 1);
  switch (entry.trim ?? entry.shape.name) {
    case 'coast': return [
      rack(cz - .9, cz + .9),
      shape2d([[cz - 1.45, roofY + .09], [cz - 1.2, roofY + .3], [cz + 1.2, roofY + .3], [cz + 1.45, roofY + .09]], '#f5e8c8'),
    ];
    case 'desert': return [
      slab(l / 2 + .02, l / 2 + .32, 1.22 - radius, 1.22 + radius, '#303b36', 6),
      `<circle cx="${px(l / 2 + .17)}" cy="${py(1.22)}" r="${size(radius * .46)}" fill="#f5e8c8"/>`,
    ];
    case 'snow': return [rack(cz - .95, cz + .95), slab(cz - .85, cz + .95, roofY + .06, roofY + .44, '#48545c', 4)];
    case 'jungle': return [
      rack(cz - .95, cz + .95),
      slab(cz - .8, cz - .1, roofY + .06, roofY + .38, '#5f6b3f', 2),
      slab(cz + .15, cz + .9, roofY + .06, roofY + .42, '#c9b48b', 5),
    ];
    // The default car carries an empty rack: its kit changes with the scenery.
    case 'classic': return [rack(cz - .9, cz + .9)];
    case 'wagon': return [rack(cz - 1.1, cz + 1.1)];
    case 'pickup': return [
      slab(cz + cabinLength / 2, l / 2, 1.22, 1.62, 'var(--car-paint)', 2),
      slab(cz + cabinLength / 2 + .08, l / 2 - .08, 1.24, 1.32, '#414c4b', 1),
    ];
    case 'sports': return [
      slab(l / 2 - .5, l / 2 - .1, 1.24, 1.44, '#2f3a3c', 1),
      slab(l / 2 - .62, l / 2 + .02, 1.44, 1.53, '#2f3a3c', 2),
    ];
    default: return [];
  }
}
