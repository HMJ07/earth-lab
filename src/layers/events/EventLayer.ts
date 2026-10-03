import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  DynamicDrawUsage,
  Float32BufferAttribute,
  LineSegments,
  Points,
  ShaderMaterial,
  Vector3,
} from 'three';
import { hexToRgb } from '../../core/color';
import { formatNumber, formatUtcShort } from '../../core/format';
import { latLonToVector3 } from '../../core/geo';
import { http as defaultHttp, type Http } from '../../core/http';
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
import {
  currentPointIndex,
  EVENT_CATEGORIES,
  FALLBACK_CATEGORY,
  fetchEvents,
  type NaturalEvent,
} from './eonet';

const HOUR_MS = 3_600_000;
const SURFACE_RADIUS = 1.004;
/** Closed events linger on the map for this long so short-lived ones stay visible. */
const LINGER_MS = 12 * HOUR_MS;
const OPEN_END_HOURS = 1e9;

const POINT_VERT = /* glsl */ `
  attribute float aStart;
  attribute float aEnd;
  attribute float aSize;
  attribute vec3 aColor;
  uniform float uTime;
  uniform float uPx;
  uniform float uScale;
  varying vec3 vColor;
  varying float vFresh;
  varying float vSeed;
  void main() {
    bool hidden = aSize <= 0.0 || uTime < aStart || uTime > aEnd;
    vColor = aColor;
    vFresh = 1.0 - smoothstep(0.0, 24.0, uTime - aStart);
    vSeed = fract(sin(aStart * 7.123) * 43758.5453);
    gl_PointSize = hidden ? 0.0 : aSize * uPx * uScale;
    gl_Position = hidden
      ? vec4(2.0, 2.0, 2.0, 1.0)
      : projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const POINT_FRAG = /* glsl */ `
  uniform float uElapsed;
  varying vec3 vColor;
  varying float vFresh;
  varying float vSeed;
  void main() {
    float d = length(gl_PointCoord - 0.5) * 2.0;
    if (d > 1.0) discard;

    // A hollow ring with a dot inside, so events read differently from solid quake markers.
    float ring = smoothstep(0.50, 0.56, d) * (1.0 - smoothstep(0.70, 0.76, d));
    float underlay = smoothstep(0.42, 0.50, d) * (1.0 - smoothstep(0.78, 0.88, d));
    float dot = 1.0 - smoothstep(0.14, 0.22, d);
    float halo = pow(1.0 - d, 2.5) * 0.25;

    float t = fract(uElapsed * 0.4 + vSeed);
    float wave = (1.0 - smoothstep(0.0, 0.07, abs(d - mix(0.3, 1.0, t)))) * (1.0 - t) * vFresh;

    float solid = max(ring, dot);
    vec3 color = mix(vColor * 0.15, mix(vColor, vec3(1.0), dot * 0.35), solid);
    float a = max(max(solid, underlay * 0.6), max(halo, wave * 0.9));
    gl_FragColor = vec4(color, a);
  }
