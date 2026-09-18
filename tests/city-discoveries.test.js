import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { cityDiscoveries, cityDiscoveryClears, cityLotClears, CITY_DISCOVERY_SPACING } from '../src/world/city-discoveries.js';
import { blockBoundary, nearStreet, quayOffset, BANDS } from '../src/world/city-route.js';
import { CityChunk } from '../src/world/city.js';
import { packChunk, unpackChunk } from '../src/world/chunk-transfer.js';

test('city discoveries are sparse, varied, on the street grid, and stable across reversed chunk queries', () => {
  const sites = cityDiscoveries(-100000, 100000);
  assert.deepEqual(cityDiscoveries(-100000, 0).concat(cityDiscoveries(0, 100000)), sites);
  assert.ok(sites.length > 8 && sites.length < 40);
  assert.deepEqual([...new Set(sites.map(site => site.kind))].sort(), ['clock-tower', 'river-bridge', 'square']);
  for (let i = 1; i < sites.length; i++) assert.ok(sites[i].s - sites[i - 1].s > 3000, 'leave kilometres between any two discoveries');
  for (const site of [...sites].reverse()) {
    assert.ok(Math.abs(site.s - (site.index + .5) * CITY_DISCOVERY_SPACING) < 1400);
    const start = Math.floor(site.s / 128) * 128;
    assert.deepEqual(cityDiscoveries(start, start + 128), sites.filter(other => other.s >= start && other.s < start + 128));
    assert.ok(!cityDiscoveryClears(site.s, site.u, [site]));
    assert.ok(cityDiscoveryClears(site.s + site.halfS + 5, site.u, [site]));
    assert.ok(!cityLotClears(site.s - 2, site.s + 2, site.u - 1, site.u + 1, [site]));
    assert.ok(cityLotClears(site.s + site.halfS + 1, site.s + site.halfS + 10, site.u0, site.u1, [site]));
    if (site.kind === 'river-bridge') {
      assert.equal(site.s, blockBoundary(site.street)); assert.ok(nearStreet(site.street), 'the bridge continues a street that reaches the quay');
      assert.ok(site.u < quayOffset(site.s) && site.side === -1);
    } else {
      assert.equal(site.side, 1);
      assert.ok(site.s - site.halfS >= blockBoundary(site.block) + 8 && site.s + site.halfS <= blockBoundary(site.block + 1) - 8, `${site.kind} spills into the cross street`);
      assert.ok(site.u0 >= BANDS[0].front - 1);
      if (site.kind === 'square') assert.ok(site.halfS >= 38 && site.u1 > BANDS[1].front);
    }
  }
});

test('city discovery meshes survive worker transfer with their sites', () => {
  const sites = cityDiscoveries(-100000, 100000);
  for (const [kind, name] of [['river-bridge', 'city-boxes'], ['square', 'city-fountains'], ['clock-tower', 'city-clock-towers']]) {
    const site = sites.find(site => site.kind === kind), original = new CityChunk(Math.floor(site.s / 128));
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
      if (kind === 'river-bridge') {
        // The deck spans the water from the quay to the far bank, and no
        // building stands on the landing.
        const matrix = new THREE.Matrix4(), position = new THREE.Vector3();
        let nearest = Infinity, farthest = -Infinity;
        for (let i = 0; i < after.count; i++) {
          after.getMatrixAt(i, matrix); position.setFromMatrixPosition(matrix);
          const u = position.x - original.at(site.s, 0, 0).x;
          if (position.y > 22) { nearest = Math.min(nearest, u); farthest = Math.max(farthest, u); }
        }
        assert.ok(farthest > quayOffset(site.s) - 4 && nearest < -130, `deck spans ${nearest} to ${farthest}`);
      }
    } finally { original.dispose(); restored.dispose(); }
  }
});
