import type { VehicleInput } from '../car/Vehicle';
import { clamp } from '../utils/math';

const GAME_KEYS = new Set([
  'KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight',
  'Space', 'ShiftLeft', 'ShiftRight', 'KeyC', 'KeyR', 'Escape', 'KeyP', 'Enter',
]);

// Клавиатура + геймпад. Кнопки-действия опрашиваются через consume().
export class Input {
  state: VehicleInput = { throttle: 0, brake: 0, steer: 0, handbrake: false, nitro: false };
  private keys = new Set<string>();
  private pressed = new Set<string>();
  enabled = true;

  attach(): void {
    window.addEventListener('keydown', (e) => {
      if (GAME_KEYS.has(e.code)) e.preventDefault();
      if (!e.repeat) this.pressed.add(e.code);
      this.keys.add(e.code);
    });
    window.addEventListener('keyup', (e) => {
      this.keys.delete(e.code);
    });
    window.addEventListener('blur', () => this.keys.clear());
  }

  consume(code: string): boolean {
    if (this.pressed.has(code)) {
      this.pressed.delete(code);
      return true;
    }
    return false;
  }

  endFrame(): void {
    this.pressed.clear();
  }

  private gamepad(): Gamepad | null {
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    for (const p of pads) if (p && p.connected) return p;
    return null;
  }

  poll(): VehicleInput {
    const s = this.state;
    if (!this.enabled) {
      s.throttle = 0; s.brake = 0; s.steer = 0; s.handbrake = false; s.nitro = false;
      return s;
    }
    const k = this.keys;
    const throttle = k.has('KeyW') || k.has('ArrowUp') ? 1 : 0;
    const brake = k.has('KeyS') || k.has('ArrowDown') ? 1 : 0;
    const left = k.has('KeyA') || k.has('ArrowLeft') ? 1 : 0;
    const right = k.has('KeyD') || k.has('ArrowRight') ? 1 : 0;
    s.throttle = throttle;
    s.brake = brake;
    s.steer = right - left;
    s.handbrake = k.has('Space');
    s.nitro = k.has('ShiftLeft') || k.has('ShiftRight');

    const gp = this.gamepad();
    if (gp) {
      const dz = (v: number) => (Math.abs(v) < 0.12 ? 0 : v);
      const steer = clamp(dz(gp.axes[0] || 0), -1, 1);
      if (Math.abs(steer) > Math.abs(s.steer)) s.steer = steer;
      const rt = gp.buttons[7]?.value ?? 0;
      const lt = gp.buttons[6]?.value ?? 0;
      if (rt > s.throttle) s.throttle = rt;
      if (lt > s.brake) s.brake = lt;
      if (gp.buttons[0]?.pressed) s.handbrake = true;
      if (gp.buttons[2]?.pressed || gp.buttons[3]?.pressed) s.nitro = true;
      if (gp.buttons[9]?.pressed) this.pressed.add('Escape');
      if (gp.buttons[1]?.pressed) this.pressed.add('Space');
    }
    return s;
  }
}
