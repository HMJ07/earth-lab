import { Matrix4, Vector3 } from 'three';
import type { PickQuery } from '../core/Layer';
import { isOccludedByGlobe } from './projection';

export interface NearestHit {
  index: number;
  distancePx: number;
}

const world = new Vector3();
const viewProjection = new Matrix4();

/**
 * Screen-space nearest-neighbour search over a flat xyz array of world positions.
 * Points hidden behind the globe never match.
 *
 * Projection is done inline with the combined view-projection matrix: this runs over ~10k points
 * (Starlink) on every hover, and `Vector3.project` per point was ~10x slower.
 */
export function pickNearest(
  positions: ArrayLike<number>,
  count: number,
  query: PickQuery,
  accept: (index: number) => boolean,
  radiusFor: (index: number) => number = () => query.radiusPx,
): NearestHit | null {
  const { camera, width, height, x: px, y: py } = query;
  const m = viewProjection.multiplyMatrices(
    camera.projectionMatrix,
    camera.matrixWorldInverse,
  ).elements;
  const cameraPosition = camera.position;

  let best: NearestHit | null = null;
  for (let i = 0; i < count; i++) {
    const x = positions[i * 3]!;
    const y = positions[i * 3 + 1]!;
    const z = positions[i * 3 + 2]!;

    const w = m[3]! * x + m[7]! * y + m[11]! * z + m[15]!;
    if (w <= 0) continue; // behind the camera
    const sx = (((m[0]! * x + m[4]! * y + m[8]! * z + m[12]!) / w) * 0.5 + 0.5) * width;
    const sy = (-((m[1]! * x + m[5]! * y + m[9]! * z + m[13]!) / w) * 0.5 + 0.5) * height;

    const dx = sx - px;
    const dy = sy - py;
    const distance = Math.sqrt(dx * dx + dy * dy);
    if (distance > query.radiusPx * 4 || (best && distance >= best.distancePx)) continue;
    if (distance > radiusFor(i) || !accept(i)) continue;

    world.set(x, y, z);
    if (isOccludedByGlobe(world, cameraPosition)) continue;
    best = { index: i, distancePx: distance };
  }
  return best;
}