`;

const TRACK_VERT = /* glsl */ `
  attribute float aT;
  attribute vec3 aColor;
  uniform float uTime;
  varying vec3 vColor;
  void main() {
    vColor = aColor;
    gl_Position = uTime < aT
      ? vec4(2.0, 2.0, 2.0, 1.0)
      : projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const TRACK_FRAG = /* glsl */ `
  varying vec3 vColor;
  void main() {
    gl_FragColor = vec4(vColor, 0.55);
  }
`;

function eventSize(event: NaturalEvent): number {
  switch (event.category) {
    case 'severeStorms':
      return 12;
    case 'volcanoes':
      return 10;
    case 'wildfires': {
      const acres = event.points.find((p) => p.magnitude !== undefined)?.magnitude ?? 0;
      return 6 + Math.min(5, Math.log10(1 + Math.max(0, acres)) * 1.3);
    }
    default:
      return 8;
  }
}

const categoryInfo = (id: string) => EVENT_CATEGORIES[id] ?? FALLBACK_CATEGORY;

export class EventLayer implements Layer {
  readonly id = 'events';
  readonly label = 'Natural events';
  readonly description =
    'Wildfires, storms, volcanoes and floods tracked by NASA. Storms leave a trail as they move.';
  readonly color = '#ff8a3d';
  readonly timeAware = true;
  readonly movesItems = true;
  readonly attribution = {
    name: 'NASA EONET (Earth Observatory Natural Event Tracker)',
    url: 'https://eonet.gsfc.nasa.gov/',
  };

  private events: NaturalEvent[] = [];
  private indexById = new Map<string, number>();
  private positions = new Float32Array(0);
  private baseSizes = new Float32Array(0);
  private currentIndex = new Int16Array(0);
  private multiPoint: number[] = [];
  private enabledCategories = new Set<string>();
  private categoryCounts = new Map<string, number>();

  private material: ShaderMaterial | null = null;
  private trackMaterial: ShaderMaterial | null = null;
  private points: Points | null = null;
  private tracks: LineSegments | null = null;
  private baseTime = 0;
  private activeCount = 0;
  private currentScale = 1;

  constructor(private readonly http: Http = defaultHttp) {}

  async load(context: LayerContext): Promise<void> {
    this.events = await fetchEvents(this.http);
    this.indexById = new Map(this.events.map((e, i) => [e.id, i]));
    this.baseTime = context.clock.minTime;

    for (const e of this.events) {
      this.categoryCounts.set(e.category, (this.categoryCounts.get(e.category) ?? 0) + 1);
    }
    this.enabledCategories = new Set(this.categoryCounts.keys());

    this.buildPoints(context);
    this.buildTracks(context);
  }

  update(frame: FrameInfo): void {
    if (!this.material || !this.points) return;
    this.currentScale = markerScale(frame.camera.position.length());
    const hours = (frame.time - this.baseTime) / HOUR_MS;

    const u = this.material.uniforms;
    u.uTime!.value = hours;
    u.uElapsed!.value = frame.elapsed;
    u.uScale!.value = this.currentScale;
    this.trackMaterial!.uniforms.uTime!.value = hours;

    // Storms move: only events with several recorded positions need their marker re-placed.
    let moved = false;
    for (const i of this.multiPoint) {
      const idx = Math.max(0, currentPointIndex(this.events[i]!, frame.time));
      if (idx === this.currentIndex[i]) continue;
      this.currentIndex[i] = idx;
      this.placeMarker(i, idx);
      moved = true;
    }
    if (moved) this.points.geometry.getAttribute('position').needsUpdate = true;

    let active = 0;
    for (let i = 0; i < this.events.length; i++) {
      if (this.isActive(i, frame.time)) active++;
    }
    this.activeCount = active;
  }

  pick(query: PickQuery): PickResult | null {
    const hit = pickNearest(
      this.positions,
      this.events.length,
      query,
      (i) => this.isActive(i, query.time),
      (i) => Math.max(query.radiusPx * 0.6, (this.baseSizes[i]! * this.currentScale) / 2 + 4),
    );
    return hit ? this.describeEvent(hit.index, query.time, hit.distancePx) : null;
  }

  describe(id: string, time: number): PickResult | null {
    const i = this.indexById.get(id);
    return i === undefined ? null : this.describeEvent(i, time, 0);
  }

  status(): string {
    return this.events.length
      ? `${formatNumber(this.activeCount)} active of ${formatNumber(this.events.length)}`
      : '';
  }

  controls(): LayerControl[] {
    return [...this.categoryCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([category, count]) => {
        const info = categoryInfo(category);
        return {
          kind: 'toggle' as const,
          id: category,
          label: info.label,
          hint: formatNumber(count),
          color: info.color,
          value: this.enabledCategories.has(category),
          onChange: (on: boolean) => this.setCategory(category, on),
        };
      });
  }

  activity(from: number, to: number, buckets: number): number[] {
    const out = new Array<number>(buckets).fill(0);
    const span = to - from;
    for (const e of this.events) {
      if (e.start < from || e.start > to || !this.enabledCategories.has(e.category)) continue;
      out[Math.min(buckets - 1, Math.floor(((e.start - from) / span) * buckets))]! += 1;
    }
    return out;
  }

  dispose(): void {
    for (const object of [this.points, this.tracks]) {
      object?.geometry.dispose();
      object?.removeFromParent();
    }
    this.material?.dispose();
    this.trackMaterial?.dispose();
    this.points = null;
    this.tracks = null;
    this.events = [];
    this.indexById.clear();
  }

  private buildPoints(context: LayerContext): void {
    const n = this.events.length;
    this.positions = new Float32Array(n * 3);
    this.baseSizes = new Float32Array(n);
    this.currentIndex = new Int16Array(n);
    const sizes = new Float32Array(n);
    const start = new Float32Array(n);
    const end = new Float32Array(n);
    const colors = new Float32Array(n * 3);

    this.events.forEach((e, i) => {
      this.placeMarker(i, 0);
      this.baseSizes[i] = eventSize(e);
      sizes[i] = this.baseSizes[i]!;
      start[i] = (e.start - this.baseTime) / HOUR_MS;
      end[i] =
        e.closed === null ? OPEN_END_HOURS : (e.closed + LINGER_MS - this.baseTime) / HOUR_MS;
      colors.set(hexToRgb(categoryInfo(e.category).color), i * 3);
      if (e.points.length > 1) this.multiPoint.push(i);
    });

    const geometry = new BufferGeometry();
    geometry.setAttribute(
      'position',
      new BufferAttribute(this.positions, 3).setUsage(DynamicDrawUsage),
    );
    geometry.setAttribute('aSize', new BufferAttribute(sizes, 1).setUsage(DynamicDrawUsage));
    geometry.setAttribute('aStart', new BufferAttribute(start, 1));
    geometry.setAttribute('aEnd', new BufferAttribute(end, 1));
    geometry.setAttribute('aColor', new BufferAttribute(colors, 3));

    this.material = new ShaderMaterial({
      vertexShader: POINT_VERT,
      fragmentShader: POINT_FRAG,
      transparent: true,
      depthWrite: false,
      uniforms: {
        uTime: { value: 0 },
        uElapsed: { value: 0 },
        uPx: { value: context.pixelRatio() },
        uScale: { value: 1 },
      },
    });
    this.points = new Points(geometry, this.material);
    this.points.frustumCulled = false;
    this.points.renderOrder = 10;
    context.group.add(this.points);
  }

  /** Storm trails: one segment per consecutive pair of positions, revealed by time on the GPU. */
  private buildTracks(context: LayerContext): void {
    const positions: number[] = [];
    const times: number[] = [];
    const colors: number[] = [];
    const a = new Vector3();
    const b = new Vector3();

    for (const i of this.multiPoint) {
      const event = this.events[i]!;
      const rgb = hexToRgb(categoryInfo(event.category).color);
      for (let k = 0; k < event.points.length - 1; k++) {
        const p0 = event.points[k]!;
        const p1 = event.points[k + 1]!;
        latLonToVector3(p0.lat, p0.lon, SURFACE_RADIUS - 0.001, a);
        latLonToVector3(p1.lat, p1.lon, SURFACE_RADIUS - 0.001, b);
        positions.push(a.x, a.y, a.z, b.x, b.y, b.z);
        const t = (p1.time - this.baseTime) / HOUR_MS;
        times.push(t, t);
        colors.push(...rgb, ...rgb);
      }
    }
    if (positions.length === 0) {
      this.trackMaterial = new ShaderMaterial({
        vertexShader: TRACK_VERT,
        fragmentShader: TRACK_FRAG,
        uniforms: { uTime: { value: 0 } },
      });
      return;
    }

    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
    geometry.setAttribute('aT', new Float32BufferAttribute(times, 1));
    geometry.setAttribute('aColor', new Float32BufferAttribute(colors, 3));

    this.trackMaterial = new ShaderMaterial({
      vertexShader: TRACK_VERT,
      fragmentShader: TRACK_FRAG,
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
      uniforms: { uTime: { value: 0 } },
    });
    this.tracks = new LineSegments(geometry, this.trackMaterial);
    this.tracks.frustumCulled = false;
    this.tracks.renderOrder = 9;
    context.group.add(this.tracks);
  }

  private placeMarker(eventIndex: number, pointIndex: number): void {
    const p = this.events[eventIndex]!.points[pointIndex]!;
    const v = latLonToVector3(p.lat, p.lon, SURFACE_RADIUS);
    this.positions[eventIndex * 3] = v.x;
    this.positions[eventIndex * 3 + 1] = v.y;
    this.positions[eventIndex * 3 + 2] = v.z;
  }

  private setCategory(category: string, on: boolean): void {
    if (on) this.enabledCategories.add(category);
    else this.enabledCategories.delete(category);
    if (!this.points) return;

    const attribute = this.points.geometry.getAttribute('aSize') as BufferAttribute;
    this.events.forEach((e, i) => {
      attribute.setX(i, this.enabledCategories.has(e.category) ? this.baseSizes[i]! : 0);
    });
    attribute.needsUpdate = true;
  }

  private isActive(i: number, time: number): boolean {
    const e = this.events[i]!;
    return (
      this.enabledCategories.has(e.category) &&
      e.start <= time &&
      (e.closed === null || time <= e.closed + LINGER_MS)
    );
  }

  private describeEvent(i: number, time: number, distancePx: number): PickResult {
    const e = this.events[i]!;
    const info = categoryInfo(e.category);
    const idx = Math.max(0, currentPointIndex(e, time));
    const point = e.points[idx]!;

    const rows: PickResult['rows'] = [
      ['Category', info.label],
      ['Status', e.closed === null ? 'Ongoing' : `Closed ${formatUtcShort(e.closed)}`],
      ['Since', formatUtcShort(e.start)],
    ];
    if (point.magnitude !== undefined && point.unit) {
      rows.push([
        e.category === 'wildfires' ? 'Burned area' : 'Intensity',
        `${formatNumber(point.magnitude)} ${point.unit}`,
      ]);
    }
    if (e.points.length > 1) rows.push(['Track', `${idx + 1} of ${e.points.length} positions`]);

    return {
      layerId: this.id,
      id: e.id,
      distancePx,
      title: e.title,
      subtitle: info.label,
      color: info.color,
      lat: point.lat,
      lon: point.lon,
      rows,
      link: e.sourceUrl
        ? { label: 'Source report', href: e.sourceUrl }
        : { label: 'NASA EONET entry', href: e.link },
    };
  }
}
