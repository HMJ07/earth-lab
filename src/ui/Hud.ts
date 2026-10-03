import { formatCoord } from '../core/format';
import type { DaylightPhase } from '../core/astronomy';
import { h } from './dom';

const PHASE_LABEL: Record<DaylightPhase, string> = {
  day: 'Daylight',
  twilight: 'Twilight',
  night: 'Night',
};

/** Floating read-out under the cursor: coordinates, daylight and any layer probes. */
export class Hud {
  readonly readout: HTMLElement;
  readonly tooltip: HTMLElement;
  private readonly tooltipTitle: HTMLElement;
  private readonly tooltipSub: HTMLElement;

  constructor() {
    this.readout = h('div', { class: 'readout', hidden: true, 'aria-hidden': 'true' });

    this.tooltipTitle = h('strong');
    this.tooltipSub = h('span');
    this.tooltip = h(
      'div',
      { class: 'tooltip', hidden: true, role: 'tooltip' },
      this.tooltipTitle,
      this.tooltipSub,
    );
  }

  setReadout(
    point: { lat: number; lon: number; phase: DaylightPhase; probes: string[] } | null,
  ): void {
    if (!point) {
      this.readout.hidden = true;
      return;
    }
    this.readout.hidden = false;
    const parts = [formatCoord(point.lat, point.lon), PHASE_LABEL[point.phase], ...point.probes];
    this.readout.replaceChildren(
      ...parts.flatMap((text, i) =>
        i === 0 ? [h('span', { text })] : [h('i', { class: 'sep' }), h('span', { text })],
      ),
    );
  }

  setTooltip(
    content: { title: string; subtitle?: string; color: string; x: number; y: number } | null,
  ): void {
    if (!content) {
      this.tooltip.hidden = true;
      return;
    }
    this.tooltip.hidden = false;
    this.tooltip.style.setProperty('--c', content.color);
    this.tooltipTitle.textContent = content.title;
    this.tooltipSub.textContent = content.subtitle ?? '';
    this.tooltipSub.hidden = !content.subtitle;

    const margin = 14;
    const { offsetWidth: w, offsetHeight: ht } = this.tooltip;
    const parent = this.tooltip.parentElement;
    const maxX = (parent?.clientWidth ?? window.innerWidth) - w - 8;
    const maxY = (parent?.clientHeight ?? window.innerHeight) - ht - 8;
    this.tooltip.style.transform = `translate(${Math.max(8, Math.min(maxX, content.x + margin))}px, ${Math.max(8, Math.min(maxY, content.y + margin))}px)`;
  }
}
