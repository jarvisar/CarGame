import { stableShadowDepth } from './shadow-depth.js';

// Scenery stays fixed within a chunk; water and birds animate in shaders or
// instance buffers. Keep the root live so floating-origin shifts still propagate.
export function finalizeChunkTransforms(group) {
  group.traverse(object => {
    stableShadowDepth(object);
    if (object === group) return;
    object.updateMatrix();
    object.matrixAutoUpdate = false;
  });
}
