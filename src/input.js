import { GamepadInput } from './gamepad.js';
import { TouchStick } from './touch-stick.js';

export class Input {
  constructor(onAction, onControllerConnection = () => {}) {
    this.keys = new Set(); this.onAction = onAction;
    this.touchStick = new TouchStick(document.querySelector('#touch-stick'), () => onAction('drive'));
    this.codes = { forward: ['KeyW', 'ArrowUp'], brake: ['KeyS', 'ArrowDown'], left: ['KeyA', 'ArrowLeft'], right: ['KeyD', 'ArrowRight'], handbrake: ['Space'] };
    this.gamepad = new GamepadInput(onAction, connected => {
      this.keys.clear(); this.touchStick.clear();
      document.body.dataset.controller = String(connected);
      onControllerConnection(connected);
    });
    window.addEventListener('keydown', e => {
      if (document.querySelector('dialog[open]')) return;
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
  }
  get state() {
    const state = Object.fromEntries(Object.entries(this.codes).map(([action, codes]) => [action, codes.some(code => this.keys.has(code)) || this.gamepad.state[action] || false]));
    if (Object.values(state).some(Boolean) || this.gamepad.connected) this.touchStick.clear();
    else if (this.touchStick.engaged) state.touchStick = this.touchStick.vector;
    return state;
  }
  clear() { this.keys.clear(); this.touchStick.clear(); this.gamepad.clear(); }
}
