import { DEG2RAD, type LatLon } from '../../core/geo';

export interface WindVector {
  /** Eastward component, m/s. */
  u: number;
  /** Northward component, m/s. */
  v: number;
}

/**
 * Converts a meteorological wind report (speed + the direction the wind blows FROM, in degrees
 * clockwise from north) into eastward/northward components.
 */
export function windToUV(speed: number, directionFromDeg: number): WindVector {
  const rad = directionFromDeg * DEG2RAD;
  return { u: -speed * Math.sin(rad), v: -speed * Math.cos(rad) };
}

/**
 * A regular lat/lon grid of wind vectors with bilinear interpolation. Longitude wraps around the
 * antimeridian; latitude is clamped to the grid's extent.
 */
export class WindField {
  readonly rows: number;
  readonly cols: number;
  readonly u: Float32Array;
  readonly v: Float32Array;

  constructor(
    readonly step: number,
    readonly latMin: number,
    readonly latMax: number,
  ) {
    this.rows = Math.round((latMax - latMin) / step) + 1;
    this.cols = Math.round(360 / step);
    this.u = new Float32Array(this.rows * this.cols);
    this.v = new Float32Array(this.rows * this.cols);
  }

  /** Coordinates in row-major order (south to north, then west to east from -180°). */
  coordinates(): LatLon[] {
    const out: LatLon[] = [];
    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        out.push({ lat: this.latMin + r * this.step, lon: -180 + c * this.step });
      }
    }
    return out;
  }

  set(index: number, vector: WindVector): void {
    this.u[index] = vector.u;
    this.v[index] = vector.v;
  }

  sample(lat: number, lon: number, out: WindVector = { u: 0, v: 0 }): WindVector {
    const fy = Math.min(this.rows - 1, Math.max(0, (lat - this.latMin) / this.step));
    const r0 = Math.floor(fy);
    const r1 = Math.min(this.rows - 1, r0 + 1);
    const ty = fy - r0;

    const fx = ((((lon + 180) / this.step) % this.cols) + this.cols) % this.cols;
    const c0 = Math.floor(fx) % this.cols;
    const c1 = (c0 + 1) % this.cols;
    const tx = fx - Math.floor(fx);

    const i00 = r0 * this.cols + c0;
    const i01 = r0 * this.cols + c1;
    const i10 = r1 * this.cols + c0;
    const i11 = r1 * this.cols + c1;

    const bilinear = (a: Float32Array): number =>
      (a[i00]! * (1 - tx) + a[i01]! * tx) * (1 - ty) + (a[i10]! * (1 - tx) + a[i11]! * tx) * ty;

    out.u = bilinear(this.u);
    out.v = bilinear(this.v);
    return out;
  }
}

const COMPASS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'] as const;

/** Inverse of {@link windToUV}: speed and the meteorological "wind from" direction. */
export function windFromUV(vector: WindVector): {
  speed: number;
  directionFromDeg: number;
  compass: (typeof COMPASS)[number];
} {
  const speed = Math.hypot(vector.u, vector.v);
  const directionFromDeg = (Math.atan2(-vector.u, -vector.v) / DEG2RAD + 360) % 360;
  const compass = COMPASS[Math.round(directionFromDeg / 45) % 8]!;
  return { speed, directionFromDeg, compass };
}
