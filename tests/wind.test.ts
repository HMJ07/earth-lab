import { describe, expect, it } from 'vitest';
import { buildUrl, parseWindResponse } from '../src/layers/wind/openMeteo';
import { WindField, windFromUV, windToUV } from '../src/layers/wind/windField';

describe('windToUV', () => {
  it('converts "wind from" directions into flow vectors', () => {
    const north = windToUV(10, 0); // blowing from the north → towards the south
    expect(north.u).toBeCloseTo(0);
    expect(north.v).toBeCloseTo(-10);

    const east = windToUV(10, 90); // from the east → towards the west
    expect(east.u).toBeCloseTo(-10);
    expect(east.v).toBeCloseTo(0);

    const southwest = windToUV(10, 225); // from the SW → towards the NE
    expect(southwest.u).toBeGreaterThan(0);
    expect(southwest.v).toBeGreaterThan(0);
  });

  it('round-trips through windFromUV', () => {
    for (const [speed, dir] of [
      [5, 10],
      [12, 135],
      [20, 270],
      [3, 359],
    ] as const) {
      const back = windFromUV(windToUV(speed, dir));
      expect(back.speed).toBeCloseTo(speed);
      expect(back.directionFromDeg).toBeCloseTo(dir);
    }
    expect(windFromUV(windToUV(8, 225)).compass).toBe('SW');
    expect(windFromUV(windToUV(8, 355)).compass).toBe('N');
  });
});

describe('WindField', () => {
  const make = () => new WindField(15, -75, 75);

  it('has the expected grid shape and coordinate order', () => {
    const field = make();
    expect(field.rows).toBe(11);
    expect(field.cols).toBe(24);
    const coords = field.coordinates();
    expect(coords).toHaveLength(264);
    expect(coords[0]).toEqual({ lat: -75, lon: -180 });
    expect(coords[1]).toEqual({ lat: -75, lon: -165 });
    expect(coords[24]).toEqual({ lat: -60, lon: -180 });
    expect(coords.at(-1)).toEqual({ lat: 75, lon: 165 });
  });

  it('interpolates bilinearly', () => {
    const field = make();
    field.set(0, { u: 0, v: 0 });
    field.set(1, { u: 10, v: -4 });
    const mid = field.sample(-75, -172.5);
    expect(mid.u).toBeCloseTo(5);
    expect(mid.v).toBeCloseTo(-2);
  });

  it('wraps longitude across the antimeridian', () => {
    const field = make();
    field.set(23, { u: 20, v: 0 }); // lon 165
    field.set(0, { u: 0, v: 0 }); // lon -180 ≡ 180
    expect(field.sample(-75, 172.5).u).toBeCloseTo(10);
    expect(field.sample(-75, -187.5).u).toBeCloseTo(10);
  });

  it('clamps latitude to the grid', () => {
    const field = make();
    const last = (field.rows - 1) * field.cols;
    field.set(last, { u: 7, v: 1 });
    expect(field.sample(89, -180).u).toBeCloseTo(7);
    expect(field.sample(75, -180).u).toBeCloseTo(7);
  });

  it('reuses the output object when given one', () => {
    const out = { u: 99, v: 99 };
    expect(make().sample(0, 0, out)).toBe(out);
    expect(out).toEqual({ u: 0, v: 0 });
  });
});

describe('Open-Meteo helpers', () => {
  it('builds a multi-location URL', () => {
    const url = buildUrl([
      { lat: 10, lon: 20 },
      { lat: -30, lon: 40 },
    ]);
    expect(url).toContain('latitude=10,-30');
    expect(url).toContain('longitude=20,40');
    expect(url).toContain('wind_speed_unit=ms');
  });

  const block = (speed: number, dir: number) => ({
    current: { wind_speed_10m: speed, wind_direction_10m: dir },
  });

  it('parses an array response', () => {
    const [a, b] = parseWindResponse([block(10, 0), block(5, 90)], 2);
    expect(a!.v).toBeCloseTo(-10);
    expect(b!.u).toBeCloseTo(-5);
  });

  it('parses the single-object response of one location', () => {
    expect(parseWindResponse(block(3, 180), 1)).toHaveLength(1);
  });

  it('treats missing values as calm and rejects a wrong count', () => {
    expect(parseWindResponse([{ current: {} }], 1)).toEqual([{ u: 0, v: 0 }]);
    expect(() => parseWindResponse([block(1, 1)], 2)).toThrow(/expected 2/);
  });
});
