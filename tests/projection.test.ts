import { PerspectiveCamera, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { isOccludedByGlobe, projectToScreen, worldSizeForPixels } from '../src/scene/projection';

describe('isOccludedByGlobe', () => {
  const camera = new Vector3(0, 0, 3);

  it('sees points on the near side', () => {
    expect(isOccludedByGlobe(new Vector3(0, 0, 1.002), camera)).toBe(false);
    expect(
      isOccludedByGlobe(new Vector3(0.6, 0.3, 0.75).normalize().multiplyScalar(1.002), camera),
    ).toBe(false);
  });

  it('hides points on the far side', () => {
    expect(isOccludedByGlobe(new Vector3(0, 0, -1.002), camera)).toBe(true);
    expect(
      isOccludedByGlobe(new Vector3(0.2, 0.2, -1).normalize().multiplyScalar(1.002), camera),
    ).toBe(true);
  });

  it('sees a high satellite peeking over the horizon', () => {
    // Behind the globe's limb as seen from the camera, but well above the surface.
    expect(isOccludedByGlobe(new Vector3(0, 2.2, -0.1), camera)).toBe(false);
  });

  it('hides a low object just behind the limb', () => {
    expect(isOccludedByGlobe(new Vector3(0, 0.8, -0.65), camera)).toBe(true);
  });
});

describe('projectToScreen', () => {
  const camera = new PerspectiveCamera(40, 1, 0.01, 100);
  camera.position.set(0, 0, 3);
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld();

  it('maps the origin to the centre of the viewport', () => {
    const p = projectToScreen(new Vector3(0, 0, 0), camera, 800, 600);
    expect(p.x).toBeCloseTo(400);
    expect(p.y).toBeCloseTo(300);
    expect(p.inFront).toBe(true);
  });

  it('flags points behind the camera', () => {
    expect(projectToScreen(new Vector3(0, 0, 10), camera, 800, 600).inFront).toBe(false);
  });
});

describe('worldSizeForPixels', () => {
  it('scales linearly with distance and pixels', () => {
    const camera = new PerspectiveCamera(40);
    const a = worldSizeForPixels(50, 3, camera, 800);
    expect(worldSizeForPixels(100, 3, camera, 800)).toBeCloseTo(a * 2);
    expect(worldSizeForPixels(50, 6, camera, 800)).toBeCloseTo(a * 2);
  });
});
