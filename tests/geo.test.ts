import { describe, expect, it } from 'vitest';
import {
  altitudeToRadius,
  angularDistance,
  latLonToVector3,
  normalizeLon,
  vector3ToLatLon,
} from '../src/core/geo';

describe('latLonToVector3', () => {
  it('puts (0°, 0°) on +X, the north pole on +Y and 90°E on -Z', () => {
    const origin = latLonToVector3(0, 0);
    expect(origin.x).toBeCloseTo(1);
    expect(origin.y).toBeCloseTo(0);
    expect(origin.z).toBeCloseTo(0);

    const pole = latLonToVector3(90, 0);
    expect(pole.y).toBeCloseTo(1);

    const east = latLonToVector3(0, 90);
    expect(east.z).toBeCloseTo(-1);
    expect(east.x).toBeCloseTo(0);
  });

  it('respects the radius argument', () => {
    expect(latLonToVector3(33, -47, 2.5).length()).toBeCloseTo(2.5);
  });

  it('round-trips through vector3ToLatLon', () => {
    for (const [lat, lon] of [
      [40.4, -3.7],
      [-33.9, 151.2],
      [64.1, -21.9],
      [0, 179.5],
      [-89, -120],
    ] as const) {
      const back = vector3ToLatLon(latLonToVector3(lat, lon, 1.7));
      expect(back.lat).toBeCloseTo(lat, 6);
      expect(back.lon).toBeCloseTo(lon, 6);
    }
  });
});

describe('normalizeLon', () => {
  it('wraps into [-180, 180)', () => {
    expect(normalizeLon(190)).toBe(-170);
    expect(normalizeLon(-190)).toBe(170);
    expect(normalizeLon(180)).toBe(-180);
    expect(normalizeLon(540)).toBe(-180);
    expect(normalizeLon(12)).toBe(12);
  });
});

describe('angularDistance', () => {
  it('is zero for identical points and π for antipodes', () => {
    expect(angularDistance({ lat: 10, lon: 20 }, { lat: 10, lon: 20 })).toBe(0);
    expect(angularDistance({ lat: 0, lon: 0 }, { lat: 0, lon: 180 })).toBeCloseTo(Math.PI);
  });

  it('measures a quarter turn along the equator', () => {
    expect(angularDistance({ lat: 0, lon: 0 }, { lat: 0, lon: 90 })).toBeCloseTo(Math.PI / 2);
  });
});

describe('altitudeToRadius', () => {
  it('maps surface to 1 and adds altitude relative to Earth radius', () => {
    expect(altitudeToRadius(0)).toBe(1);
    expect(altitudeToRadius(6371)).toBeCloseTo(2);
  });
});
