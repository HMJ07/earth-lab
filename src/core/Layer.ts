import type { Group, PerspectiveCamera } from 'three';
import type { SimClock } from './Clock';

/** What a layer receives once, when it is first enabled. */
export interface LayerContext {
  /** Add your meshes here. The group is toggled on/off for you. */
  group: Group;
  clock: SimClock;
  camera: PerspectiveCamera;
  /** Number of device pixels per CSS pixel the renderer is using. */
  pixelRatio: () => number;
}

/** Per-frame information passed to `update`. */
export interface FrameInfo {
  /** Simulated time, ms since epoch. */
  time: number;
  /** Real seconds since the previous frame. */
  dt: number;
  /** Real seconds since the app started (for purely visual animation). */
  elapsed: number;
  live: boolean;
  camera: PerspectiveCamera;
}

export interface PickQuery {
  /** Pointer position in CSS pixels, relative to the canvas. */
  x: number;
  y: number;
  width: number;
  height: number;
  camera: PerspectiveCamera;
  /** Maximum screen distance (px) at which an item still counts as hit. */
  radiusPx: number;
  time: number;
}

export interface PickResult {
  layerId: string;
  /** Stable id of the item inside its layer. */
  id: string;
  distancePx: number;
  title: string;
  subtitle?: string;
  color: string;
  lat: number;
  lon: number;
  /** Height above the surface in km, for things that fly (satellites). */
  altKm?: number;
  rows: Array<[label: string, value: string]>;
  link?: { label: string; href: string };
}

export type LayerControl =
  | {
      kind: 'range';
      id: string;
      label: string;
      min: number;
      max: number;
      step: number;
      value: number;
      format?: (value: number) => string;
      onChange: (value: number) => void;
    }
  | {
      kind: 'toggle';
      id: string;
      label: string;
      hint?: string;
      color?: string;
      value: boolean;
      onChange: (value: boolean) => void;
    }
  | {
      kind: 'select';
      id: string;
      label: string;
      options: Array<{ value: string; label: string }>;
      value: string;
      onChange: (value: string) => void;
    };

/**
 * A data layer. Implement this interface (see docs/ADDING_A_LAYER.md) and register the
 * class in `src/app/layers.ts` to add a new dataset to the globe.
 */
export interface Layer {
  readonly id: string;
  readonly label: string;
  readonly description: string;
  /** Accent colour used by the UI. */
  readonly color: string;
  /** Whether the layer reacts to the time machine. `false` means "always shows now". */
  readonly timeAware: boolean;
  /** True when selected items move over time (satellites, storms): details refresh every frame. */
  readonly movesItems?: boolean;
  /** 0..1: how much to darken the imagery while this layer is on, for contrast (wind). */
  readonly dimsGlobe?: number;
  readonly attribution: { name: string; url: string };

  /** Fetch data and build scene objects. Called the first time the layer is enabled. */
  load(context: LayerContext): Promise<void>;
  /** Called every frame while the layer is enabled and loaded. */
  update(frame: FrameInfo): void;
  /** Hit-test a screen position. Return the closest item or null. */
  pick(query: PickQuery): PickResult | null;
  /** One-line status shown in the UI, e.g. "1 943 events". */
  status(): string;
  /** Optional extra controls rendered under the layer when it is on. */
  controls?(): LayerControl[];
  /** Optional activity histogram for the timeline: `buckets` values between `from` and `to`. */
  activity?(from: number, to: number, buckets: number): number[];
  /** Called when one of this layer's items becomes (or stops being) the selection. */
  select?(id: string | null): void;
  /** Fresh details for a moving item; the info card re-reads this while it is open. */
  describe?(id: string, time: number): PickResult | null;
  /** A short text for the hover read-out at a geographic point (e.g. wind speed). */
  probe?(lat: number, lon: number, time: number): string | null;
  /** Called when the layer is switched on or off. */
  setEnabled?(enabled: boolean): void;
  dispose(): void;
}

export type LayerState = 'idle' | 'loading' | 'ready' | 'error';
