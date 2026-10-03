import { BufferAttribute, BufferGeometry, Points, ShaderMaterial, Vector3 } from 'three';
import { http as defaultHttp, type Http } from '../../core/http';
import { formatNumber, formatRelative, formatUtcShort } from '../../core/format';
import { latLonToVector3 } from '../../core/geo';
import type {
  FrameInfo,
  Layer,
  LayerContext,
  LayerControl,
  PickQuery,
  PickResult,
} from '../../core/Layer';
import { pickNearest } from '../../scene/pointPicking';
import { markerScale } from '../../scene/scale';
import { fetchQuakes, type Quake } from './usgs';

const HOUR_MS = 3_600_000;
const SURFACE_RADIUS = 1.002;

const VERT = /* glsl */ `
  attribute float aMag;
  attribute float aDepth;
  attribute float aTime;
  uniform float uTime;
  uniform float uPx;
  uniform float uScale;
  uniform float uMinMag;
  varying vec3 vColor;
  varying float vAlpha;
  varying float vPulse;
  varying float vSeed;

  vec3 depthColor(float km) {
    vec3 c0 = vec3(1.00, 0.33, 0.20);
    vec3 c1 = vec3(1.00, 0.68, 0.24);
    vec3 c2 = vec3(0.98, 0.92, 0.45);
    vec3 c3 = vec3(0.35, 0.85, 0.95);
    vec3 c4 = vec3(0.60, 0.48, 1.00);
    vec3 c = mix(c0, c1, smoothstep(0.0, 35.0, km));
    c = mix(c, c2, smoothstep(35.0, 100.0, km));
    c = mix(c, c3, smoothstep(100.0, 250.0, km));
    c = mix(c, c4, smoothstep(250.0, 600.0, km));
    return c;
  }

  void main() {
    float age = uTime - aTime; // hours since the event
    bool hidden = age < 0.0 || aMag < uMinMag;
    float size = 1.7 * exp(0.46 * aMag);

    vColor = depthColor(aDepth);
    vPulse = 1.0 - smoothstep(0.0, 8.0, age);
    vAlpha = mix(1.0, 0.55, smoothstep(24.0, 720.0, age));
    vSeed = fract(sin(aTime * 12.9898) * 43758.5453);

    gl_PointSize = hidden ? 0.0 : size * uPx * uScale;
    gl_Position = hidden
      ? vec4(2.0, 2.0, 2.0, 1.0)
      : projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const FRAG = /* glsl */ `
  uniform float uElapsed;
  varying vec3 vColor;
  varying float vAlpha;
  varying float vPulse;
  varying float vSeed;

  void main() {
    float d = length(gl_PointCoord - 0.5) * 2.0;
    if (d > 1.0) discard;

    float core = 1.0 - smoothstep(0.30, 0.36, d);
    float rim = 1.0 - smoothstep(0.42, 0.5, d); // dark outline so markers read on bright imagery
    float glow = pow(1.0 - d, 2.2) * 0.42;

    // Fresh events send out an expanding ring so you can spot them as they happen.
    float t = fract(uElapsed * 0.5 + vSeed);
    float ring = (1.0 - smoothstep(0.0, 0.08, abs(d - mix(0.45, 1.0, t)))) * (1.0 - t) * vPulse;

    vec3 color = vColor;
    color = mix(color, vColor * 0.16, rim * (1.0 - core));
    color = mix(color, mix(vColor, vec3(1.0), 0.28), core);

    float a = max(max(glow, ring * 0.9), max(rim * 0.72, core));
    gl_FragColor = vec4(color, a * vAlpha);
  }
