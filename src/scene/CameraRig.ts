import { Quaternion, type PerspectiveCamera, type Vector3 } from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { clamp, easeInOutCubic } from '../core/math';
import { latLonToVector3 } from '../core/geo';

interface Tween {
  fromDir: Vector3;
  fullRotation: Quaternion;
  fromDistance: number;
  toDistance: number;
  start: number;
  duration: number;
}

export const MIN_DISTANCE = 1.08;
export const MAX_DISTANCE = 9;
export const DEFAULT_DISTANCE = 3.3;

/** Orbit controls tuned for a globe, plus animated "fly to lat/lon". */
export class CameraRig {
  readonly controls: OrbitControls;
  private tween: Tween | null = null;
  private readonly scratch = new Quaternion();
  private readonly identity = new Quaternion();

  constructor(
    private readonly camera: PerspectiveCamera,
    dom: HTMLElement,
  ) {
    this.controls = new OrbitControls(camera, dom);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.enablePan = false;
    this.controls.minDistance = MIN_DISTANCE;
    this.controls.maxDistance = MAX_DISTANCE;
    this.controls.zoomSpeed = 0.7;
    this.controls.autoRotateSpeed = 0.35;
    // A user gesture always wins over an animation in flight.
    this.controls.addEventListener('start', () => {
      this.tween = null;
      this.controls.autoRotate = false;
    });
  }

  get distance(): number {
    return this.camera.position.length();
  }

  get autoRotate(): boolean {
    return this.controls.autoRotate;
  }

  set autoRotate(value: boolean) {
    this.controls.autoRotate = value;
  }

  /** Place the camera instantly. */
  lookAt(lat: number, lon: number, distance = DEFAULT_DISTANCE): void {
    latLonToVector3(lat, lon, distance, this.camera.position);
    this.camera.lookAt(0, 0, 0);
    this.controls.update();
  }

  flyTo(lat: number, lon: number, distance?: number, durationMs = 1300): void {
    const fromDir = this.camera.position.clone().normalize();
    const toDir = latLonToVector3(lat, lon);
    const fromDistance = this.distance;
    const target = distance ?? Math.min(fromDistance, 2.4);
    this.tween = {
      fromDir,
      fullRotation: new Quaternion().setFromUnitVectors(fromDir, toDir),
      fromDistance,
      toDistance: clamp(target, MIN_DISTANCE + 0.05, MAX_DISTANCE),
      start: performance.now(),
      duration: durationMs,
    };
  }

  update(): void {
    if (this.tween) {
      const { fromDir, fullRotation, fromDistance, toDistance, start, duration } = this.tween;
      const progress = clamp((performance.now() - start) / duration, 0, 1);
      const eased = easeInOutCubic(progress);
      this.scratch.copy(this.identity).slerp(fullRotation, eased);
      this.camera.position
        .copy(fromDir)
        .applyQuaternion(this.scratch)
        .multiplyScalar(fromDistance + (toDistance - fromDistance) * eased);
      if (progress >= 1) this.tween = null;
    }

    // Rotating the same angle moves the surface much less when you are close to it.
    this.controls.rotateSpeed = clamp((this.distance - 1) * 0.3, 0.05, 1);
    this.controls.update();
  }

  dispose(): void {
    this.controls.dispose();
  }
}
