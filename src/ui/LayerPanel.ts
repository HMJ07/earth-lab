import type { LayerControl } from '../core/Layer';
import type { LayerEntry, LayerManager } from '../core/LayerManager';
import { append, clear, h, icon } from './dom';

export interface GlobeSettingsModel {
  terminator: boolean;
  clouds: boolean;
  autoRotate: boolean;
  onTerminator(value: boolean): void;
  onClouds(value: boolean): void;
  onAutoRotate(value: boolean): void;
}

interface Row {
  root: HTMLElement;
  head: HTMLButtonElement;
  body: HTMLElement;
  status: HTMLElement;
  controls: HTMLElement;
}

/** The left-hand panel: one switch per data layer, its controls, and a few globe settings. */
export class LayerPanel {
  readonly element: HTMLElement;
  private readonly rows = new Map<string, Row>();
  private readonly settingsToggles = new Map<string, HTMLInputElement>();

  constructor(
    private readonly manager: LayerManager,
    private readonly settings: GlobeSettingsModel,
  ) {
    const list = h('div', { class: 'layer-list' });
    this.manager.list().forEach((entry, index) => {
      const row = this.buildRow(entry, index + 1);
      this.rows.set(entry.layer.id, row);
      list.appendChild(row.root);
    });

    this.element = h(
      'aside',
      { class: 'panel layers', 'aria-label': 'Data layers' },
      h('h2', { class: 'panel-title' }, 'Layers'),
      list,
      this.buildSettings(),
    );

    this.manager.changed.on((entry) => this.render(entry));
    this.manager.list().forEach((entry) => this.render(entry));
  }

  /** Cheap periodic refresh of the status lines (counts change as time moves). */
  refresh(): void {
    for (const entry of this.manager.list()) {
      const row = this.rows.get(entry.layer.id)!;
      if (entry.enabled && entry.state === 'ready') row.status.textContent = entry.layer.status();
    }
  }

  syncSettings(): void {
    const values: Record<string, boolean> = {
      terminator: this.settings.terminator,
      clouds: this.settings.clouds,
      autoRotate: this.settings.autoRotate,
    };
    for (const [key, input] of this.settingsToggles) input.checked = values[key] ?? false;
  }

  private buildRow(entry: LayerEntry, shortcut: number): Row {
    const { layer } = entry;
    const head = h(
      'button',
      {
        class: 'layer-head',
        type: 'button',
        role: 'switch',
        'aria-checked': 'false',
        title: `${layer.description} (press ${shortcut})`,
        onclick: () => void this.manager.setEnabled(layer.id, !entry.enabled),
      },
      h('span', { class: 'dot', style: `--c:${layer.color}` }),
      h('span', { class: 'name' }, layer.label),
      layer.timeAware
        ? null
        : h('span', { class: 'tag', title: 'Always shows current conditions' }, 'now'),
      h('span', { class: 'kbd', 'aria-hidden': 'true' }, String(shortcut)),
      h('span', { class: 'switch', 'aria-hidden': 'true' }, h('i')),
    );

    const status = h('div', { class: 'status', role: 'status' });
    const controls = h('div', { class: 'controls' });
    const body = h(
      'div',
      { class: 'layer-body', hidden: true },
      h('p', { class: 'desc' }, layer.description),
      status,
      controls,
      h(
        'a',
        {
          class: 'attribution',
          href: layer.attribution.url,
          target: '_blank',
          rel: 'noopener noreferrer',
        },
        `Data: ${layer.attribution.name}`,
      ),
    );

    const root = h(
      'section',
      { class: 'layer', 'data-id': layer.id, style: `--c:${layer.color}` },
      head,
      body,
    );
    return { root, head, body, status, controls };
  }

