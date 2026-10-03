import { describe, expect, it } from 'vitest';
import { parseHash, serializeHash } from '../src/core/urlState';

describe('urlState', () => {
  it('parses layers and time', () => {
    expect(parseHash('#layers=quakes,wind&t=1790000000000')).toEqual({
      layers: ['quakes', 'wind'],
      time: 1790000000000,
    });
  });

  it('returns an empty state for an empty or junk hash', () => {
    expect(parseHash('')).toEqual({});
    expect(parseHash('#t=abc')).toEqual({});
    expect(parseHash('#t=-5')).toEqual({});
  });

  it('keeps an explicit empty layer list (everything off)', () => {
    expect(parseHash('#layers=')).toEqual({ layers: [] });
  });

  it('round-trips', () => {
    const state = { layers: ['quakes', 'satellites'], time: 1790000123456 };
    expect(parseHash(serializeHash(state))).toEqual(state);
  });

  it('omits time when live and produces readable commas', () => {
    expect(serializeHash({ layers: ['a', 'b'] })).toBe('#layers=a,b');
    expect(serializeHash({})).toBe('');
  });
});
