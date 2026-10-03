export interface SimSpeed {
  label: string;
  /** Simulated seconds that pass per real second. */
  value: number;
}

export const SPEEDS: readonly SimSpeed[] = [
  { label: '1×', value: 1 },
  { label: '1 min/s', value: 60 },
  { label: '1 h/s', value: 3_600 },
  { label: '6 h/s', value: 21_600 },
  { label: '1 d/s', value: 86_400 },
];

export const DAY_MS = 86_400_000;
export const DEFAULT_WINDOW_MS = 30 * DAY_MS;

export interface SimClockOptions {
  /** Injectable wall clock, mostly for tests. */
  now?: () => number;
  /** How far back in time the user may travel. */
  windowMs?: number;
}

/**
 * The time machine. Simulated time is either "live" (glued to the wall clock) or free-running
 * at a chosen speed somewhere inside [minTime, now]. Reaching "now" while playing forward
 * snaps back to live, so you can never travel into the future.
 */
export class SimClock {
  readonly minTime: number;
  readonly windowMs: number;

  private readonly nowFn: () => number;
  private t: number;
  private _speed = 1;
  private _playing = true;
  private _live = true;

  constructor(options: SimClockOptions = {}) {
    this.nowFn = options.now ?? Date.now;
    this.windowMs = options.windowMs ?? DEFAULT_WINDOW_MS;
    const now = this.nowFn();
    this.t = now;
    this.minTime = now - this.windowMs;
  }

  /** Current simulated time (ms since epoch). */
  get time(): number {
    return this.t;
  }

  /** Latest reachable time: the real "now". */
  get maxTime(): number {
    return this.nowFn();
  }

  get speed(): number {
    return this._speed;
  }

  get playing(): boolean {
    return this._playing;
  }

  get live(): boolean {
    return this._live;
  }

  /** Advance the simulation by `dtMs` of real time. */
  tick(dtMs: number): void {
    const now = this.nowFn();
    if (this._live) {
      this.t = now;
      return;
    }
    if (!this._playing) return;

    this.t += dtMs * this._speed;
    if (this.t >= now) this.goLive();
  }

  goLive(): void {
    this.t = this.nowFn();
    this._live = true;
    this._playing = true;
    this._speed = 1;
  }

  /** Jump to an arbitrary time inside the window. Seeking close to "now" goes live. */
  seek(timeMs: number): void {
    const now = this.nowFn();
    const clamped = Math.min(Math.max(timeMs, this.minTime), now);
    if (now - clamped < 1_000) {
      this.goLive();
      return;
    }
    this.t = clamped;
    this._live = false;
  }

  setSpeed(speed: number): void {
    if (!(speed > 0)) throw new RangeError('Speed must be positive');
    this._speed = speed;
    if (speed !== 1) this._live = false;
    this._playing = true;
  }

  pause(): void {
    this._live = false;
    this._playing = false;
  }

  play(): void {
    this._playing = true;
  }

  toggle(): void {
    if (this._playing) this.pause();
    else this.play();
  }
}
