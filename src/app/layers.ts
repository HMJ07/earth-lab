import type { Layer } from '../core/Layer';
import { EarthquakeLayer } from '../layers/earthquakes/EarthquakeLayer';
import { EventLayer } from '../layers/events/EventLayer';
import { SatelliteLayer } from '../layers/satellites/SatelliteLayer';
import { WindLayer } from '../layers/wind/WindLayer';

/** Layer registry. Order here is the order in the UI, and decides the 1-9 keyboard shortcuts. */
export function createLayers(): Layer[] {
  return [new EarthquakeLayer(), new SatelliteLayer(), new EventLayer(), new WindLayer()];
}

/** Layers that start enabled when the URL does not say otherwise. */
export const DEFAULT_LAYERS = ['quakes', 'satellites'];
