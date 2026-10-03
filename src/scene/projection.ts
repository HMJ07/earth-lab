import { Vector3, type PerspectiveCamera } from 'three';

const scratch = new Vector3();

export interface ScreenPoint {
  x: number;
  y: number;
  /** False when the point is behind the camera or outside the depth range. */
  inFront: boolean;
}

/** World position -> CSS pixel position inside a canvas of `width` x `height`. */
export function projectToScreen(
  world: Vector3,
  camera: PerspectiveCamera,
  width: number,
  height: number,
  out: ScreenPoint = { x: 0, y: 0, inFront: false },
): ScreenPoint {
  scratch.copy(world).project(camera);
  out.x = (scratch.x * 0.5 + 0.5) * width;
  out.y = (-scratch.y * 0.5 + 0.5) * height;
  out.inFront = scratch.z > -1 && scratch.z < 1;
  return out;
}

/**
 * True when the unit globe hides `point` from `camera` (segment camera -> point crosses the
 * sphere). Exact for points on or above the surface, not just for the near hemisphere.
 */
export function isOccludedByGlobe(point: Vector3, camera: Vector3): boolean {
  const dx = point.x - camera.x;
  const dy = point.y - camera.y;
  const dz = point.z - camera.z;
  const a = dx * dx + dy * dy + dz * dz;
  const b = 2 * (camera.x * dx + camera.y * dy + camera.z * dz);
  const c = camera.lengthSq() - 1;
  const disc = b * b - 4 * a * c;
  if (disc < 0) return false;
  const t = (-b - Math.sqrt(disc)) / (2 * a);
  return t > 0 && t < 1;
}

/** Size in world units that appears as `pixels` tall at the given distance from the camera. */
export function worldSizeForPixels(
  pixels: number,
  distance: number,
  camera: PerspectiveCamera,
  viewportHeight: number,
): number {
  const fov = (camera.fov * Math.PI) / 180;
  return (2 * Math.tan(fov / 2) * distance * pixels) / viewportHeight;
}
