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
    } else {
      chunk.dirtPatch(s + 1, u, 10, 8);
      ground = foundation(s, u, 5, 8, angle);
      add('plains-grain-elevators', assets.grainElevator, material, point(s, u, ground), [0, angle + Math.PI / 2, 0], [1.25, 1.25, 1.25]);
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
