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
  assert.ok(sites.length > 5 && sites.length < 30);
  assert.deepEqual([...new Set(sites.map(site => site.kind))].sort(), ['farmstead', 'grain-elevator', 'wind-turbines']);
  for (let i = 1; i < sites.length; i++) assert.ok(sites[i].s - sites[i - 1].s > 4000, 'leave several kilometres between any two discoveries');
  for (const site of [...sites].reverse()) {
    assert.ok(Math.abs(site.s - (site.index + .5) * PLAINS_DISCOVERY_SPACING) < 1300);
    const start = Math.floor(site.s / 128) * 128;
    assert.deepEqual(plainsDiscoveries(start, start + 128), sites.filter(other => other.s >= start && other.s < start + 128));
    const spots = site.towers ?? [{ s: site.s, u: site.u }];
    for (const spot of spots) {
      assert.ok(Math.abs(spot.u) >= 30, 'structures stay well off the road');
      assert.ok(creekDistance(spot.s, spot.u) > 30, 'structures keep clear of the creek');
      const reach = site.towers ? 6 : Math.min(site.halfS, site.halfU);
      const heights = [-reach, 0, reach].flatMap(ds => [-reach, 0, reach].map(du => plainsGroundHeight(spot.s + ds, spot.u + du)));
      assert.ok(Math.max(...heights) - Math.min(...heights) < 3.1, `${site.kind} on uneven ground at ${site.s}`);
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
