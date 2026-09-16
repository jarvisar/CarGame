// One instanced batch per chunk gets a bounding sphere as wide as the chunk,
// which the frustum test can almost never reject: scenery reaches hundreds of
// metres to either side of the road, so a batch keeps drawing long after its
// plants or rocks have left the screen. Halve a wide batch along its longer
// axis until the parts are small enough to cull; leave compact batches alone,
// since splitting those would only add draw calls.
//
// Every route's scenery items carry the same `p: [x, y, z]` placement, so the
// split works on the positions alone. The instances, geometry and materials are
// unchanged, and so is the picture.
const BATCH_SPAN = 260, BATCH_MINIMUM = 24;

export function splitBatch(items, depth = 0) {
  if (items.length <= BATCH_MINIMUM || depth === 3) return [items]; // At most eight parts.
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (const item of items) {
    minX = Math.min(minX, item.p[0]); maxX = Math.max(maxX, item.p[0]);
    minZ = Math.min(minZ, item.p[2]); maxZ = Math.max(maxZ, item.p[2]);
  }
  const alongX = maxX - minX >= maxZ - minZ;
  if ((alongX ? maxX - minX : maxZ - minZ) <= BATCH_SPAN) return [items];
  const axis = alongX ? 0 : 2, middle = alongX ? (minX + maxX) / 2 : (minZ + maxZ) / 2;
  const near = items.filter(item => item.p[axis] < middle);
  if (!near.length || near.length === items.length) return [items];
  return [...splitBatch(near, depth + 1), ...splitBatch(items.filter(item => item.p[axis] >= middle), depth + 1)];
}
