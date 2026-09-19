import * as THREE from 'three';
import { roadFrame, randomAt } from './route.js';
import { BANDS } from './city-route.js';
import { cityDiscoveryAssets as assets, cityDiscoveryMaterial as material } from './city-discovery-assets.js';

const transform = new THREE.Object3D();
const TREE_GREENS = ['#3f6a3a', '#476f3d', '#385f35', '#4a7342'];

export function buildCityDiscoveries(chunk, discoveries) {
  const batches = new Map();
  function add(name, geometry, p, rotation = [0, 0, 0], scale = [1, 1, 1]) {
    if (!batches.has(name)) batches.set(name, { geometry, items: [] });
    batches.get(name).items.push({ p, rotation, scale });
  }
  const { boxes } = chunk.scenery;
  for (const site of discoveries) {
    const { s, u, kind } = site, yaw = -roadFrame(s).angle;
    if (kind === 'river-bridge') {
      if (!chunk.inChunk(s)) continue;
      // The street network already builds this crossing, together with every
      // other road reaching the river. Retain the discovery without a second,
      // overlapping deck or a different height at the landing.
      chunk.features.discoveries.push({ ...site });
      continue;
    }
    if (kind === 'square') {
      // Lawn where two rows of buildings would stand, a fountain in the
      // middle, trees round the edges, benches and lamps on the paths.
      if (chunk.inChunk(s)) {
        const p = chunk.ground(s, u);
        add('city-fountains', assets.fountain, [p.x, p.y, p.z], [0, yaw, 0]);
        for (const [ds, du] of [[-7.5, 0], [7.5, 0], [0, -7.5], [0, 7.5]]) {
          const angle = Math.atan2(ds, du);
          chunk.furniture('bench', s + ds, u + du, yaw + angle + Math.PI, {});
        }
        for (const [ds, du] of [[-9, -9], [9, -9], [-9, 9], [9, 9]]) chunk.furniture('lamp', s + ds, u + du, yaw + Math.atan2(-ds, -du) + Math.PI / 2, {});
      }
      const treeRandom = seeded(site.index + 3401);
      for (let k = 0; k < 14; k++) {
        const t = s + (treeRandom() - .5) * (site.halfS * 2 - 10), v = u + (treeRandom() - .5) * (site.u1 - site.u0 - 8);
        if (!chunk.inChunk(t) || Math.hypot(t - s, v - u) < 15 || Math.abs(t - s) < 4 || Math.abs(v - u) < 4) continue;
        chunk.tree(t, v, 6 + treeRandom() * 4, TREE_GREENS[k % 4], treeRandom() * 6.28);
      }
      if (chunk.inChunk(s)) chunk.features.discoveries.push({ ...site });
      continue;
    }
    // The church stands on a stone plinth on the building line, its tower
    // on the corner by the side street.
    if (!chunk.inChunk(s)) continue;
    const front = BANDS[0].front + .2, root = chunk.ground(s, front + 3.4), samples = [[s - 4, front], [s + 4, front], [s - 4, front + 21], [s + 4, front + 21]].map(([a, b]) => chunk.ground(a, b).y);
    const base = Math.max(...samples, root.y) + .12;
    const plinth = chunk.at(s, front + 11.5, base - .3);
    boxes.push({ p: [plinth.x, plinth.y, plinth.z], scale: [26, .6, 15], r: [0, yaw, 0], color: '#8e8a83' });
    // Drawn a little over life size, as the plains do with their barns, so it reads from the road.
    add('city-clock-towers', assets.clockTower, [root.x, base, root.z], [0, yaw, 0], [1.3, 1.3, 1.3]);
    for (const [ds, du] of [[-5.2, 22.5], [5.2, 22.5]]) chunk.tree(s + ds, front + du, 6.5, TREE_GREENS[1], randomAt(site.index, Math.round(ds) + 3411) * 6.28);
    chunk.features.discoveries.push({ ...site, ground: base });
  }
  for (const [name, { geometry, items }] of batches) {
    const mesh = new THREE.InstancedMesh(geometry, material, items.length); mesh.name = name;
    items.forEach((item, i) => {
      transform.position.set(...item.p); transform.rotation.set(...item.rotation); transform.scale.set(...item.scale);
      transform.updateMatrix(); mesh.setMatrixAt(i, transform.matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
    mesh.castShadow = true; mesh.receiveShadow = true;
    mesh.computeBoundingSphere();
    chunk.group.add(mesh);
  }
}

function seeded(seed) { let i = 0; return () => randomAt(seed, i++); }
