import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { plainsDiscoveries, plainsDiscoveryClears, PLAINS_DISCOVERY_SPACING, TURBINE_SPACING } from '../src/world/plains-discoveries.js';
import { creekDistance, plainsGroundHeight, plainsRoadHeight } from '../src/world/plains-route.js';
import { PlainsChunk } from '../src/world/plains.js';
import { packChunk, unpackChunk } from '../src/world/chunk-transfer.js';

test('plains discoveries are sparse, varied, level, and stable across reversed chunk queries', () => {
  const sites = plainsDiscoveries(-100000, 100000);
  assert.deepEqual(plainsDiscoveries(-100000, 0).concat(plainsDiscoveries(0, 100000)), sites);
  assert.ok(sites.length > 35 && sites.length < 65);
  assert.deepEqual([...new Set(sites.map(site => site.kind))].sort(), ['farmstead', 'grain-elevator', 'wind-turbines']);
  for (let i = 1; i < sites.length; i++) assert.ok(sites[i].s - sites[i - 1].s > 1600, 'leave a kilometre and more between any two discoveries');
  for (const site of [...sites].reverse()) {
    assert.ok(Math.abs(site.s - (site.index + .5) * PLAINS_DISCOVERY_SPACING) < PLAINS_DISCOVERY_SPACING / 4);
    const start = Math.floor(site.s / 128) * 128;
    assert.deepEqual(plainsDiscoveries(start, start + 128), sites.filter(other => other.s >= start && other.s < start + 128));
    const spots = site.towers ?? [{ s: site.s, u: site.u }];
    for (const spot of spots) {
      assert.ok(Math.abs(spot.u) >= 30, 'structures stay well off the road');
      assert.ok(creekDistance(spot.s, spot.u) > 30, 'structures keep clear of the creek');
      // Level under the buildings, which is the ground each site declares it
      // needs; a compound keeps more ground clear than it builds on.
      const { build } = site;
      const heights = [-1, 0, 1].flatMap(ds => [-1, 0, 1].map(du => plainsGroundHeight(spot.s + ds * build.s, spot.u + du * build.u)));
      assert.ok(Math.max(...heights) - Math.min(...heights) < 3.1, `${site.kind} on uneven ground at ${site.s}`);
      assert.ok(build.s <= site.halfS && build.u <= site.halfU, 'a site cannot build past the ground it keeps clear');
    }
    if (site.towers) {
      assert.equal(site.towers.length, 3);
      assert.ok(site.side === 1 && site.towers.every(tower => tower.u > 0), 'turbines stand on the far side of the road');
      assert.ok(Math.abs(site.towers[2].s - site.towers[0].s - 2 * TURBINE_SPACING) < 1e-9);
      // Only the footings are cleared: the fields between the turbines stay farmed.
      assert.ok(!plainsDiscoveryClears(site.towers[1].s, site.towers[1].u, [site], 2));
      assert.ok(plainsDiscoveryClears(site.towers[1].s + TURBINE_SPACING / 2, site.towers[1].u, [site], 2));
    } else {
      assert.ok(!plainsDiscoveryClears(site.s, site.u, [site]));
      // The drive from the road to the yard is kept clear of fences too.
      assert.ok(!plainsDiscoveryClears(site.s + site.drive, site.side * 20, [site]));
      assert.ok(plainsDiscoveryClears(site.s + site.halfS + 12, site.u, [site]));
      if (site.kind === 'grain-elevator') assert.equal(site.side, 1);
    }
  }
});

test("a farm's drive and its yard are one unbroken piece of bare earth", () => {
  const sites = plainsDiscoveries(0, 200000);
  for (const kind of ['farmstead', 'grain-elevator']) {
    const site = sites.find(other => other.kind === kind);
    const chunk = new PlainsChunk(Math.floor(site.s / 128));
    const dirt = chunk.group.getObjectByName('farm-tracks').geometry.attributes.position;
    // Group the bare earth into the pieces a tractor could cross without
    // leaving it: triangles that share a corner are the same piece of ground.
    const parent = [], root = t => parent[t] === t ? t : (parent[t] = root(parent[t]));
    const seen = new Map(), middle = [];
    for (let t = 0; t * 3 < dirt.count; t++) {
      parent[t] = t;
      let x = 0, z = 0;
      for (let k = 0; k < 3; k++) {
        const i = t * 3 + k, key = `${Math.round(dirt.getX(i) * 100)},${Math.round(dirt.getZ(i) * 100)}`;
        x += dirt.getX(i) / 3; z += dirt.getZ(i) / 3;
        if (seen.has(key)) parent[root(t)] = root(seen.get(key)); else seen.set(key, t);
      }
      middle.push([x, z]);
    }
    const nearest = (s, u) => {
      const p = chunk.ground(s, u), gap = t => Math.hypot(middle[t][0] - p.x, middle[t][1] - p.z);
      const best = middle.reduce((found, _, t) => gap(t) < gap(found) ? t : found, 0);
      assert.ok(gap(best) < 4, `no bare earth at ${Math.round(s)}, ${Math.round(u)}`);
      return best;
    };
    // The drive's mouth at the highway, and the middle of the yard it serves.
    assert.equal(root(nearest(site.s + site.drive, site.side * 8)), root(nearest(site.s, site.u)),
      `a ${kind}'s drive stops short of its yard, leaving standing crop between the two`);
    chunk.dispose();
  }
});

