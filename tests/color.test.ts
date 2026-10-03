import { describe, expect, it } from 'vitest';
import { hexToRgb } from '../src/core/color';

describe('hexToRgb', () => {
  it('parses 6 and 3 digit hex into 0..1 components', () => {
    expect(hexToRgb('#ff0000')).toEqual([1, 0, 0]);
    expect(hexToRgb('0f0')).toEqual([0, 1, 0]);
    expect(hexToRgb('#808080')[0]).toBeCloseTo(0.502, 3);
  });

  it('rejects malformed colours', () => {
    expect(() => hexToRgb('#12')).toThrow();
    expect(() => hexToRgb('nope')).toThrow();
  });
});
