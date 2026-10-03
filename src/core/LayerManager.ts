import { Group, type PerspectiveCamera } from 'three';
import type { SimClock } from './Clock';
import { Emitter } from './Emitter';
import type { FrameInfo, Layer, LayerState, PickQuery, PickResult } from './Layer';

export interface LayerEntry {
  layer: Layer;
  group: Group;
  enabled: boolean;
  state: LayerState;
  error?: string;
}

interface ManagerDeps {
  parent: Group;
  clock: SimClock;
  camera: PerspectiveCamera;
  pixelRatio: () => number;
}

/** Owns layer lifecycle: lazy loading on first enable, visibility, picking and per-frame updates. */
export class LayerManager {
  readonly changed = new Emitter<LayerEntry>();
  private readonly entries = new Map<string, LayerEntry>();

  constructor(private readonly deps: ManagerDeps) {}

  register(layer: Layer): void {
    if (this.entries.has(layer.id)) throw new Error(`Duplicate layer id: ${layer.id}`);
    const group = new Group();
    group.name = `layer:${layer.id}`;
    group.visible = false;
    this.deps.parent.add(group);
    this.entries.set(layer.id, { layer, group, enabled: false, state: 'idle' });
  }

  list(): LayerEntry[] {
    return [...this.entries.values()];
  }

  get(id: string): LayerEntry | undefined {
    return this.entries.get(id);
  }

  enabledIds(): string[] {
    return this.list()
      .filter((e) => e.enabled)
      .map((e) => e.layer.id);
  }

  async setEnabled(id: string, enabled: boolean): Promise<void> {
    const entry = this.entries.get(id);
    if (!entry || entry.enabled === enabled) return;

    entry.enabled = enabled;
    entry.group.visible = enabled && entry.state === 'ready';
    entry.layer.setEnabled?.(enabled);
    this.changed.emit(entry);

    if (enabled && (entry.state === 'idle' || entry.state === 'error')) await this.load(entry);
  }

  async retry(id: string): Promise<void> {
    const entry = this.entries.get(id);
    if (entry && entry.enabled) await this.load(entry);
  }

  /** How much the globe imagery should be darkened for the currently active layers. */
  globeDim(): number {
    let dim = 0;
    for (const entry of this.entries.values()) {
      if (entry.enabled && entry.state === 'ready') dim = Math.max(dim, entry.layer.dimsGlobe ?? 0);
    }
    return dim;
  }

  update(frame: FrameInfo): void {
    for (const entry of this.entries.values()) {
      if (entry.enabled && entry.state === 'ready') entry.layer.update(frame);
    }
  }

  /** Closest hit across all visible layers. */
  pick(query: PickQuery): PickResult | null {
    let best: PickResult | null = null;
    for (const entry of this.entries.values()) {
      if (!entry.enabled || entry.state !== 'ready') continue;
      const hit = entry.layer.pick(query);
      if (hit && (!best || hit.distancePx < best.distancePx)) best = hit;
    }
    return best;
  }

  select(result: PickResult | null, previous: PickResult | null): void {
    if (previous && previous.layerId !== result?.layerId) {
      this.entries.get(previous.layerId)?.layer.select?.(null);
    }
    if (result) this.entries.get(result.layerId)?.layer.select?.(result.id);
    else if (previous) this.entries.get(previous.layerId)?.layer.select?.(null);
  }

  dispose(): void {
    for (const entry of this.entries.values()) {
      entry.layer.dispose();
      this.deps.parent.remove(entry.group);
    }
    this.entries.clear();
    this.changed.clear();
  }

  private async load(entry: LayerEntry): Promise<void> {
    entry.state = 'loading';
    entry.error = undefined;
    this.changed.emit(entry);
    try {
      await entry.layer.load({
        group: entry.group,
        clock: this.deps.clock,
        camera: this.deps.camera,
        pixelRatio: this.deps.pixelRatio,
      });
      entry.state = 'ready';
      entry.group.visible = entry.enabled;
    } catch (error) {
      entry.state = 'error';
      entry.error = error instanceof Error ? error.message : String(error);
      console.error(`[earth-lab] layer "${entry.layer.id}" failed to load`, error);
    }
    this.changed.emit(entry);
  }
}
