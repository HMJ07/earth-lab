import type { LayerManager } from '../core/LayerManager';
import { h, icon } from './dom';

const REPO_URL = 'https://github.com/HMJ07/earth-lab';

const SHORTCUTS: Array<[string, string]> = [
  ['Space', 'Play / pause the time machine'],
  ['L', 'Jump back to live'],
  ['1 – 4', 'Toggle layers'],
  ['R', 'Auto-rotate'],
  ['Esc', 'Close details'],
  ['?', 'This window'],
];

export class AboutDialog {
  readonly element: HTMLDialogElement;

  constructor(layers: LayerManager) {
    const sources = layers
      .list()
      .map(({ layer }) =>
        h(
          'li',
          {},
          h(
            'a',
            { href: layer.attribution.url, target: '_blank', rel: 'noopener noreferrer' },
            layer.attribution.name,
          ),
          ` — ${layer.label.toLowerCase()}`,
        ),
      );

    this.element = h(
      'dialog',
      { class: 'about', 'aria-labelledby': 'about-title' },
      h(
        'header',
        {},
        h('h2', { id: 'about-title' }, 'Earth Lab'),
        h(
          'button',
          {
            class: 'icon-btn',
            type: 'button',
            'aria-label': 'Close',
            onclick: () => this.element.close(),
          },
          icon('close'),
        ),
      ),
      h(
        'p',
        {},
        'A living globe of open scientific data. Everything runs in your browser: no accounts, no tracking, no backend.',
      ),
      h('h3', {}, 'Controls'),
      h(
        'dl',
        { class: 'shortcuts' },
        ...SHORTCUTS.flatMap(([key, text]) => [h('dt', {}, h('kbd', {}, key)), h('dd', {}, text)]),
      ),
      h(
        'p',
        { class: 'muted' },
        'Drag to rotate, scroll or pinch to zoom, click a marker for details. Drag the timeline to replay up to 30 days of history.',
      ),
      h('h3', {}, 'Data sources'),
      h('ul', {}, ...sources),
      h(
        'p',
        { class: 'muted' },
        'Imagery: NASA Visible Earth (Blue Marble, Black Marble). Cloud and ocean masks from the three.js examples. ',
        h(
          'a',
          {
            href: `${REPO_URL}/blob/main/CREDITS.md`,
            target: '_blank',
            rel: 'noopener noreferrer',
          },
          'Full credits',
        ),
        '.',
      ),
      h(
        'footer',
        {},
        h(
          'a',
          { class: 'btn', href: REPO_URL, target: '_blank', rel: 'noopener noreferrer' },
          'View on GitHub',
          icon('external'),
        ),
        h('span', { class: 'muted' }, 'MIT licensed'),
      ),
    ) as HTMLDialogElement;

    // Click on the backdrop closes the dialog.
    this.element.addEventListener('click', (event) => {
      if (event.target === this.element) this.element.close();
    });
  }

  toggle(): void {
    if (this.element.open) this.element.close();
    else this.element.showModal();
  }
}