  private render(entry: LayerEntry): void {
    const row = this.rows.get(entry.layer.id);
    if (!row) return;

    row.head.setAttribute('aria-checked', String(entry.enabled));
    row.root.classList.toggle('on', entry.enabled);
    row.root.dataset.state = entry.state;
    row.body.hidden = !entry.enabled;
    if (!entry.enabled) return;

    clear(row.status);
    clear(row.controls);
    row.status.classList.remove('error');

    if (entry.state === 'loading') {
      row.status.textContent = 'Loading data…';
    } else if (entry.state === 'error') {
      row.status.classList.add('error');
      append(row.status, [
        h('span', {}, `Couldn't load data. ${entry.error ?? ''}`),
        h(
          'button',
          {
            class: 'link-btn',
            type: 'button',
            onclick: () => void this.manager.retry(entry.layer.id),
          },
          'Retry',
        ),
      ]);
    } else if (entry.state === 'ready') {
      row.status.classList.remove('error');
      row.status.textContent = entry.layer.status();
      const toggles = h('div', { class: 'chips' });
      for (const control of entry.layer.controls?.() ?? []) {
        if (control.kind === 'toggle') toggles.appendChild(this.buildChip(control));
        else row.controls.appendChild(this.buildControl(control));
      }
      if (toggles.childElementCount > 0) row.controls.appendChild(toggles);
    }
  }

  private buildChip(control: Extract<LayerControl, { kind: 'toggle' }>): HTMLElement {
    const input = h('input', { type: 'checkbox', checked: control.value, id: `c-${control.id}` });
    input.checked = control.value;
    input.addEventListener('change', () => control.onChange(input.checked));
    return h(
      'label',
      {
        class: 'chip',
        style: `--c:${control.color ?? 'var(--accent)'}`,
        title: control.hint ?? '',
      },
      input,
      h('span', { class: 'chip-dot' }),
      h('span', { class: 'chip-label' }, control.label),
      control.hint ? h('span', { class: 'chip-hint' }, control.hint) : null,
    );
  }

  private buildControl(control: Exclude<LayerControl, { kind: 'toggle' }>): HTMLElement {
    if (control.kind === 'range') {
      const format = control.format ?? ((v: number) => String(v));
      const output = h('output', {}, format(control.value));
      const input = h('input', {
        type: 'range',
        min: control.min,
        max: control.max,
        step: control.step,
        value: control.value,
        'aria-label': control.label,
      });
      input.addEventListener('input', () => {
        const value = Number(input.value);
        output.textContent = format(value);
        control.onChange(value);
      });
      return h(
        'div',
        { class: 'control' },
        h('div', { class: 'control-head' }, h('span', {}, control.label), output),
        input,
      );
    }

    const group = h('div', { class: 'segmented', role: 'group', 'aria-label': control.label });
    const buttons: HTMLButtonElement[] = control.options.map((option) => {
      const button = h('button', {
        type: 'button',
        class: option.value === control.value ? 'active' : '',
        text: option.label,
      });
      button.addEventListener('click', () => {
        buttons.forEach((b) => b.classList.toggle('active', b === button));
        control.onChange(option.value);
      });
      return button;
    });
    append(group, buttons);
    return h(
      'div',
      { class: 'control' },
      h('div', { class: 'control-head' }, h('span', {}, control.label)),
      group,
    );
  }

  private buildSettings(): HTMLElement {
    const make = (
      key: string,
      label: string,
      hint: string,
      value: boolean,
      onChange: (v: boolean) => void,
    ) => {
      const input = h('input', { type: 'checkbox', id: `s-${key}` });
      input.checked = value;
      input.addEventListener('change', () => onChange(input.checked));
      this.settingsToggles.set(key, input);
      return h(
        'label',
        { class: 'setting', title: hint },
        h('span', {}, label),
        input,
        h('span', { class: 'switch small', 'aria-hidden': 'true' }, h('i')),
      );
    };

    return h(
      'div',
      { class: 'settings' },
      h('h3', { class: 'panel-subtitle' }, 'Globe'),
      make(
        'terminator',
        'Day / night',
        'Shade the night side using the Sun’s real position',
        this.settings.terminator,
        this.settings.onTerminator,
      ),
      make(
        'clouds',
        'Clouds',
        'Decorative cloud cover (not live)',
        this.settings.clouds,
        this.settings.onClouds,
      ),
      make(
        'autoRotate',
        'Auto-rotate',
        'Slowly spin the globe (R)',
        this.settings.autoRotate,
        this.settings.onAutoRotate,
      ),
    );
  }
}

export function layersButton(onClick: () => void): HTMLButtonElement {
  return h(
    'button',
    {
      class: 'icon-btn layers-toggle',
      type: 'button',
      'aria-label': 'Toggle layers panel',
      onclick: onClick,
    },
    icon('layers'),
  );
}
