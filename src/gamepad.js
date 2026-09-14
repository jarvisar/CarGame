const deadzone = (value = 0, threshold = .18) => Math.abs(value) <= threshold ? 0 : Math.sign(value) * Math.min(1, (Math.abs(value) - threshold) / (1 - threshold));
const buttonValue = (pad, index) => {
  const button = pad.buttons[index];
  return button ? Math.min(1, Math.max(0, button.value ?? Number(button.pressed))) : 0;
};

// Use the browser's standard Xbox / PlayStation layout, with the same indices
// as a best-effort fallback for handhelds exposing an unmapped gamepad.
export class GamepadInput {
  constructor(onAction, onConnection, getGamepads = () => navigator.getGamepads?.() ?? []) {
    this.onAction = onAction; this.onConnection = onConnection; this.getGamepads = getGamepads;
    this.index = null; this.connected = false; this.state = {};
    this.previousButtons = []; this.requireNeutral = false;
  }
  clear() { this.state = {}; this.requireNeutral = true; }
  update({ blocked = false, paused = false } = {}) {
    let pads;
    try { pads = Array.from(this.getGamepads()).filter(pad => pad?.connected); }
    catch { pads = []; } // Unsupported or restricted Gamepad API: keep other inputs available.
    const pad = pads.find(pad => pad.index === this.index) ?? pads.find(pad => pad.mapping === 'standard') ?? pads[0];
    if ((pad?.index ?? null) !== this.index) {
      this.index = pad?.index ?? null; this.state = {}; this.previousButtons = [];
      // A replacement controller must start at rest; the first can start with Gas.
      this.requireNeutral = this.connected;
    }
    if (Boolean(pad) !== this.connected) {
      this.connected = Boolean(pad); this.onConnection(this.connected);
    }
    if (!pad) { this.state = {}; return; }
    const buttons = pad.buttons.map((_, index) => buttonValue(pad, index) > .5);
    const pressed = index => buttons[index] && !this.previousButtons[index];
    const steer = deadzone(pad.axes[0]);
    const state = {
      forward: Math.max(deadzone(buttonValue(pad, 7), .08), buttonValue(pad, 0)),
      brake: Math.max(deadzone(buttonValue(pad, 6), .08), buttonValue(pad, 1)),
      left: Math.max(-steer, buttonValue(pad, 14), 0),
      right: Math.max(steer, buttonValue(pad, 15), 0),
    };
    const active = Object.values(state).some(Boolean) || buttons.some(Boolean);
    if (blocked || this.requireNeutral) {
      this.state = {}; this.previousButtons = buttons;
      this.requireNeutral = blocked || active;
      return;
    }
    // Sample once per display frame, including while paused, so held shortcuts
    // fire once and Start can resume the game without a keyboard or touchscreen.
    this.state = paused ? {} : state;
    const pause = pressed(9), view = pressed(2), reset = pressed(3);
    this.previousButtons = buttons;
    if (pause) { this.onAction('pause'); return; }
    if (paused) return;
    if (state.forward || state.brake) this.onAction('drive');
    if (view) this.onAction('view');
    if (reset) this.onAction('reset');
  }
}
