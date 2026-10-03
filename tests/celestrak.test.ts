import { describe, expect, it } from 'vitest';
import { parseTle, tleEpochMs } from '../src/layers/satellites/celestrak';
import { createSatrec, periodMinutes, stateAt } from '../src/layers/satellites/orbit';

// ISS element set published in the satellite.js documentation (epoch 2019-12-09 16:38 UTC).
const ISS_L1 = '1 25544U 98067A   19343.69339541  .00001764  00000-0  38792-4 0  9996';
const ISS_L2 = '2 25544  51.6439 211.2001 0007417  17.6667  85.6398 15.50103472202482';
const TLE = `ISS (ZARYA)\n${ISS_L1}\n${ISS_L2}\n`;

describe('parseTle', () => {
  it('parses name, ids and orbital parameters', () => {
    const [iss] = parseTle(TLE);
    expect(iss).toMatchObject({
      name: 'ISS (ZARYA)',
      noradId: '25544',
      inclinationDeg: 51.6439,
    });
    expect(iss!.meanMotion).toBeCloseTo(15.50103472, 6);
  });

  it('handles several records, CRLF line endings and numbered names', () => {
    const text = `0 FOO\r\n${ISS_L1}\r\n${ISS_L2}\r\nBAR\r\n${ISS_L1.replace('25544', '99999')}\r\n${ISS_L2.replace('25544', '99999')}\r\n`;
    const records = parseTle(text);
    expect(records.map((r) => r.name)).toEqual(['FOO', 'BAR']);
    expect(records.map((r) => r.noradId)).toEqual(['25544', '99999']);
  });

  it('skips garbage and truncated records', () => {
    expect(parseTle('')).toEqual([]);
    expect(parseTle('<html>Rate limited</html>')).toEqual([]);
    expect(parseTle(`NAME\n${ISS_L1}\n`)).toEqual([]);
  });
});

describe('tleEpochMs', () => {
  it('decodes the two-digit year and fractional day of year', () => {
    const iso = new Date(tleEpochMs(ISS_L1)).toISOString();
    expect(iso.startsWith('2019-12-09T16:38')).toBe(true);
  });
});

describe('orbit propagation', () => {
  const satrec = createSatrec(ISS_L1, ISS_L2)!;

  it('puts the ISS where the ISS should be', () => {
    const state = stateAt(satrec, new Date(tleEpochMs(ISS_L1)))!;
    expect(state.altKm).toBeGreaterThan(380);
    expect(state.altKm).toBeLessThan(450);
    expect(Math.abs(state.lat)).toBeLessThanOrEqual(51.7);
    expect(state.speedKmS).toBeGreaterThan(7.5);
    expect(state.speedKmS).toBeLessThan(7.8);
  });

  it('completes an orbit in about 92.9 minutes', () => {
    expect(periodMinutes(15.50103472)).toBeCloseTo(92.9, 1);
  });

  it('keeps a plausible position a few days after the epoch', () => {
    const state = stateAt(satrec, new Date(tleEpochMs(ISS_L1) + 3 * 86_400_000))!;
    expect(state.altKm).toBeGreaterThan(350);
    expect(state.altKm).toBeLessThan(450);
  });

  it('returns null for a malformed element set', () => {
    expect(createSatrec('1 garbage', '2 garbage')).toBeNull();
  });
});