`;

export const quakeSizePx = (mag: number): number => 1.7 * Math.exp(0.46 * mag);

export class EarthquakeLayer implements Layer {
  readonly id = 'quakes';
  readonly label = 'Earthquakes';
  readonly description =
    'Every M2.5+ earthquake of the last 30 days. Colour = depth, size = magnitude.';
  readonly color = '#ff7a45';
  readonly timeAware = true;
  readonly attribution = {
    name: 'USGS Earthquake Hazards Program',
    url: 'https://earthquake.usgs.gov/',
  };

  private quakes: Quake[] = [];
  private byId = new Map<string, Quake>();
  private positions = new Float32Array(0);
  private material: ShaderMaterial | null = null;
  private points: Points | null = null;
  private baseTime = 0;
  private minMag = 2.5;
  private visibleCount = 0;
  private currentScale = 1;

  constructor(private readonly http: Http = defaultHttp) {}

  async load(context: LayerContext): Promise<void> {
    this.quakes = await fetchQuakes(this.http);
    this.byId = new Map(this.quakes.map((q) => [q.id, q]));
    this.baseTime = context.clock.minTime;

    const n = this.quakes.length;
    this.positions = new Float32Array(n * 3);
    const mag = new Float32Array(n);
    const depth = new Float32Array(n);
    const time = new Float32Array(n);
    const v = new Vector3();

    this.quakes.forEach((q, i) => {
      latLonToVector3(q.lat, q.lon, SURFACE_RADIUS, v);
      this.positions.set([v.x, v.y, v.z], i * 3);
      mag[i] = q.mag;
      depth[i] = q.depthKm;
      time[i] = (q.time - this.baseTime) / HOUR_MS;
    });

    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new BufferAttribute(this.positions, 3));
    geometry.setAttribute('aMag', new BufferAttribute(mag, 1));
    geometry.setAttribute('aDepth', new BufferAttribute(depth, 1));
    geometry.setAttribute('aTime', new BufferAttribute(time, 1));

    this.material = new ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      transparent: true,
      depthWrite: false,
      uniforms: {
        uTime: { value: 0 },
        uElapsed: { value: 0 },
        uPx: { value: context.pixelRatio() },
        uScale: { value: 1 },
        uMinMag: { value: this.minMag },
      },
    });

    this.points = new Points(geometry, this.material);
    this.points.frustumCulled = false;
    this.points.renderOrder = 10;
    context.group.add(this.points);
  }

  update(frame: FrameInfo): void {
    if (!this.material) return;
    this.currentScale = markerScale(frame.camera.position.length());

    const u = this.material.uniforms;
    u.uTime!.value = (frame.time - this.baseTime) / HOUR_MS;
    u.uElapsed!.value = frame.elapsed;
    u.uScale!.value = this.currentScale;
    this.visibleCount = this.countVisible(frame.time);
  }

  pick(query: PickQuery): PickResult | null {
    const hit = pickNearest(
      this.positions,
      this.quakes.length,
      query,
      (i) => this.isVisible(this.quakes[i]!, query.time),
      (i) =>
        Math.max(
          query.radiusPx * 0.6,
          (quakeSizePx(this.quakes[i]!.mag) * this.currentScale) / 2 + 3,
        ),
    );
    if (!hit) return null;
    return this.describeQuake(this.quakes[hit.index]!, query.time, hit.distancePx);
  }

  describe(id: string, time: number): PickResult | null {
    const quake = this.byId.get(id);
    return quake ? this.describeQuake(quake, time, 0) : null;
  }

  status(): string {
    return this.quakes.length
      ? `${formatNumber(this.visibleCount)} of ${formatNumber(this.quakes.length)} shown`
      : '';
  }

  controls(): LayerControl[] {
    return [
      {
        kind: 'range',
        id: 'minMag',
        label: 'Minimum magnitude',
        min: 2.5,
        max: 7,
        step: 0.5,
        value: this.minMag,
        format: (v) => `M${v.toFixed(1)}+`,
        onChange: (v) => {
          this.minMag = v;
          if (this.material) this.material.uniforms.uMinMag!.value = v;
        },
      },
    ];
  }

  /** Weighted event counts per bucket, for the timeline sparkline. */
  activity(from: number, to: number, buckets: number): number[] {
    const out = new Array<number>(buckets).fill(0);
    const span = to - from;
    for (const q of this.quakes) {
      if (q.mag < this.minMag || q.time < from || q.time > to) continue;
      const i = Math.min(buckets - 1, Math.floor(((q.time - from) / span) * buckets));
      out[i]! += Math.pow(10, 0.4 * (q.mag - 2.5));
    }
    return out;
  }

  dispose(): void {
    this.points?.geometry.dispose();
    this.material?.dispose();
    this.points?.removeFromParent();
    this.points = null;
    this.material = null;
    this.quakes = [];
    this.byId.clear();
  }

  private isVisible(q: Quake, time: number): boolean {
    return q.time <= time && q.mag >= this.minMag;
  }

  /** Quakes are sorted by time, so the visible ones are a prefix: binary search the end. */
  private countVisible(time: number): number {
    let lo = 0;
    let hi = this.quakes.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (this.quakes[mid]!.time <= time) lo = mid + 1;
      else hi = mid;
    }
    if (this.minMag <= 2.5) return lo;
    let count = 0;
    for (let i = 0; i < lo; i++) if (this.quakes[i]!.mag >= this.minMag) count++;
    return count;
  }

  private describeQuake(q: Quake, time: number, distancePx: number): PickResult {
    const rows: PickResult['rows'] = [
      ['When', `${formatUtcShort(q.time)} · ${formatRelative(q.time, time)}`],
      ['Depth', `${formatNumber(q.depthKm, 1)} km`],
    ];
    if (q.felt !== null) rows.push(['Felt reports', formatNumber(q.felt)]);
    if (q.tsunami) rows.push(['Tsunami', 'Tsunami message issued']);

    return {
      layerId: this.id,
      id: q.id,
      distancePx,
      title: `M ${q.mag.toFixed(1)} earthquake`,
      subtitle: q.place,
      color: this.color,
      lat: q.lat,
      lon: q.lon,
      rows,
      link: { label: 'USGS event page', href: q.url },
    };
  }
}
