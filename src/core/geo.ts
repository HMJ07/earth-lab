import { Vector3 } from 'three';
import { clamp } from './math';

export const EARTH_RADIUS_KM = 6371;
export const DEG2RAD = Math.PI / 180;
export const RAD2DEG = 180 / Math.PI;

export interface LatLon {
  lat: number;
  lon: number;
}

/**
 * The globe is a unit sphere with +Y at the north pole and longitude 0 on the +X axis,
 * which matches how three.js maps an equirectangular texture onto a `SphereGeometry`.
 */
export function latLonToVector3(
  lat: number,
  lon: number,
  radius = 1,
  target: Vector3 = new Vector3(),
): Vector3 {
  const phi = lat * DEG2RAD;
  const lambda = lon * DEG2RAD;
  const c = Math.cos(phi);
  return target.set(
    radius * c * Math.cos(lambda),
    radius * Math.sin(phi),
    -radius * c * Math.sin(lambda),
  );
}

export function vector3ToLatLon(v: Vector3): LatLon {
  const r = v.length();
  if (r === 0) return { lat: 0, lon: 0 };
  return {
    lat: Math.asin(clamp(v.y / r, -1, 1)) * RAD2DEG,
    lon: Math.atan2(-v.z, v.x) * RAD2DEG,
  };
}

/** Wraps any longitude into [-180, 180). */
export function normalizeLon(lon: number): number {
  return ((((lon + 180) % 360) + 360) % 360) - 180;
}

/** Great-circle angle between two points, in radians (haversine). */
export function angularDistance(a: LatLon, b: LatLon): number {
  const dLat = (b.lat - a.lat) * DEG2RAD;
  const dLon = (b.lon - a.lon) * DEG2RAD;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(a.lat * DEG2RAD) * Math.cos(b.lat * DEG2RAD) * Math.sin(dLon / 2) ** 2;
  return 2 * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Radius (in globe units) of a point `altKm` above the surface. */
export const altitudeToRadius = (altKm: number): number => 1 + altKm / EARTH_RADIUS_KM;
