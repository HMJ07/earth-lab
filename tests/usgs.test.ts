import { describe, expect, it } from 'vitest';
import { parseUsgs } from '../src/layers/earthquakes/usgs';

const feature = (id: string, time: number, mag: number | null, coords: unknown[], extra = {}) => ({
  type: 'Feature',
  id,
  properties: {
    mag,
    place: `Place ${id}`,
    time,
    url: `https://u/${id}`,
    tsunami: 0,
    felt: null,
    ...extra,
  },
  geometry: { type: 'Point', coordinates: coords },
});

describe('parseUsgs', () => {
  it('maps GeoJSON features to quakes sorted by time', () => {
    const quakes = parseUsgs({
      features: [
        feature('b', 2000, 4.5, [10, 20, 33.2], { tsunami: 1, felt: 12 }),
        feature('a', 1000, 2.6, [-100.5, 35.25, 5]),
      ],
    });

    expect(quakes.map((q) => q.id)).toEqual(['a', 'b']);
    expect(quakes[1]).toMatchObject({
      lat: 20,
      lon: 10,
      depthKm: 33.2,
      mag: 4.5,
      tsunami: true,
      felt: 12,
      place: 'Place b',
      url: 'https://u/b',
    });
    expect(quakes[0]).toMatchObject({ tsunami: false, felt: null });
  });

  it('drops malformed rows instead of failing the whole feed', () => {
    const quakes = parseUsgs({
      features: [
        feature('ok', 1, 3, [1, 2, 3]),
        feature('no-mag', 2, null, [1, 2, 3]),
        feature('bad-coords', 3, 3, ['x', 2, 3]),
        feature('out-of-range', 4, 3, [1, 95, 3]),
        { type: 'Feature', properties: null, geometry: null },
      ],
    });
    expect(quakes.map((q) => q.id)).toEqual(['ok']);
  });

  it('clamps negative depths and tolerates a missing depth', () => {
    const [a, b] = parseUsgs({
      features: [feature('a', 1, 3, [0, 0, -1.5]), feature('b', 2, 3, [0, 0])],
    });
    expect(a!.depthKm).toBe(0);
    expect(b!.depthKm).toBe(0);
  });

  it('rejects responses that are not a feed', () => {
    expect(() => parseUsgs({})).toThrow(/features/);
    expect(() => parseUsgs(null)).toThrow();
  });
});
