import { carEntry } from './cars.js';

// A side profile drawn from the same numbers the model is built from, so each
// card shows the car the player will actually be driving.
const SCALE = 47, GROUND = 130, CENTER = 140;
const PAINT = 'var(--car-paint)', GLASS = '#3d5b63', TIRE = '#2b3434', HUB = '#bfc4b9', TRIM = '#b9bfb4';
const CARBON = '#2e3538', VISOR = '#161b1d', SUIT = '#e7e3d5';

// Drawing helpers in the car's own metres: z runs from the nose at the right to
// the tail at the left, y up from the road. A lowered shell drops with `drop`.
// A car with road-car proportions fills the card at the shared scale; a long,
// low one is drawn a little larger and sat higher so it is framed rather than
// stranded along the bottom edge.
function pen({ drop = 0, scale = SCALE, ground = GROUND } = {}) {
  const px = z => (CENTER - z * scale).toFixed(1);
  const py = y => (ground - (y - drop) * scale).toFixed(1);
  const size = value => (value * scale).toFixed(1);
  return {
    px, py, size,
    slab: (front, rear, bottom, top, fill, rx = 1.5) =>
      `<rect x="${px(rear)}" y="${py(top)}" width="${size(rear - front)}" height="${size(top - bottom)}" rx="${rx}" fill="${fill}"/>`,
    shape2d: (points, fill) => `<polygon points="${points.map(([z, y]) => `${px(z)},${py(y)}`).join(' ')}" fill="${fill}"/>`,
    disc: (z, y, radius, fill) => `<circle cx="${px(z)}" cy="${py(y)}" r="${size(radius)}" fill="${fill}"/>`,
    shadow: half => `<ellipse cx="${CENTER}" cy="${ground + 4}" rx="${size(half)}" ry="4.5" fill="#00000022"/>`,
  };
}

export function carArt(id) {
  const entry = carEntry(id);
  const parts = entry.kind === 'formula' ? formulaParts(entry) : roadCarParts(entry);
  return `<svg class="chooser-art car-art" viewBox="0 0 280 142" aria-hidden="true">${parts.join('')}</svg>`;
}

function roadCarParts(entry) {
  const shape = entry.shape;
  const { length: l, cabin: [, cabinHeight, cabinLength], cabinZ: cz, drop = 0 } = shape;
  const cabinY = shape.cabinY ?? 1.22, roofY = cabinY + cabinHeight;
  const radius = shape.wheelRadius ?? .43, wheelZ = shape.wheelZ ?? l * .3;
  const draw = pen({ drop }), { slab, shape2d, disc, shadow } = draw;
  const wheel = z => disc(z, radius + drop, radius, TIRE) + disc(z, radius + drop, radius * .46, HUB);
  const glassInset = .09;
  const parts = [
    shadow(l * .55),
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
  parts.push(...accessories(entry, { ...draw, l, cz, cabinLength, roofY, radius }));
  return parts;
}

// The open-wheeler shares no bodywork with the road cars, so it draws its own
// silhouette back to front: wings, floor, engine cover, then the tub and the
// driver, with the exposed slicks laid over the lot.
function formulaParts(entry) {
  const { slab, shape2d, disc, shadow } = pen({ scale: 50, ground: 112 });
  const radius = entry.shape.wheelRadius, wheelZ = entry.shape.wheelZ;
  const wheel = z => disc(z, radius, radius, TIRE) + disc(z, radius, radius * .44, HUB);
  return [
    shadow(2.55),
    // Rear wing: from the side it is one tall endplate on a central pylon, with
    // the upper flap showing as a lighter band across it.
    slab(2.06, 2.24, .52, .96, CARBON, 1),
    slab(1.98, 2.52, .9, 1.34, CARBON, 3),
    slab(2.02, 2.48, 1.14, 1.2, '#4a5457', 1),
    // Front wing and its endplate, at the other end of the flat carbon floor.
    slab(-2.56, -2, .14, .26, CARBON, 1),
    slab(-2.64, -2.46, .08, .4, CARBON, 2),
    slab(-1.55, 2.2, .08, .22, CARBON, 1),
    slab(2.02, 2.42, .08, .4, CARBON, 2),
    // Engine cover falling away behind the airbox.
    shape2d([[.95, .62], [.95, .98], [2.1, .56], [2.1, .28], [.95, .28]], PAINT),
    shape2d([[.42, .66], [.55, 1.12], [1, 1.12], [1.15, .62]], PAINT),
    shape2d([[.45, .75], [.55, 1.06], [.67, 1.06], [.58, .75]], VISOR),
    // Nose cone tapering back into the tub, with the sidepod alongside and a
    // dark sill so the two do not read as one slab of paint.
    shape2d([[-2.6, .3], [-2.6, .48], [-1.45, .62], [-.9, .66], [-.9, .26], [-1.62, .24]], PAINT),
    shape2d([[-.9, .22], [-.9, .66], [-.62, .72], [-.55, .8], [.42, .82], [.56, .74], [1.1, .68], [1.1, .2]], PAINT),
    slab(-1.05, 1.25, .22, .58, PAINT, 4),
    slab(-1.1, 2.1, .18, .3, CARBON, 1),
    shape2d([[-1.04, .32], [-1, .55], [-.8, .55], [-.86, .32]], VISOR),
    // Cockpit opening inside the raised surround, the driver down in it, and
    // the halo hoop over the top.
    shape2d([[-.5, .66], [-.44, .78], [.34, .79], [.4, .67]], VISOR),
    disc(-.02, .92, .18, SUIT),
    slab(-.27, -.06, .84, .96, VISOR, 1),
    shape2d([[-.72, .66], [-.62, 1.02], [.5, 1.02], [.5, .95], [-.53, .95], [-.62, .66]], CARBON),
    // Running lamp in the nose, rain light on the rear wing.
    slab(-2.64, -2.5, .34, .46, '#ffeec2', 2),
    slab(2.18, 2.32, 1, 1.14, '#c4483a', 2),
    wheel(-wheelZ), wheel(wheelZ),
  ];
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
