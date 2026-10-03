import {
  AdditiveBlending,
  Mesh,
  PlaneGeometry,
  ShaderMaterial,
  Vector3,
  type PerspectiveCamera,
} from 'three';
import { worldSizeForPixels } from './projection';
import { hexToRgb } from '../core/color';

const VERT = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const FRAG = /* glsl */ `
  uniform vec3 uColor;
  uniform float uTime;
  varying vec2 vUv;
  void main() {
    float d = length(vUv - 0.5) * 2.0;
    float ring = smoothstep(0.62, 0.68, d) * (1.0 - smoothstep(0.74, 0.8, d));
    float pulseR = 0.2 + 0.8 * fract(uTime * 0.8);
    float pulse = smoothstep(0.06, 0.0, abs(d - pulseR)) * (1.0 - fract(uTime * 0.8));
    float a = max(ring, pulse * 0.8);
    gl_FragColor = vec4(uColor * a, a);
  }
`;

/** A ring that hugs the surface at the selected item and keeps a constant on-screen size. */
export class SelectionMarker {
  readonly mesh: Mesh;
  private readonly material: ShaderMaterial;
  private readonly target = new Vector3();
  private active = false;

  constructor(private readonly pixelSize = 46) {
    this.material = new ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      transparent: true,
      depthWrite: false,
      depthTest: true,
      blending: AdditiveBlending,
      uniforms: { uColor: { value: hexToRgb('#ffffff') }, uTime: { value: 0 } },
    });
    this.mesh = new Mesh(new PlaneGeometry(1, 1), this.material);
    this.mesh.visible = false;
    this.mesh.renderOrder = 20;
  }

  set(position: Vector3 | null, color = '#ffffff'): void {
    this.active = position !== null;
    this.mesh.visible = this.active;
    if (position) {
      this.target.copy(position);
      this.material.uniforms.uColor!.value = hexToRgb(color);
    }
  }

  /** Follow a moving target without touching its colour. */
  moveTo(position: Vector3): void {
    this.target.copy(position);
  }

  update(camera: PerspectiveCamera, viewportHeight: number, elapsed: number): void {
    if (!this.active) return;
    const distance = camera.position.distanceTo(this.target);
    const size = worldSizeForPixels(this.pixelSize, distance, camera, viewportHeight);
    this.mesh.position.copy(this.target);
    this.mesh.scale.setScalar(size);
    // Face the camera so the ring never turns edge-on near the horizon.
    this.mesh.quaternion.copy(camera.quaternion);
    this.material.uniforms.uTime!.value = elapsed;
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    this.material.dispose();
  }
}
