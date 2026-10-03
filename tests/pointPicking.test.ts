import { PerspectiveCamera } from 'three';
import { describe, expect, it } from 'vitest';
import type { PickQuery } from '../src/core/Layer';
import { pickNearest } from '../src/scene/pointPicking';

function setup() {
  const camera = new PerspectiveCamera(40, 1, 0.01, 100);
  camera.position.set(0, 0, 3);
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld();
  const query: PickQuery = {
    x: 400,
    y: 400,
    width: 800,
    height: 800,
    camera,
    radiusPx: 20,
    time: 0,
  };
  return { camera, query };
}

describe('pickNearest', () => {
  it('finds the point under the pointer', () => {
    const { query } = setup();
    const positions = [0, 0, 1.002, /* near centre */ 0.3, 0, 0.95];
    expect(pickNearest(positions, 2, query, () => true)).toMatchObject({ index: 0 });
  });

  it('prefers the closest of several candidates', () => {
    const { query } = setup();
    // Two points on the near hemisphere, the second a few pixels off-centre.
    const positions = [0.02, 0, 1.0, 0.004, 0, 1.0];
    expect(pickNearest(positions, 2, query, () => true)?.index).toBe(1);
  });

  it('ignores points hidden behind the globe', () => {
    const { query } = setup();
    expect(pickNearest([0, 0, -1.002], 1, query, () => true)).toBeNull();
  });

  it('ignores points outside the radius or rejected by the filter', () => {
    const { query } = setup();
    expect(pickNearest([0.5, 0, 0.87], 1, query, () => true)).toBeNull();
    expect(pickNearest([0, 0, 1.002], 1, query, () => false)).toBeNull();
  });

  it('honours a per-point radius', () => {
    const { query } = setup();
    const positions = [0.07, 0, 1.0]; // ~25 px away from the pointer
    expect(pickNearest(positions, 1, query, () => true)).toBeNull();
    expect(
      pickNearest(
        positions,
        1,
        query,
        () => true,
        () => 40,
      ),
    ).toMatchObject({ index: 0 });
  });

  it('ignores points behind the camera', () => {
    const { query } = setup();
    expect(pickNearest([0, 0, 10], 1, query, () => true)).toBeNull();
  });
});
