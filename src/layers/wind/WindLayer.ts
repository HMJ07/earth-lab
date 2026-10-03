import { BufferAttribute, BufferGeometry, DynamicDrawUsage, Points, ShaderMaterial } from 'three';
import { formatNumber, formatUtcShort } from '../../core/format';
import { DEG2RAD, RAD2DEG } from '../../core/geo';
import { clamp } from '../../core/math';
import { http as defaultHttp, type Http } from '../../core/http';
import type { FrameInfo, Layer, LayerContext, LayerControl, PickResult } from '../../core/Layer';
import { fetchWindField, GRID_STEP_DEG, LAT_MAX, type WindSnapshot } from './openMeteo';
import { windFromUV, type WindVector } from './windField';

/** Points per particle trail. */
const TRAIL = 36;
/** Simulated seconds of wind travel per real second: 1.25 days/s makes 10 m/s ≈ 10°/s. */
const TIME_SCALE = 108_000;
/** Particles advance in fixed steps so trail length does not depend on the frame rate. */
const STEP = 1 / 60;
const MAX_STEPS_PER_FRAME = 4;
const METERS_PER_DEGREE = 111_320;
const MAX_LAT = LAT_MAX;
const SURFACE_RADIUS = 1.004;

const DENSITIES = [
  { value: '1500', label: 'Light' },
  { value: '4000', label: 'Medium' },
  { value: '9000', label: 'Dense' },
];

const VERT = /* glsl */ `
  attribute float aAlpha;
  attribute float aSpeed;
  uniform float uPx;
  uniform float uZoom;
  varying float vAlpha;
  varying vec3 vColor;

  vec3 ramp(float s) {
    vec3 calm = vec3(0.45, 0.72, 1.00);
    vec3 breeze = vec3(0.65, 0.98, 0.95);
    vec3 strong = vec3(1.00, 0.93, 0.50);
    vec3 storm = vec3(1.00, 0.42, 0.60);
    vec3 c = mix(calm, breeze, smoothstep(2.0, 7.0, s));
    c = mix(c, strong, smoothstep(7.0, 15.0, s));
    return mix(c, storm, smoothstep(15.0, 26.0, s));
  }

  void main() {
    vColor = ramp(aSpeed);
    // Fade particles seen edge-on near the limb: they would otherwise pile into a dotted rim.
    float facing = dot(normalize(position), normalize(cameraPosition - position));
    vAlpha = aAlpha * smoothstep(0.1, 1.5, aSpeed) * smoothstep(0.03, 0.4, facing);
    // Trails thicken towards the head, and everything grows a little as you zoom in.
    gl_PointSize = mix(1.1, 2.7, aAlpha) * uPx * uZoom;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const FRAG = /* glsl */ `
  uniform float uOpacity;
  varying float vAlpha;
  varying vec3 vColor;
  void main() {
    float d = length(gl_PointCoord - 0.5) * 2.0;
    if (d > 1.0) discard;
    gl_FragColor = vec4(vColor, (1.0 - smoothstep(0.35, 1.0, d)) * vAlpha * uOpacity);
  }