test('a farm wears its yard bare over most of the ground it takes in, and only some farms fence it', () => {
  // Does the point stand on bare earth? A triangle's three edge tests agree
  // on a sign for a point inside it, whichever way round the triangle is wound.
  const bare = (triangles, x, z) => triangles.some(([a, b, c]) => {
    const side = (p, q) => (q[0] - p[0]) * (z - p[1]) - (q[1] - p[1]) * (x - p[0]);
    const ab = side(a, b), bc = side(b, c), ca = side(c, a);
    return !((ab < 0 || bc < 0 || ca < 0) && (ab > 0 || bc > 0 || ca > 0));
  });
  let farms = 0, fenced = 0, worn = 0;
  for (const site of plainsDiscoveries(0, 100000).filter(other => other.kind === 'farmstead')) {
    const chunk = new PlainsChunk(Math.floor(site.s / 128));
    const dirt = chunk.group.getObjectByName('farm-tracks').geometry.attributes.position.array, triangles = [];
    for (let i = 0; i < dirt.length; i += 9) {
      triangles.push([[dirt[i], dirt[i + 2]], [dirt[i + 3], dirt[i + 5]], [dirt[i + 6], dirt[i + 8]]]);
    }
    // The ground the yard takes in, out to the line its fence stands on.
    const yardS = site.halfS - 4, yardU = site.halfU - 3;
    let earth = 0, ground = 0;
    for (let ds = -yardS; ds <= yardS; ds += 3) for (let du = -yardU; du <= yardU; du += 3) {
      const p = chunk.ground(site.s + ds, site.u + du * site.side);
      ground++; if (bare(triangles, p.x, p.z)) earth++;
    }
    // Posts standing over the yard itself. Nothing else may stand this close
    // to a compound, so a yard with a line of them round it is a fenced one.
    const middle = chunk.ground(site.s, site.u), matrix = new THREE.Matrix4(), post = new THREE.Vector3();
    let standing = 0;
    chunk.group.traverse(object => {
      if (object.name !== 'fence-posts') return;
      for (let i = 0; i < object.count; i++) {
        object.getMatrixAt(i, matrix); post.setFromMatrixPosition(matrix);
        if (Math.hypot(post.x - middle.x, post.z - middle.z) < 24) standing++;
      }
    });
    farms++; worn += earth / ground; if (standing > 8) fenced++;
    chunk.dispose();
  }
  assert.ok(farms > 4, 'not enough farms to judge by');
  assert.ok(worn / farms > .55, `a farm's yard is bare over only ${Math.round(worn / farms * 100)}% of the ground it takes in`);
  assert.ok(fenced > farms * .2 && fenced < farms * .8, `${fenced} of ${farms} farms fence their yard`);
});

test('plains discovery meshes and the spinning rotor materials survive worker transfer', () => {
  const sites = plainsDiscoveries(-100000, 100000);
  for (const [kind, name] of [['farmstead', 'plains-barns'], ['farmstead', 'plains-windmill-rotors'], ['grain-elevator', 'plains-grain-elevators'], ['wind-turbines', 'plains-turbine-rotors']]) {
    const site = sites.find(site => site.kind === kind), original = new PlainsChunk(Math.floor(site.s / 128));
    const before = original.group.getObjectByName(name);
    assert.ok(before, `${name} missing from the chunk`);
    const matrices = before.instanceMatrix.array.slice();
    const { data, transfers } = packChunk(original), restored = unpackChunk(structuredClone(data, { transfer: transfers }));
    try {
      const after = restored.group.getObjectByName(name);
      assert.deepEqual(restored.features, original.features);
      assert.equal(after.geometry, before.geometry); assert.equal(after.material, before.material);
      assert.deepEqual(after.instanceMatrix.array, matrices);
      assert.equal(restored.features.discoveries.filter(other => other.index === site.index).length, 1);
      if (name.endsWith('-rotors')) {
        assert.equal(after.castShadow, false, 'a shadow cannot follow a rotor that spins in the shader');
        const shader = { uniforms: {}, vertexShader: '#include <beginnormal_vertex>\n#include <begin_vertex>' };
        after.material.onBeforeCompile(shader);
        assert.ok(shader.uniforms.plainsTime);
        assert.match(shader.vertexShader, /transformed.xy = spin/);
      }
      if (kind === 'wind-turbines') {
        // Every tower stands on its own footing, above the ground it was placed on.
        const towers = restored.group.getObjectByName('plains-wind-turbines'), matrix = new THREE.Matrix4(), position = new THREE.Vector3();
        for (let i = 0; i < towers.count; i++) {
          towers.getMatrixAt(i, matrix); position.setFromMatrixPosition(matrix);
          assert.ok(position.y > plainsRoadHeight(site.s) - 12 && position.y < plainsRoadHeight(site.s) + 20);
        }
      }
    } finally { original.dispose(); restored.dispose(); }
  }
});
