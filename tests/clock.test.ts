import { beforeEach, describe, expect, it } from 'vitest';
import { DAY_MS, SimClock } from '../src/core/Clock';

describe('SimClock', () => {
  let now = 1_800_000_000_000;
  let clock: SimClock;

  beforeEach(() => {
    now = 1_800_000_000_000;
    clock = new SimClock({ now: () => now });
  });

  it('starts live at the current time with a 30 day window', () => {
    expect(clock.live).toBe(true);
    expect(clock.time).toBe(now);
    expect(clock.minTime).toBe(now - 30 * DAY_MS);
  });

  it('follows the wall clock while live', () => {
    now += 5_000;
    clock.tick(16);
    expect(clock.time).toBe(now);
  });

  it('leaves live mode when the user seeks into the past', () => {
    clock.seek(now - DAY_MS);
    expect(clock.live).toBe(false);
    expect(clock.time).toBe(now - DAY_MS);
  });

  it('advances at the selected speed after seeking', () => {
    clock.seek(now - DAY_MS);
    clock.setSpeed(3_600);
    clock.tick(1_000);
    expect(clock.time).toBe(now - DAY_MS + 3_600_000);
  });

  it('advances in real time at 1x', () => {
    clock.seek(now - DAY_MS);
    clock.tick(2_500);
    expect(clock.time).toBe(now - DAY_MS + 2_500);
  });

  it('snaps back to live when playback reaches the present', () => {
    clock.seek(now - 3_600_000);
    clock.setSpeed(3_600);
    clock.tick(2_000);
    expect(clock.live).toBe(true);
    expect(clock.speed).toBe(1);
    expect(clock.time).toBe(now);
  });

  it('never travels before the window or into the future', () => {
    clock.seek(now - 100 * DAY_MS);
    expect(clock.time).toBe(clock.minTime);
    clock.seek(now + DAY_MS);
    expect(clock.time).toBe(now);
    expect(clock.live).toBe(true);
  });

  it('treats a seek within one second of now as going live', () => {
    clock.seek(now - 500);
    expect(clock.live).toBe(true);
  });

  it('pauses and resumes', () => {
    clock.seek(now - DAY_MS);
    clock.pause();
    clock.tick(10_000);
    expect(clock.time).toBe(now - DAY_MS);

    clock.toggle();
    expect(clock.playing).toBe(true);
    clock.tick(1_000);
    expect(clock.time).toBe(now - DAY_MS + 1_000);
  });

  it('pausing while live freezes time', () => {
    clock.toggle();
    expect(clock.live).toBe(false);
    const frozen = clock.time;
    now += 10_000;
    clock.tick(16);
    expect(clock.time).toBe(frozen);
  });

  it('goLive resets speed and playback', () => {
    clock.seek(now - DAY_MS);
    clock.setSpeed(86_400);
    clock.pause();
    clock.goLive();
    expect(clock).toMatchObject({ live: true, playing: true, speed: 1, time: now });
  });

  it('rejects non-positive speeds', () => {
    expect(() => clock.setSpeed(0)).toThrow(RangeError);
    expect(() => clock.setSpeed(-5)).toThrow(RangeError);
  });
});
