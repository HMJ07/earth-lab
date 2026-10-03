import {
  degreesLat,
  degreesLong,
  eciToGeodetic,
  gstime,
  propagate,
  twoline2satrec,
  type SatRec,
} from 'satellite.js';

export interface OrbitState {
  lat: number;
  lon: number;
  altKm: number;
  /** Speed relative to the inertial frame, km/s. */
  speedKmS: number;
}

export function createSatrec(line1: string, line2: string): SatRec | null {
  try {
    const satrec = twoline2satrec(line1, line2);
    // The parser does not reject garbage: it happily returns NaN fields with error === 0.
    const sane = Number.isFinite(satrec.no) && satrec.no > 0 && Number.isFinite(satrec.inclo);
    return satrec.error === 0 && sane ? satrec : null;
  } catch {
    return null;
  }
}

/** SGP4 propagation to geodetic coordinates. Returns null when the model fails (decayed, etc.). */
export function stateAt(satrec: SatRec, date: Date): OrbitState | null {
  const result = propagate(satrec, date);
  if (!result) return null;
  const { position, velocity } = result;
  if (
    !Number.isFinite(position.x) ||
    !Number.isFinite(position.y) ||
    !Number.isFinite(position.z)
  ) {
    return null;
  }
  const geodetic = eciToGeodetic(position, gstime(date));
  return {
    lat: degreesLat(geodetic.latitude),
    lon: degreesLong(geodetic.longitude),
    altKm: geodetic.height,
    speedKmS: Math.hypot(velocity.x, velocity.y, velocity.z),
  };
}

/** Orbital period in minutes from mean motion (revolutions per day). */
export const periodMinutes = (meanMotionRevPerDay: number): number => 1440 / meanMotionRevPerDay;
