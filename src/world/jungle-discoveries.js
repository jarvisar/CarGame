import { randomAt, CHUNK_LENGTH } from './route.js';
import { riverCenter, riverHalfWidth, riverLevel, riverLips, sideFalls, poolAt, gorgeWall, jungleHeight } from './jungle-route.js';

export const JUNGLE_DISCOVERY_SPACING = 6144;
export const JUNGLE_PARROT_SPACING = CHUNK_LENGTH * 3;
const cache = new Map();

function districtSite(index) {
  if (cache.has(index)) return cache.get(index);
  let site = null;
  if (randomAt(index, 2801) > .22) {
    const orders = [[0,1,2], [0,2,1], [1,0,2], [1,2,0], [2,0,1], [2,1,0]];
    const order = orders[Math.floor(randomAt(Math.floor(index / 3), 2802) * orders.length)];
    // Leave quiet districts between the rare landmarks.
    const kind = ['rainbow', null, 'rope-bridge'][order[((index % 3) + 3) % 3]];
    const desired = index * JUNGLE_DISCOVERY_SPACING + 3072 + (randomAt(index, 2803) - .5) * 1200;
    if (kind === 'rainbow') {
      const sides = sideFalls(desired - 320, desired + 320).map(fall => {
        const u = riverCenter(fall.s) + riverHalfWidth(fall.s) + 3;
        const lower = riverLevel(fall.s), upper = jungleHeight(fall.s, u + 4);
        return {...fall, u, lower, upper, drop: upper-lower, source: 'side-fall'};
      }).filter(fall => fall.drop > 7);
      const cascades = riverLips(desired - 320, desired + 320).filter(lip => lip.drop > 4.8)
        .map(lip => ({...lip, u: riverCenter(lip.s), source: 'cascade'}));
      const fall = (sides.length ? sides : cascades).sort((a,b) => Math.abs(a.s-desired)-Math.abs(b.s-desired))[0];
      if (fall) site = {...fall, kind, index};
    } else if (kind === 'rope-bridge') {
      for (const offset of [0, 88, -88, 176, -176, 264, -264]) {
        const pool = poolAt(desired + offset), s = Math.round((pool.start + pool.end) / 4) * 2;
        const inChunk = ((s % CHUNK_LENGTH) + CHUNK_LENGTH) % CHUNK_LENGTH;
        if (inChunk < 10 || inChunk > CHUNK_LENGTH-10 || s-pool.start < 25 || pool.end-s < 25) continue;
        if ([-5,0,5].some(ds => gorgeWall(s+ds) > .12) || sideFalls(s-35,s+35).length) continue;
        const u = riverCenter(s), half = riverHalfWidth(s) + 8;
        const ends = [u-half, u+half], heights = ends.map(v => jungleHeight(s,v));
        if (Math.abs(heights[0]-heights[1]) > 2.8 || Math.min(...heights) < pool.level+1.4) continue;
        // Both landings need a small usable bank, not a cliff or steep scree.
        if (ends.some(v => Math.max(...[-2,0,2].map(ds => jungleHeight(s+ds,v)))
          - Math.min(...[-2,0,2].map(ds => jungleHeight(s+ds,v))) > 1.2)) continue;
        site = {kind, index, s, u, farU: ends[0], nearU: ends[1], level: pool.level};
        break;
      }
    }
  }
  cache.set(index, site);
  if (cache.size > 128) cache.delete(cache.keys().next().value);
  return site;
}

export function jungleDiscoveries(first, last) {
  const sites = [];
  for (let index=Math.floor(first/JUNGLE_DISCOVERY_SPACING)-1;index<=Math.floor(last/JUNGLE_DISCOVERY_SPACING)+1;index++) {
    const site=districtSite(index);
    if (site && site.s>=first && site.s<last) sites.push(site);
  }
  // Match Pacific gulls: one flock in every third chunk, in both directions.
  for(let cell=Math.floor(first/JUNGLE_PARROT_SPACING)-1;cell<=Math.floor(last/JUNGLE_PARROT_SPACING);cell++) {
    const index=cell*3,s=cell*JUNGLE_PARROT_SPACING+CHUNK_LENGTH/2;
    if(s>=first && s<last) sites.push({kind:'parrots',index,s,u:riverCenter(s),count:2+Math.floor(randomAt(index,2804)*3)});
  }
  return sites.sort((a,b)=>a.s-b.s);
}

export function jungleDiscoveryClears(s, u, sites, radius = 0) {
  return sites.every(site => site.kind !== 'rope-bridge' || Math.abs(s-site.s)>3+radius
    || u<site.farU-3-radius || u>site.nearU+3+radius);
}
