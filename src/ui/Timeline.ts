import type { SimClock } from '../core/Clock';
import { SPEEDS } from '../core/Clock';
import { formatUtcDate, formatUtcTime } from '../core/format';
import type { LayerManager } from '../core/LayerManager';
import { h, icon } from './dom';

const BUCKETS = 120;
const SLIDER_STEPS = 10_000;
const AXIS_FORMAT = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'UTC',
  day: 'numeric',
  month: 'short',
});

/** Bottom bar: play/pause, speed, LIVE, a scrubber over the last 30 days and an activity sparkline. */
export class Timeline {
  readonly element: HTMLElement;

  private readonly playButton: HTMLButtonElement;
  private readonly liveButton: HTMLButtonElement;
  private readonly speedButtons: HTMLButtonElement[];
  private readonly dateLabel: HTMLElement;
  private readonly timeLabel: HTMLElement;
  private readonly slider: HTMLInputElement;
  private readonly canvas: HTMLCanvasElement;
  private readonly axis: HTMLElement;
  private dragging = false;
  private lastFingerprint = '';
  private lastActivityDraw = 0;

  constructor(
    private readonly clock: SimClock,
    private readonly layers: LayerManager,
  ) {
    this.playButton = h('button', {
      class: 'icon-btn play',
      type: 'button',
      'aria-label': 'Pause',
      onclick: () => clock.toggle(),
    });

    this.speedButtons = SPEEDS.map((speed) =>
      h('button', {
        type: 'button',
        class: 'speed',
        text: speed.label,
        title: speed.value === 1 ? 'Real time' : `${speed.label} of history per second`,
        onclick: () => clock.setSpeed(speed.value),
      }),
    );

    this.liveButton = h(
      'button',
      { class: 'live-btn', type: 'button', onclick: () => clock.goLive() },
      h('i'),
      'LIVE',
    );

    this.dateLabel = h('div', { class: 'tl-date' });
    this.timeLabel = h('div', { class: 'tl-time' });

    this.canvas = h('canvas', { class: 'activity', 'aria-hidden': 'true' });
    this.slider = h('input', {
      class: 'scrub',
      type: 'range',
      min: 0,
      max: SLIDER_STEPS,
      step: 1,
      'aria-label': 'Time machine: drag to travel back up to 30 days',
    });
    this.slider.addEventListener('pointerdown', () => (this.dragging = true));
    const stopDragging = () => (this.dragging = false);
    this.slider.addEventListener('pointerup', stopDragging);
    this.slider.addEventListener('pointercancel', stopDragging);
    this.slider.addEventListener('blur', stopDragging);
    this.slider.addEventListener('input', () => {
      const span = clock.maxTime - clock.minTime;
      clock.seek(clock.minTime + (Number(this.slider.value) / SLIDER_STEPS) * span);
      // Scrubbing freezes time, like a video player: press play (or pick a speed) to continue.
      clock.pause();
    });

    this.axis = h('div', { class: 'tl-axis', 'aria-hidden': 'true' });

    this.element = h(
      'section',
      { class: 'panel timeline', 'aria-label': 'Time machine' },
      h(
        'div',
        { class: 'tl-top' },
        this.playButton,
        h(
          'div',
          { class: 'speeds', role: 'group', 'aria-label': 'Playback speed' },
          ...this.speedButtons,
        ),
        h('div', { class: 'tl-clock' }, this.dateLabel, this.timeLabel),
        this.liveButton,
      ),
      h('div', { class: 'tl-track' }, this.canvas, this.slider),
      this.axis,
    );

    new ResizeObserver(() => this.drawActivity()).observe(this.canvas);
    this.layers.changed.on(() => this.drawActivity());
    this.update();
  }

  update(): void {
    const { clock } = this;
    const span = clock.maxTime - clock.minTime;
    if (!this.dragging) {
      this.slider.value = String(Math.round(((clock.time - clock.minTime) / span) * SLIDER_STEPS));
    }

    const speedIndex = SPEEDS.findIndex((s) => s.value === clock.speed);
    const fingerprint = `${clock.live}|${clock.playing}|${speedIndex}|${formatUtcDate(clock.time)}`;
    if (fingerprint !== this.lastFingerprint) {
      this.lastFingerprint = fingerprint;
      this.playButton.replaceChildren(icon(clock.playing ? 'pause' : 'play'));
      this.playButton.setAttribute('aria-label', clock.playing ? 'Pause' : 'Play');
      this.liveButton.classList.toggle('on', clock.live);
      this.liveButton.setAttribute('aria-pressed', String(clock.live));
      this.speedButtons.forEach((b, i) => {
        b.classList.toggle('active', i === speedIndex && clock.playing);
        b.setAttribute('aria-pressed', String(i === speedIndex));
      });
      this.dateLabel.textContent = formatUtcDate(clock.time);
      this.refreshAxis();
    }
    this.timeLabel.textContent = formatUtcTime(clock.time);
    this.slider.setAttribute(
      'aria-valuetext',
      `${formatUtcDate(clock.time)}, ${formatUtcTime(clock.time)}${clock.live ? ' (live)' : ''}`,
    );

    if (performance.now() - this.lastActivityDraw > 4000) this.drawActivity();
  }

  private refreshAxis(): void {
    const { minTime } = this.clock;
    const span = this.clock.maxTime - minTime;
    const labels = [0, 0.25, 0.5, 0.75, 1].map((f) =>
      f === 1 ? 'Now' : AXIS_FORMAT.format(minTime + f * span),
    );
    this.axis.replaceChildren(...labels.map((text) => h('span', { text })));
  }

  /** Sparkline of what happened when, drawn from every enabled layer that reports activity. */
  private drawActivity(): void {
    this.lastActivityDraw = performance.now();
    const canvas = this.canvas;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    if (!width || !height) return;
    if (canvas.width !== Math.round(width * dpr) || canvas.height !== Math.round(height * dpr)) {
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
    }
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);

    const from = this.clock.minTime;
    const to = this.clock.maxTime;
    const gap = 1;
    const barWidth = width / BUCKETS;

    for (const entry of this.layers.list()) {
      if (!entry.enabled || entry.state !== 'ready' || !entry.layer.activity) continue;
      const values = entry.layer.activity(from, to, BUCKETS);
      const max = Math.max(...values, 1);
      ctx.fillStyle = entry.layer.color;
      ctx.globalAlpha = 0.55;
      values.forEach((value, i) => {
        if (value <= 0) return;
        const barHeight = Math.max(2, Math.sqrt(value / max) * (height - 2));
        ctx.fillRect(i * barWidth, height - barHeight, Math.max(1, barWidth - gap), barHeight);
      });
    }
    ctx.globalAlpha = 1;
  }
}
