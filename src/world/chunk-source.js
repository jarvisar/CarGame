import { CHUNK_LENGTH, SEED } from './route.js';
import { unpackChunk } from './chunk-transfer.js';
import { residentWindow, prefetchOffsets } from './resident.js';

// One job at a time lets reversals and route switches cancel queued work before
// it runs. Only the two chunks just outside the resident window are prefetched.
export class ChunkWorker {
  constructor(createWorker = () => new Worker(new URL('./chunk-worker.js', import.meta.url), { type: 'module' })) {
    this.sources = new Set(); this.queue = []; this.active = null; this.nextId = 0; this.ready = false;
    this.stats = { generated: 0, consumed: 0, fallback: 0, discarded: 0 };
    try {
      this.worker = createWorker();
      this.worker.onmessage = ({ data }) => this.receive(data);
      this.worker.onerror = event => { event.preventDefault?.(); this.disable(); };
      this.worker.onmessageerror = () => this.disable();
      this.watchdog(); this.worker.postMessage({ type: 'init', seed: SEED });
    } catch { this.disable(); }
  }
  watchdog() { clearTimeout(this.timeout); this.timeout = setTimeout(() => this.disable(), 20000); }
  source(journey) { const source = new ChunkSource(this, journey); this.sources.add(source); return source; }
  receive(data) {
    clearTimeout(this.timeout);
    if (data.type === 'ready' && data.seed === SEED) this.ready = true;
    else if (data.type === 'chunk' && this.active?.id === data.id) {
      const task = this.active; this.active = null; this.stats.generated++;
      if (task.source.pending.get(task.index) === task) {
        task.source.cache.set(task.index, data.chunk); task.source.pending.delete(task.index);
      } else this.stats.discarded++;
      task.resolve();
    } else { this.disable(); return; }
    this.pump();
  }
  pump() {
    if (!this.worker || !this.ready || this.active) return;
    const task = this.queue.shift();
    if (!task) return;
    this.active = task; this.watchdog();
    try { this.worker.postMessage({ type: 'build', id: task.id, journey: task.source.journey, index: task.index }); }
    catch { this.disable(); }
  }
  cancel(task) {
    if (task.source.pending.get(task.index) === task) task.source.pending.delete(task.index);
    const index = this.queue.indexOf(task); if (index !== -1) this.queue.splice(index, 1);
    task.resolve();
  }
  disable() {
    clearTimeout(this.timeout); this.worker?.terminate(); this.worker = null; this.ready = false;
    for (const source of this.sources) for (const task of source.pending.values()) this.cancel(task);
    this.queue.length = 0; this.active = null;
  }
  dispose() { this.disable(); for (const source of this.sources) source.dispose(); }
}

class ChunkSource {
  constructor(owner, journey) { this.owner = owner; this.journey = journey; this.cache = new Map(); this.pending = new Map(); this.disposed = false; }
  async prepare(s) {
    const center = Math.floor(s / CHUNK_LENGTH), { behind, ahead } = residentWindow();
    this.prefetch(center, new Map());
    // Prepare the whole initial view before revealing it. Edge prefetches may
    // finish afterward; ordinary driving has a full chunk's worth of lead time.
    await Promise.all([...this.pending.values()].filter(task => task.index >= center - behind && task.index <= center + ahead).map(task => task.done));
  }
  // The queue follows the resident window, so a quality level that keeps less
  // of the route built also stops the worker building what it will not show.
  prefetch(center, resident) {
    if (this.disposed) return;
    const { behind, ahead } = residentWindow(), first = center - behind - 1, last = center + ahead + 1;
    for (const index of this.cache.keys()) if (index < first || index > last || resident.has(index)) this.cache.delete(index);
    for (const task of this.pending.values()) if (task.index < first || task.index > last || resident.has(task.index) || this.cache.has(task.index)) this.owner.cancel(task);
    if (!this.owner.worker) return;
    // Nearby chunks have priority during loading; offscreen chunks come last.
    for (const offset of prefetchOffsets(behind, ahead)) {
      const index = center + offset;
      if (resident.has(index) || this.cache.has(index) || this.pending.has(index)) continue;
      const task = { source: this, index, id: ++this.owner.nextId };
      task.done = new Promise(resolve => { task.resolve = resolve; });
      this.pending.set(index, task); this.owner.queue.push(task);
    }
    this.owner.pump();
  }
  take(index) {
    const data = this.cache.get(index); this.cache.delete(index);
    const task = this.pending.get(index); if (task) this.owner.cancel(task);
    if (data) {
      try { const chunk = unpackChunk(data); this.owner.stats.consumed++; return chunk; }
      catch { this.owner.disable(); }
    }
    this.owner.stats.fallback++;
    return null; // Existing synchronous builders cover failures or distant jumps.
  }
  retain(index, chunk) {
    // The evicted chunk is the next one needed when reversing. Retain its CPU
    // buffers inside the same two-chunk cache while releasing its GPU resources.
    if (!this.disposed && chunk.sourceData) this.cache.set(index, chunk.sourceData);
  }
  dispose() {
    this.disposed = true;
    for (const task of this.pending.values()) this.owner.cancel(task);
    this.cache.clear(); this.owner.sources.delete(this);
  }
}
