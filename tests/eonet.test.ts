import { describe, expect, it } from 'vitest';
import { currentPointIndex, geometryCenter, parseEonet } from '../src/layers/events/eonet';

const event = (over: Record<string, unknown> = {}) => ({
  id: 'EONET_1',
  title: 'Test fire',
  link: 'https://eonet/1',
  closed: null,
  categories: [{ id: 'wildfires', title: 'Wildfires' }],
  sources: [{ id: 'IRWIN', url: 'https://src/1' }],
  geometry: [
    {
      date: '2026-09-20T00:00:00Z',
      type: 'Point',
      coordinates: [-120.5, 38.25],
      magnitudeValue: 1200,
      magnitudeUnit: 'acres',
    },
  ],
  ...over,
});

describe('geometryCenter', () => {
  it('returns [lon, lat] for points', () => {
    expect(geometryCenter('Point', [10, 20])).toEqual([10, 20]);
  });

  it('averages polygon vertices', () => {
    const ring = [
      [0, 0],
      [10, 0],
      [10, 10],
      [0, 10],
    ];
    expect(geometryCenter('Polygon', [ring])).toEqual([5, 5]);
  });

  it('rejects anything else', () => {
    expect(geometryCenter('LineString', [[0, 0]])).toBeNull();
    expect(geometryCenter('Point', ['a', 'b'])).toBeNull();
    expect(geometryCenter('Polygon', [[]])).toBeNull();
  });
});

describe('parseEonet', () => {
  it('parses a simple open event', () => {
    const [e] = parseEonet({ events: [event()] });
    expect(e).toMatchObject({
      id: 'EONET_1',
      category: 'wildfires',
      categoryTitle: 'Wildfires',
      sourceUrl: 'https://src/1',
      closed: null,
      start: Date.parse('2026-09-20T00:00:00Z'),
    });
    expect(e!.points[0]).toMatchObject({ lat: 38.25, lon: -120.5, magnitude: 1200, unit: 'acres' });
  });

  it('sorts points by time, parses closed dates and sorts events by start', () => {
    const storm = event({
      id: 'S',
      closed: '2026-09-25T00:00:00Z',
      categories: [{ id: 'severeStorms', title: 'Severe Storms' }],
      geometry: [
        { date: '2026-09-22T00:00:00Z', type: 'Point', coordinates: [2, 2] },
        { date: '2026-09-21T00:00:00Z', type: 'Point', coordinates: [1, 1] },
      ],
    });
    const early = event({
      id: 'E',
      geometry: [{ date: '2026-09-01T00:00:00Z', type: 'Point', coordinates: [0, 0] }],
    });

    const events = parseEonet({ events: [storm, early] });
    expect(events.map((e) => e.id)).toEqual(['E', 'S']);
    expect(events[1]!.points.map((p) => p.lon)).toEqual([1, 2]);
    expect(events[1]!.closed).toBe(Date.parse('2026-09-25T00:00:00Z'));
  });

  it('drops events without a usable category or geometry', () => {
    const events = parseEonet({
      events: [
        event({ id: 'no-geo', geometry: [] }),
        event({ id: 'no-cat', categories: [] }),
        event({ id: 'bad-date', geometry: [{ date: 'nope', type: 'Point', coordinates: [1, 1] }] }),
        event({ id: 'good' }),
      ],
    });
    expect(events.map((e) => e.id)).toEqual(['good']);
  });

  it('throws on an unexpected payload', () => {
    expect(() => parseEonet({})).toThrow(/events/);
  });
});

describe('currentPointIndex', () => {
  const [storm] = parseEonet({
    events: [
      event({
        geometry: [
          { date: '2026-09-21T00:00:00Z', type: 'Point', coordinates: [1, 1] },
          { date: '2026-09-22T00:00:00Z', type: 'Point', coordinates: [2, 2] },
          { date: '2026-09-23T00:00:00Z', type: 'Point', coordinates: [3, 3] },
        ],
      }),
    ],
  });

  it('finds the latest position at or before a time', () => {
    expect(currentPointIndex(storm!, Date.parse('2026-09-20T00:00:00Z'))).toBe(-1);
    expect(currentPointIndex(storm!, Date.parse('2026-09-21T12:00:00Z'))).toBe(0);
    expect(currentPointIndex(storm!, Date.parse('2026-09-22T00:00:00Z'))).toBe(1);
    expect(currentPointIndex(storm!, Date.parse('2027-01-01T00:00:00Z'))).toBe(2);
  });
});
