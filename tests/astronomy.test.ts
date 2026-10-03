import { describe, expect, it } from 'vitest';
import { daylightPhase, solarElevation, subsolarPoint } from '../src/core/astronomy';

describe('subsolarPoint', () => {
  it('has the Sun over the Tropic of Cancer at the June solstice', () => {
    const { lat } = subsolarPoint(Date.UTC(2026, 5, 21, 8, 24));
    expect(lat).toBeGreaterThan(23.3);
    expect(lat).toBeLessThan(23.5);
  });

  it('has the Sun over the Tropic of Capricorn at the December solstice', () => {
    const { lat } = subsolarPoint(Date.UTC(2026, 11, 21, 20, 50));
    expect(lat).toBeLessThan(-23.3);
    expect(lat).toBeGreaterThan(-23.5);
  });

  it('is on the equator at the March equinox', () => {
    expect(Math.abs(subsolarPoint(Date.UTC(2026, 2, 20, 14, 46)).lat)).toBeLessThan(0.3);
  });

  it('is near the Greenwich meridian at 12:00 UTC (within the equation of time)', () => {
    for (const month of [0, 3, 6, 9]) {
      expect(Math.abs(subsolarPoint(Date.UTC(2026, month, 15, 12)).lon)).toBeLessThan(5);
    }
  });

  it('moves 15° west per hour', () => {
    const a = subsolarPoint(Date.UTC(2026, 3, 1, 10)).lon;
    const b = subsolarPoint(Date.UTC(2026, 3, 1, 11)).lon;
    expect(a - b).toBeCloseTo(15, 0);
  });
});

describe('solarElevation / daylightPhase', () => {
  const t = Date.UTC(2026, 9, 3, 18, 0);
  const sun = subsolarPoint(t);

  it('is ~90° under the Sun and ~-90° on the opposite side', () => {
    expect(solarElevation(sun.lat, sun.lon, t)).toBeGreaterThan(89.9);
    expect(solarElevation(-sun.lat, sun.lon + 180, t)).toBeLessThan(-89.9);
  });

  it('classifies day, twilight and night', () => {
    expect(daylightPhase(sun.lat, sun.lon, t)).toBe('day');
    expect(daylightPhase(-sun.lat, sun.lon + 180, t)).toBe('night');
    // 100° of arc from the sub-solar point along the equator-ish: elevation about -10°.
    expect(daylightPhase(sun.lat, sun.lon + 100, t)).toBe('twilight');
  });
});
