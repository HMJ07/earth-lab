import type { PickResult } from '../core/Layer';
import { formatCoord } from '../core/format';
import { safeHttpUrl } from '../core/safeUrl';
import { clear, h, icon } from './dom';

/** Details panel for the selected item. Rows can be refreshed in place (satellites move). */
export class InfoCard {
  readonly element: HTMLElement;
  private readonly swatch: HTMLElement;
  private readonly title: HTMLElement;
  private readonly subtitle: HTMLElement;
  private readonly rows: HTMLElement;
  private readonly footer: HTMLElement;
  private currentKey = '';

  constructor(
    onClose: () => void,
    private readonly onCenter: () => void,
  ) {
    this.swatch = h('span', { class: 'swatch' });
    this.title = h('h2', { class: 'info-title' });
    this.subtitle = h('p', { class: 'info-sub' });
    this.rows = h('dl', { class: 'info-rows' });
    this.footer = h('div', { class: 'info-footer' });

    this.element = h(
      'aside',
      { class: 'panel info', hidden: true, 'aria-live': 'polite' },
      h(
        'header',
        { class: 'info-head' },
        this.swatch,
        h('div', { class: 'info-heading' }, this.title, this.subtitle),
        h(
          'button',
          { class: 'icon-btn', type: 'button', 'aria-label': 'Close details', onclick: onClose },
          icon('close'),
        ),
      ),
      this.rows,
      this.footer,
    );
  }

  get visible(): boolean {
    return !this.element.hidden;
  }

  show(result: PickResult): void {
    this.element.hidden = false;
    this.element.style.setProperty('--c', result.color);
    this.currentKey = '';
    this.update(result);
  }

  hide(): void {
    this.element.hidden = true;
    this.currentKey = '';
  }

  /** Re-render only when the visible text changed, to keep text selection and focus intact. */
  update(result: PickResult): void {
    const key = JSON.stringify([
      result.id,
      result.title,
      result.subtitle,
      result.rows,
      result.lat.toFixed(2),
      result.lon.toFixed(2),
    ]);
    if (key === this.currentKey) return;
    this.currentKey = key;

    this.title.textContent = result.title;
    this.subtitle.textContent = result.subtitle ?? '';
    this.subtitle.hidden = !result.subtitle;

    clear(this.rows);
    const rows: Array<[string, string]> = [
      ...result.rows,
      ['Position', formatCoord(result.lat, result.lon)],
    ];
    for (const [label, value] of rows) {
      this.rows.append(h('dt', {}, label), h('dd', {}, value));
    }

    clear(this.footer);
    this.footer.append(
      h(
        'button',
        { class: 'btn', type: 'button', onclick: this.onCenter },
        icon('target'),
        'Center',
      ),
    );
    const href = result.link ? safeHttpUrl(result.link.href) : null;
    if (result.link && href) {
      this.footer.append(
        h(
          'a',
          {
            class: 'btn ghost',
            href,
            target: '_blank',
            rel: 'noopener noreferrer',
          },
          result.link.label,
          icon('external'),
        ),
      );
    }
  }
}
