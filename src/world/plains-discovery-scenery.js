import * as THREE from 'three';
import { CHUNK_LENGTH, roadFrame, randomAt } from './route.js';
import { plainsDiscoveryAssets as assets, plainsDiscoveryMaterial as material, plainsFoundationMaterial, plainsWindmillMaterial, plainsTurbineMaterial } from './plains-discovery-assets.js';

const transform = new THREE.Object3D();

export function buildPlainsDiscoveries(chunk, discoveries) {
  const batches = new Map(), inChunk = s => s >= chunk.start && s < chunk.start + CHUNK_LENGTH;
  const point = (s, u, height) => {
    const p = chunk.ground(s, u);
    return [p.x, height ?? p.y, p.z];
  };
  function add(name, geometry, paint, p, rotation = [0, 0, 0], scale = [1, 1, 1]) {
    if (!batches.has(name)) batches.set(name, { geometry, paint, items: [] });
    batches.get(name).items.push({ p, rotation, scale });
  }
  // A footing spans the ground's highs and lows, so buildings stand level on
  // a plain that still rolls a little.
  function foundation(s, u, halfU, halfS, angle) {
    const samples = [-halfS, 0, halfS].flatMap(ds => [-halfU, 0, halfU].map(du => chunk.ground(s + ds, u + du).y));
    const low = Math.min(...samples) - .35, high = Math.max(...samples) + .05;
    add('plains-discovery-footings', assets.box, plainsFoundationMaterial, point(s, u, (low + high) / 2), [0, angle, 0], [halfU * 2, high - low, halfS * 2]);
    return high;
  }
  // Rotate a local offset into world space around a placement's yaw.
  const offset = (root, angle, x, y, z) => {
    const v = new THREE.Vector3(x, y, z).applyAxisAngle(new THREE.Vector3(0, 1, 0), angle);
    return [root[0] + v.x, root[1] + v.y, root[2] + v.z];
  };
  for (const site of discoveries) {
    const { s, u, side, kind } = site;
    if (kind === 'wind-turbines') {
      for (const [k, tower] of site.towers.entries()) {
        if (!inChunk(tower.s)) continue;
        // Rotors face roughly along the road, into the prevailing wind, so the
        // fixed camera sees the blades sweep rather than a thin disc edge-on.
        const yaw = -roadFrame(tower.s).angle + (randomAt(site.index, 2931 + k) - .5) * .9;
        const ground = foundation(tower.s, tower.u, 2.2, 2.2, yaw);
        const root = point(tower.s, tower.u, ground);
        add('plains-wind-turbines', assets.turbineTower, material, root, [0, yaw, 0]);
        add('plains-turbine-rotors', assets.turbineRotor, plainsTurbineMaterial, offset(root, yaw, 0, 38.6, -3.3), [0, yaw, 0]);
      }
      if (inChunk(s)) chunk.features.discoveries.push({ ...site });
      continue;
    }
    if (!inChunk(s)) continue;
    // Compounds face the road across their drive.
    const angle = -roadFrame(s).angle + (side < 0 ? 0 : Math.PI);
    const local = (ds, du) => [s + ds, u + du * side];
    chunk.track(s + site.drive, side, Math.abs(u) - site.halfU + 4);
    let ground;
    if (kind === 'farmstead') {
      chunk.dirtPatch(s + 2, u, 12, 9);
      // Buildings are drawn a quarter over life size, as the miniature style
      // does with the cabins and the lighthouse, so they read from the road.
      const big = [1.25, 1.25, 1.25];
      const [barnS, barnU] = local(-7, 3);
      ground = foundation(barnS, barnU, 4.5, 7, angle);
      add('plains-barns', assets.barn, material, point(barnS, barnU, ground), [0, angle + Math.PI / 2, 0], big);
      const [siloS, siloU] = local(-17, 1.5);
      const siloGround = foundation(siloS, siloU, 3.1, 3.1, angle);
      add('plains-silos', assets.silo, material, point(siloS, siloU, siloGround), [0, angle, 0], big);
      const [houseS, houseU] = local(10.5, -4.5);
      const houseGround = foundation(houseS, houseU, 4, 5, angle);
      add('plains-farmhouses', assets.farmhouse, material, point(houseS, houseU, houseGround), [0, angle + Math.PI / 2, 0], big);
      const [millS, millU] = local(17, 9);
      const millGround = foundation(millS, millU, 1.4, 1.4, angle);
      const millRoot = point(millS, millU, millGround), millYaw = angle + (randomAt(site.index, 2932) - .5) * 1.2;
      add('plains-windmill-towers', assets.windmillTower, material, millRoot, [0, millYaw, 0]);
      add('plains-windmill-rotors', assets.windmillRotor, plainsWindmillMaterial, offset(millRoot, millYaw, 0, 8.65, -.55), [0, millYaw, 0]);
      const [tractorS, tractorU] = local(2, 9);
      add('plains-tractors', assets.tractor, material, point(tractorS, tractorU), [0, angle + .5 + randomAt(site.index, 2933) * .6, 0]);
      for (const [ds, du, height] of [[-19, -9, 11], [12, 11, 9], [-4, -14, 12]]) {
        const [treeS, treeU] = local(ds, du);
        chunk.tree('oak', treeS, treeU, height, ['#4d7434', '#587f3a', '#43682e'][Math.abs(ds) % 3], randomAt(site.index, 2934 + ds) * 6.28);
      }
      // A machine shed at the back, and a fence round the yard with its gate
      // where the drive comes in.
      const [shedS, shedU] = local(0, 13);
      const shedGround = foundation(shedS, shedU, 2.2, 3.4, angle);
      chunk.scenery.painted.push({ p: point(shedS, shedU, shedGround + 1.3), scale: [4.2, 2.6, 6.6], r: [0, angle, 0], color: '#9c9585' });
      chunk.scenery.painted.push({ p: point(shedS, shedU, shedGround + 2.72), scale: [4.8, .22, 7.2], r: [0, angle, 0], color: '#6d655c' });
      const yardS = site.halfS - 4, yardU = site.halfU - 3, ring = [];
      for (let ds = -yardS; ds <= yardS; ds += 4) ring.push([ds, -yardU]);
      for (let du = -yardU + 4; du < yardU; du += 4) ring.push([yardS, du]);
      for (let ds = yardS; ds >= -yardS; ds -= 4) ring.push([ds, yardU]);
      for (let du = yardU - 4; du > -yardU; du -= 4) ring.push([-yardS, du]);
      chunk.fence(ring.filter(([ds, du]) => !(du === -yardU && Math.abs(ds - site.drive) < 4.5)).map(([ds, du]) => ({ s: s + ds, u: u + du * side })), false);
    } else {
      chunk.dirtPatch(s + 1, u, 10, 8);
      ground = foundation(s, u, 5, 8, angle);
      add('plains-grain-elevators', assets.grainElevator, material, point(s, u, ground), [0, angle + Math.PI / 2, 0], [1.25, 1.25, 1.25]);
      // A rail spur runs past the elevator on a ballast strip, with a hopper
      // car waiting under the loading side.
      const railU = u + side * (site.halfU + 1.5), { painted } = chunk.scenery;
      for (let t = s - 96; t < s + 96; t += 8) {
        if (!inChunk(t + 4)) continue;
        chunk.dirtQuad([[t, railU - 1.9], [t + 8, railU - 1.9], [t, railU + 1.9], [t + 8, railU + 1.9]]);
        const a = chunk.ground(t, railU), b = chunk.ground(t + 8, railU);
        for (const offset of [-.75, .75]) {
          const from = chunk.ground(t, railU + offset), to = chunk.ground(t + 8, railU + offset);
          chunk.beam(painted, { ...from, y: a.y + .21 }, { ...to, y: b.y + .21 }, .13, '#6a675f');
        }
        for (let k = 0; k < 8; k += 1.4) {
          const p = chunk.ground(t + k, railU);
          painted.push({ p: [p.x, p.y + .12, p.z], scale: [2.5, .14, .3], r: [0, -roadFrame(t + k).angle, 0], color: '#5d4d3b' });
        }
      }
      const carS = s + 24;
      if (inChunk(carS)) {
        const p = chunk.ground(carS, railU), yaw = -roadFrame(carS).angle;
        painted.push({ p: [p.x, p.y + 2.25, p.z], scale: [2.7, 2.7, 11.5], r: [0, yaw, 0], color: '#8a5340' });
        painted.push({ p: [p.x, p.y + 3.75, p.z], scale: [2.9, .3, 11.8], r: [0, yaw, 0], color: '#6f4434' });
        for (const dz of [-3.9, 3.9]) { const q = chunk.ground(carS + dz, railU); painted.push({ p: [q.x, q.y + .55, q.z], scale: [2.2, .7, 1.8], r: [0, yaw, 0], color: '#3c3a36' }); }
      }
    }
    chunk.features.discoveries.push({ ...site, ground });
  }
  for (const [name, { geometry, paint, items }] of batches) {
    const mesh = new THREE.InstancedMesh(geometry, paint, items.length); mesh.name = name;
    items.forEach((item, i) => {
      transform.position.set(...item.p); transform.rotation.set(...item.rotation); transform.scale.set(...item.scale);
      transform.updateMatrix(); mesh.setMatrixAt(i, transform.matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
    const rotor = name.endsWith('-rotors');
    mesh.castShadow = !rotor; mesh.receiveShadow = true;
    mesh.computeBoundingSphere();
    if (rotor) mesh.boundingSphere.radius = Math.max(mesh.boundingSphere.radius, name.startsWith('plains-turbine') ? 22 : 3);
    chunk.group.add(mesh);
  }
}
