import { describe, expect, it } from 'vitest';
import {
  formatCoord,
  formatDuration,
  formatNumber,
  formatRelative,
  formatUtcDate,
  formatUtcTime,
} from '../src/core/format';

describe('format', () => {
  it('formats relative times in both directions', () => {
    const now = Date.UTC(2026, 9, 3, 12);
    expect(formatRelative(now - 10_000, now)).toBe('just now');
    expect(formatRelative(now - 5 * 60_000, now)).toBe('5 min ago');
    expect(formatRelative(now - 3 * 3_600_000, now)).toBe('3 h ago');
    expect(formatRelative(now - 5 * 86_400_000, now)).toBe('5 d ago');
    expect(formatRelative(now + 2 * 3_600_000, now)).toBe('in 2 h');
  });

  it('formats coordinates with hemispheres', () => {
    expect(formatCoord(40.4168, -3.7038)).toBe('40.42°N 3.70°W');
    expect(formatCoord(-33.8688, 151.2093)).toBe('33.87°S 151.21°E');
  });

  it('formats numbers with thousands separators', () => {
    expect(formatNumber(1943)).toBe('1,943');
    expect(formatNumber(12.345, 1)).toBe('12.3');
  });

  it('formats durations', () => {
    expect(formatDuration(92.6)).toBe('1 h 33 min');
    expect(formatDuration(45)).toBe('45 min');
  });

  it('formats UTC dates and times independent of the local zone', () => {
    const t = Date.UTC(2026, 9, 3, 18, 5, 9);
    expect(formatUtcDate(t)).toContain('3 Oct 2026');
    expect(formatUtcTime(t)).toBe('18:05:09 UTC');
  });
});
