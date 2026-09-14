export class Input {
  constructor(onAction) {
    this.keys = new Set(); this.pointers = new Map(); this.onAction = onAction;
    this.codes = { forward: ['KeyW', 'ArrowUp'], brake: ['KeyS', 'ArrowDown'], left: ['KeyA', 'ArrowLeft'], right: ['KeyD', 'ArrowRight'], handbrake: ['Space'] };
    window.addEventListener('keydown', e => {
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
      this.keys.add(e.code);
      if (!e.repeat) {
        if (['KeyW', 'ArrowUp', 'KeyS', 'ArrowDown'].includes(e.code)) onAction('drive');
        if (['KeyP', 'Escape'].includes(e.code)) onAction('pause');
        if (e.code === 'KeyR') onAction('reset');
        if (e.code === 'KeyV') onAction('view');
        if (e.code === 'KeyM') onAction('sound');
      }
    });
    window.addEventListener('keyup', e => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.clear());
    document.querySelectorAll('[data-control]').forEach(button => {
      button.addEventListener('pointerdown', e => { e.preventDefault(); button.setPointerCapture(e.pointerId); this.pointers.set(e.pointerId, button.dataset.control); button.classList.add('active'); onAction('drive'); });
      const release = e => { this.pointers.delete(e.pointerId); button.classList.remove('active'); };
      button.addEventListener('pointerup', release); button.addEventListener('pointercancel', release); button.addEventListener('lostpointercapture', release);
    });
  }
  get state() {
    const touch = new Set(this.pointers.values());
    return Object.fromEntries(Object.entries(this.codes).map(([action, codes]) => [action, touch.has(action) || codes.some(code => this.keys.has(code))]));
  }
  clear() { this.keys.clear(); this.pointers.clear(); document.querySelectorAll('[data-control]').forEach(button => button.classList.remove('active')); }
}
