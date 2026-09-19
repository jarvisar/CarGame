import { randomAt } from './route.js';
import { plainsGroundHeight, plainsCreekAt } from './plains-route.js';

// Close enough that a drive turns up a farmstead, an elevator or a row of
// turbines every few kilometres rather than once in a long while.
export const PLAINS_DISCOVERY_SPACING = 3072;
export const TURBINE_SPACING = 88;
const sites = new Map();

// A compound faces the road across a straight drive; the drive is at one end
// of the yard so the buildings are not hidden behind it from the fixed view.
function districtSite(index) {
  if (sites.has(index)) return sites.get(index);
  let site = null;
  if (randomAt(index, 2901) > .22) {
    // Shuffle a three-district set so a long drive offers different discoveries.
    const orders = [[0, 1, 2], [0, 2, 1], [1, 0, 2], [1, 2, 0], [2, 0, 1], [2, 1, 0]];
    const order = orders[Math.floor(randomAt(Math.floor(index / 3), 2902) * orders.length)];
    const kind = ['farmstead', 'grain-elevator', 'wind-turbines'][order[((index % 3) + 3) % 3]];
    const desired = (index + .5) * PLAINS_DISCOVERY_SPACING + (randomAt(index, 2903) - .5) * PLAINS_DISCOVERY_SPACING / 4;
    // The creek wanders a good hundred metres from its crossing out in the
    // fields, and a row of turbines is nearly two hundred metres long.
    const creekRoom = kind === 'wind-turbines' ? 270 : 170;
    // The elevator and the turbines stand on the far side, where their height
    // cannot come between the camera and the road. A farm takes either side,
    // and takes them in turn rather than on a coin: a coin left one side of
    // the road with every farm on a drive for a good while at a time. Each
    // set of three districts carries one farm, so the set decides its side.
    const side = kind === 'farmstead' ? (Math.floor(index / 3) % 2 ? 1 : -1) : 1;
    const cross = kind === 'farmstead' ? 44 + randomAt(index, 2905) * 22 : kind === 'grain-elevator' ? 36 + randomAt(index, 2905) * 12 : 60 + randomAt(index, 2905) * 18;
    const halfS = kind === 'farmstead' ? 30 : kind === 'grain-elevator' ? 19 : TURBINE_SPACING + 20;
    const halfU = kind === 'farmstead' ? 21 : kind === 'grain-elevator' ? 13 : 26;
    for (const offset of [0, 80, -80, 160, -160, 240, -240, 320, -320]) {
      const s = desired + offset, u = side * cross;
      if (Math.abs(s - plainsCreekAt(s).center) < creekRoom) continue;
      const towers = kind === 'wind-turbines'
        ? [-1, 0, 1].map(k => ({ s: s + k * TURBINE_SPACING, u: u + (randomAt(index, 2906 + k) - .5) * 24 })) : null;
      const spots = towers ?? [{ s, u }];
      // The ground a site needs level is the ground its buildings stand on,
      // which is not the whole of what it keeps clear: a farm's yard reaches
      // well past its own buildings, and a swell out at the edge of it is
      // nothing to a farm.
      const build = towers ? { s: 6, u: 6 } : { s: Math.min(halfS, 23), u: Math.min(halfU, 18) };
      const level = spots.every(spot => {
        const heights = [-1, 0, 1].flatMap(ds => [-1, 0, 1].map(du =>
          plainsGroundHeight(spot.s + ds * build.s, spot.u + du * build.u)));
        return Math.max(...heights) - Math.min(...heights) < (towers ? 3 : 2.6);
      });
      if (!level) continue;
      site = { kind, index, s, u, side, halfS, halfU, build };
      if (towers) site.towers = towers;
      // The drive comes in toward one end of the yard, but not so near the
      // end that the gap it needs in the fence takes the corner post with it.
      else site.drive = (randomAt(index, 2907) > .5 ? 1 : -1) * (halfS - 12);
      break;
    }
  }
  sites.set(index, site);
  if (sites.size > 128) sites.delete(sites.keys().next().value);
  return site;
}

export function plainsDiscoveries(first, last) {
  const result = [];
  for (let index = Math.floor(first / PLAINS_DISCOVERY_SPACING) - 1; index <= Math.floor(last / PLAINS_DISCOVERY_SPACING) + 1; index++) {
    const site = districtSite(index);
    if (site && site.s >= first && site.s < last) result.push(site);
  }
  return result;
}

// Keeps fences, hedges, bales and trees off a compound, its drive, and the
// footing of every turbine; the fields between the turbines stay farmed.
export function plainsDiscoveryClears(s, u, discoveries, radius = 0) {
  return discoveries.every(site => {
    if (site.towers) return site.towers.every(tower => Math.hypot(s - tower.s, u - tower.u) > 9 + radius);
    if (Math.abs(s - site.s) < site.halfS + radius + 2 && Math.abs(u - site.u) < site.halfU + radius + 2) return false;
    const onDrive = Math.abs(s - site.s - site.drive) < 3 + radius && u * site.side > 6 - radius && u * site.side < Math.abs(site.u);
    return !onDrive;
  });
}