`;

export class WindLayer implements Layer {
  readonly id = 'wind';
  readonly label = 'Wind';
  readonly description = `Surface wind as flowing particles, interpolated from a ${GRID_STEP_DEG}° grid. Always shows current conditions.`;
  readonly color = '#4cc9f0';
  readonly timeAware = false;
  readonly dimsGlobe = 0.6;
  readonly attribution = { name: 'Open-Meteo', url: 'https://open-meteo.com/' };

  private snapshot: WindSnapshot | null = null;
  private context: LayerContext | null = null;
  private count = 4000;

  private lat = new Float32Array(0);
  private lon = new Float32Array(0);
  private life = new Float32Array(0);
  private positions = new Float32Array(0);
  private speeds = new Float32Array(0);

  private accumulator = 0;
  private geometry: BufferGeometry | null = null;
  private material: ShaderMaterial | null = null;
  private points: Points | null = null;
  private readonly wind: WindVector = { u: 0, v: 0 };

  constructor(private readonly http: Http = defaultHttp) {}

  async load(context: LayerContext): Promise<void> {
    this.context = context;
    this.snapshot = await fetchWindField(this.http);
    this.material = new ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      transparent: true,
      depthWrite: false,
      uniforms: {
        uOpacity: { value: 1 },
        uPx: { value: context.pixelRatio() },
        uZoom: { value: 1 },
      },
    });
    this.build();
  }

  update(frame: FrameInfo): void {
    if (!this.snapshot || !this.geometry) return;
    this.material!.uniforms.uZoom!.value = clamp(
      1 + (3.3 - frame.camera.position.length()) * 0.7,
      1,
      2.6,
    );
    this.accumulator += Math.min(frame.dt, 0.1);
    const steps = Math.min(MAX_STEPS_PER_FRAME, Math.floor(this.accumulator / STEP));
    // Drop the backlog when the tab was throttled instead of fast-forwarding the wind.
    this.accumulator = Math.min(this.accumulator - steps * STEP, STEP);
    for (let i = 0; i < steps; i++) this.advance(STEP);

    this.geometry.getAttribute('position').needsUpdate = true;
    this.geometry.getAttribute('aSpeed').needsUpdate = true;
  }

  /** Move every particle forward by `dt` real seconds of animation. */
  private advance(dt: number): void {
    const dtSim = dt * TIME_SCALE;
    const field = this.snapshot!.field;

    for (let p = 0; p < this.count; p++) {
      this.life[p] = this.life[p]! - dt;
      field.sample(this.lat[p]!, this.lon[p]!, this.wind);
      const speed = Math.hypot(this.wind.u, this.wind.v);

      const cosLat = Math.max(0.17, Math.cos(this.lat[p]! * DEG2RAD));
      const lat = this.lat[p]! + (this.wind.v * dtSim) / METERS_PER_DEGREE;
      let lon = this.lon[p]! + (this.wind.u * dtSim) / (METERS_PER_DEGREE * cosLat);
      if (lon > 180) lon -= 360;
      else if (lon < -180) lon += 360;

      if (this.life[p]! <= 0 || Math.abs(lat) > MAX_LAT) {
        this.respawn(p);
        continue;
      }
      this.lat[p] = lat;
      this.lon[p] = lon;
      this.pushPoint(p, lat, lon, speed);
    }
  }

  pick(): PickResult | null {
    return null;
  }

  probe(lat: number, lon: number): string | null {
    if (!this.snapshot || Math.abs(lat) > MAX_LAT + 5) return null;
    const { speed, directionFromDeg, compass } = windFromUV(this.snapshot.field.sample(lat, lon));
    return `Wind ${speed.toFixed(1)} m/s from ${compass} (${Math.round(directionFromDeg)}°)`;
  }

  status(): string {
    if (!this.snapshot) return '';
    return `${formatNumber(this.count)} particles · data ${formatUtcShort(this.snapshot.fetchedAt)}`;
  }

  controls(): LayerControl[] {
    return [
      {
        kind: 'select',
        id: 'density',
        label: 'Particle density',
        options: DENSITIES,
        value: String(this.count),
        onChange: (value) => {
          this.count = Number(value);
          this.build();
        },
      },
    ];
  }

  dispose(): void {
    this.disposeGeometry();
    this.material?.dispose();
    this.material = null;
    this.snapshot = null;
  }

  private build(): void {
    if (!this.context || !this.material) return;
    this.disposeGeometry();

    const n = this.count;
    this.lat = new Float32Array(n);
    this.lon = new Float32Array(n);
    this.life = new Float32Array(n);
    this.positions = new Float32Array(n * TRAIL * 3);
    this.speeds = new Float32Array(n * TRAIL);

    const alpha = new Float32Array(n * TRAIL);
    for (let p = 0; p < n; p++) {
      for (let k = 0; k < TRAIL; k++) alpha[p * TRAIL + k] = Math.pow(k / (TRAIL - 1), 1.5);
      this.respawn(p);
      // Stagger lifetimes so particles do not all die on the same frame.
      this.life[p] = this.life[p]! * Math.random();
    }

    const geometry = new BufferGeometry();
    geometry.setAttribute(
      'position',
      new BufferAttribute(this.positions, 3).setUsage(DynamicDrawUsage),
    );
    geometry.setAttribute('aSpeed', new BufferAttribute(this.speeds, 1).setUsage(DynamicDrawUsage));
    geometry.setAttribute('aAlpha', new BufferAttribute(alpha, 1));

    this.geometry = geometry;
    this.points = new Points(geometry, this.material);
    this.points.frustumCulled = false;
    this.points.renderOrder = 8;
    this.context.group.add(this.points);
  }

  private respawn(p: number): void {
    // Uniform on the sphere between -MAX_LAT and +MAX_LAT.
    const sinMax = Math.sin(MAX_LAT * DEG2RAD);
    const lat = Math.asin((Math.random() * 2 - 1) * sinMax) * RAD2DEG;
    const lon = Math.random() * 360 - 180;
    this.lat[p] = lat;
    this.lon[p] = lon;
    this.life[p] = 2 + Math.random() * 4;

    const speed = this.snapshot ? Math.hypot(...this.sampleUV(lat, lon)) : 0;
    // Fill the whole trail with the spawn point: the particle starts as a single dot and
    // stretches into a streak instead of popping into view.
    for (let k = 0; k < TRAIL; k++) this.writePoint(p, k, lat, lon, speed);
  }

  private sampleUV(lat: number, lon: number): [number, number] {
    this.snapshot!.field.sample(lat, lon, this.wind);
    return [this.wind.u, this.wind.v];
  }

  /** Shift the trail one slot towards the past and append the new head. */
  private pushPoint(p: number, lat: number, lon: number, speed: number): void {
    const base = p * TRAIL * 3;
    this.positions.copyWithin(base, base + 3, base + TRAIL * 3);
    const sBase = p * TRAIL;
    this.speeds.copyWithin(sBase, sBase + 1, sBase + TRAIL);
    this.writePoint(p, TRAIL - 1, lat, lon, speed);
  }

  private writePoint(p: number, k: number, lat: number, lon: number, speed: number): void {
    const phi = lat * DEG2RAD;
    const lambda = lon * DEG2RAD;
    const c = Math.cos(phi) * SURFACE_RADIUS;
    const i = (p * TRAIL + k) * 3;
    this.positions[i] = c * Math.cos(lambda);
    this.positions[i + 1] = Math.sin(phi) * SURFACE_RADIUS;
    this.positions[i + 2] = -c * Math.sin(lambda);
    this.speeds[p * TRAIL + k] = speed;
  }

  private disposeGeometry(): void {
    this.geometry?.dispose();
    this.points?.removeFromParent();
    this.geometry = null;
    this.points = null;
  }
}
