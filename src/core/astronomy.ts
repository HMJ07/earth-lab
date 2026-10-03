import { Vector3 } from 'three';
import { DEG2RAD, RAD2DEG, latLonToVector3, normalizeLon, type LatLon } from './geo';

const J2000_MS = Date.UTC(2000, 0, 1, 12);
const MS_PER_DAY = 86_400_000;

/**
 * Sub-solar point (where the Sun is directly overhead) for a given instant.
 * Uses the low-precision solar position formulae from the Astronomical Almanac,
 * accurate to ~0.01° — far more than a globe renderer needs.
 */
export function subsolarPoint(timeMs: number): LatLon {
  const d = (timeMs - J2000_MS) / MS_PER_DAY;

  const meanLongitude = 280.46 + 0.9856474 * d;
  const meanAnomaly = (357.528 + 0.9856003 * d) * DEG2RAD;
  const eclipticLongitude =
    (meanLongitude + 1.915 * Math.sin(meanAnomaly) + 0.02 * Math.sin(2 * meanAnomaly)) * DEG2RAD;
  const obliquity = (23.439 - 0.0000004 * d) * DEG2RAD;

  const declination = Math.asin(Math.sin(obliquity) * Math.sin(eclipticLongitude));
  const rightAscension = Math.atan2(
    Math.cos(obliquity) * Math.sin(eclipticLongitude),
    Math.cos(eclipticLongitude),
  );

  const gmst = 280.46061837 + 360.98564736629 * d;
  return {
    lat: declination * RAD2DEG,
    lon: normalizeLon(rightAscension * RAD2DEG - gmst),
  };
}

/** Unit vector from the globe centre towards the Sun. */
export function sunDirection(timeMs: number, target: Vector3 = new Vector3()): Vector3 {
  const { lat, lon } = subsolarPoint(timeMs);
  return latLonToVector3(lat, lon, 1, target);
}

/** Elevation of the Sun above the local horizon in degrees (negative at night). */
export function solarElevation(lat: number, lon: number, timeMs: number): number {
  const sun = sunDirection(timeMs);
  const ground = latLonToVector3(lat, lon);
  return Math.asin(Math.max(-1, Math.min(1, sun.dot(ground)))) * RAD2DEG;
}

export type DaylightPhase = 'day' | 'twilight' | 'night';

export function daylightPhase(lat: number, lon: number, timeMs: number): DaylightPhase {
  const elevation = solarElevation(lat, lon, timeMs);
  if (elevation > 0) return 'day';
  return elevation > -18 ? 'twilight' : 'night';
}
