import { clamp } from '../core/math';

/** Marker size multiplier: markers shrink a little when you zoom in so they do not pile up. */
export const markerScale = (cameraDistance: number): number =>
  clamp(0.55 + (0.45 * (cameraDistance - 1)) / 2.3, 0.5, 1.3);
