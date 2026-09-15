import * as THREE from 'three';
import { registerChunkResources } from './chunk-resources.js';
import { positionAt, shorelineOffset, randomAt } from './route.js';
import { waterClock } from './water.js';

const geometry = new THREE.BufferGeometry();
geometry.setAttribute('position', new THREE.Float32BufferAttribute([
  0, 0, -.38, -.65, .08, 0, -.1, 0, .3,
  -.65, .08, 0, -1.5, -.12, .45, -.1, 0, .3,
  0, 0, -.38, .1, 0, .3, .65, .08, 0,
  .65, .08, 0, .1, 0, .3, 1.5, -.12, .45,
  -.13, 0, .2, .13, 0, .2, 0, 0, .68,
], 3));
geometry.computeVertexNormals();
const material = new THREE.MeshBasicMaterial({ color: '#fffaf0', side: THREE.DoubleSide, toneMapped: false });
material.onBeforeCompile = shader => {
  shader.uniforms.birdTime = waterClock.time;
  shader.vertexShader = 'uniform float birdTime;\n' + shader.vertexShader;
  shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', `
    #include <begin_vertex>
    float phase = instanceMatrix[3].x * 0.31;
    float flap = sin(birdTime * 5.0 + phase) * smoothstep(0.25, 0.8, sin(birdTime * 0.55 + phase));
    transformed.y += abs(position.x) * (0.12 + flap * 0.25);
  `);
};
material.customProgramCacheKey = () => 'coastal-gull-v1';
registerChunkResources('birds', { geometry, material });
const transform = new THREE.Object3D();

export class CoastalBirds {
  constructor(chunk) {
    this.start = chunk.start; this.phase = randomAt(chunk.index, 1761) * Math.PI * 2;
    // Pick a clear cruising height once, including tilted rocks and their crowns.
    // The margin covers the gentle bobbing and wings without per-frame collisions.
    this.flightHeight = 22;
    for (const object of chunk.group.children) if (object.name === 'tidal-sea-stacks') {
      if (!object.boundingBox) object.computeBoundingBox();
      this.flightHeight = Math.max(this.flightHeight, object.boundingBox.max.y + 5);
    }
    this.mesh = new THREE.InstancedMesh(geometry, material, 4);
    this.mesh.name = 'coastal-gulls';
    chunk.group.add(this.mesh); this.update(0);
    this.mesh.computeBoundingSphere(); this.mesh.boundingSphere.radius += 85;
  }
  update(time) {
    const phase = this.phase + time * .105;
    for (let i = 0; i < 4; i++) {
      const s = this.start + 64 + Math.cos(phase) * 24 - i * 2.4;
      const u = shorelineOffset(s) - 30 + Math.sin(phase) * 10 + (i % 2 ? 2 : -2);
      const p = positionAt(s, u, this.flightHeight + Math.sin(phase * .7) * 2 + i * .35);
      transform.position.set(p.x, p.y, p.z + this.start);
      transform.rotation.set(0, -phase + Math.PI / 2, Math.sin(phase) * .16);
      transform.scale.setScalar(.78); transform.updateMatrix(); this.mesh.setMatrixAt(i, transform.matrix);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}
