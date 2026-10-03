import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  DynamicDrawUsage,
  Float32BufferAttribute,
  Group,
  Line,
  LineBasicMaterial,
  Points,
  PointsMaterial,
  ShaderMaterial,
  Vector3,
} from 'three';
import type { SatRec } from 'satellite.js';
import { hexToRgb } from '../../core/color';
import { http as defaultHttp, type Http } from '../../core/http';
import { formatDuration, formatNumber, formatRelative } from '../../core/format';
import { altitudeToRadius, latLonToVector3 } from '../../core/geo';
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
import { fetchTleGroup, SATELLITE_GROUPS, type SatelliteGroup, type TleRecord } from './celestrak';
import { createSatrec, periodMinutes, stateAt } from './orbit';

const VERT = /* glsl */ `
  attribute float aSize;
  attribute vec3 aColor;
  uniform float uPx;
  uniform float uScale;
  varying vec3 vColor;
  void main() {
    vColor = aColor;
    gl_PointSize = aSize * uPx * mix(1.0, uScale, 0.5);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const FRAG = /* glsl */ `
  varying vec3 vColor;
  void main() {
    float d = length(gl_PointCoord - 0.5) * 2.0;
    if (d > 1.0) discard;
    float core = 1.0 - smoothstep(0.34, 0.42, d);
    float rim = 1.0 - smoothstep(0.50, 0.60, d);
    float glow = pow(1.0 - d, 2.0) * 0.4;
    vec3 color = mix(vColor * 0.15, mix(vColor, vec3(1.0), 0.35), core);
    gl_FragColor = vec4(color, max(max(core, rim * 0.7), glow));
  }
`;

interface Satellite {
  id: string;
  record: TleRecord;
  satrec: SatRec;
  group: SatelliteGroup;
}

type GroupStatus = 'idle' | 'loading' | 'ready' | 'error';

/** CPU time (ms) the layer may spend propagating orbits per frame. */
const FRAME_BUDGET_MS = 3;
const PATH_BEFORE_MS = 15 * 60_000;
const PATH_AFTER_MS = 95 * 60_000;
const PATH_STEP_MS = 60_000;
const PATH_REFRESH_MS = 20 * 60_000;
const STALE_TLE_DAYS = 14;

export class SatelliteLayer implements Layer {
  readonly id = 'satellites';
  readonly label = 'Satellites';
  readonly description =
    'Live orbits propagated in your browser with SGP4. Click one to see its path.';
  readonly color = '#ffd166';
  readonly timeAware = true;
  readonly movesItems = true;
  readonly attribution = { name: 'CelesTrak (orbital elements)', url: 'https://celestrak.org/' };

  private context: LayerContext | null = null;
  private readonly enabledGroups = new Set<string>(
    SATELLITE_GROUPS.filter((g) => g.defaultOn).map((g) => g.id),
  );
  private readonly groupData = new Map<string, TleRecord[]>();
  private readonly groupStatus = new Map<string, GroupStatus>();
  private readonly satrecCache = new Map<string, SatRec | null>();

  private sats: Satellite[] = [];
  private indexById = new Map<string, number>();
  private positions = new Float32Array(0);
  private valid = new Uint8Array(0);
  private cursor = 0;

  private material: ShaderMaterial | null = null;
  private points: Points | null = null;
  private pathGroup = new Group();
  private pathLine: Line | null = null;
  private pathBeads: Points | null = null;
  private pathTime = 0;
  private selectedId: string | null = null;
  private currentScale = 1;
  private readonly scratch = new Vector3();

  constructor(private readonly http: Http = defaultHttp) {}

  async load(context: LayerContext): Promise<void> {
    this.context = context;
    this.material = new ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      transparent: true,
      depthWrite: false,
      uniforms: { uPx: { value: context.pixelRatio() }, uScale: { value: 1 } },
    });
    this.pathGroup.renderOrder = 9;
    context.group.add(this.pathGroup);

    await Promise.all([...this.enabledGroups].map((id) => this.ensureGroup(id)));
    const loaded = [...this.enabledGroups].filter((id) => this.groupStatus.get(id) === 'ready');
    if (loaded.length === 0) throw new Error('Could not download orbital data from CelesTrak');
    this.rebuild();
  }

  update(frame: FrameInfo): void {
    if (!this.points || this.sats.length === 0) return;
    this.currentScale = markerScale(frame.camera.position.length());
    this.material!.uniforms.uScale!.value = this.currentScale;

    const date = new Date(frame.time);
    const start = performance.now();
    const total = this.sats.length;
    let processed = 0;
    while (processed < total) {
      this.propagateInto(this.cursor, date);
      this.cursor = (this.cursor + 1) % total;
      processed++;
      if ((processed & 63) === 0 && performance.now() - start > FRAME_BUDGET_MS) break;
    }

    // The selected satellite is always exact, even when the budget skipped it this frame.
    if (this.selectedId) {
      const i = this.indexById.get(this.selectedId);
      if (i !== undefined) this.propagateInto(i, date);
      if (Math.abs(frame.time - this.pathTime) > PATH_REFRESH_MS) this.buildPath(frame.time);
    }
    this.points.geometry.getAttribute('position').needsUpdate = true;
  }

  pick(query: PickQuery): PickResult | null {
    if (!this.points) return null;
    const hit = pickNearest(
      this.positions,
      this.sats.length,
      query,
      (i) => this.valid[i] === 1,
      (i) => Math.max(query.radiusPx * 0.6, this.sats[i]!.group.size / 2 + 4),
    );
    return hit ? this.describeSat(this.sats[hit.index]!, query.time, hit.distancePx) : null;
  }

  describe(id: string, time: number): PickResult | null {
    const index = this.indexById.get(id);
    return index === undefined ? null : this.describeSat(this.sats[index]!, time, 0);
  }

  select(id: string | null): void {
    this.selectedId = id;
    if (id && this.context) this.buildPath(this.context.clock.time);
    else this.clearPath();
  }

  status(): string {
    const loading = [...this.groupStatus.entries()].filter(([, s]) => s === 'loading').length;
    const failed = [...this.groupStatus.entries()].filter(([, s]) => s === 'error').length;
    const parts = [`${formatNumber(this.sats.length)} tracked`];
    if (loading) parts.push('loading…');
    if (failed) parts.push(`${failed} group${failed > 1 ? 's' : ''} failed`);
    return parts.join(' · ');
  }

  controls(): LayerControl[] {
    return SATELLITE_GROUPS.map((group) => ({
      kind: 'toggle' as const,
      id: group.id,
      label: group.label,
      hint: group.hint,
      color: group.color,
      value: this.enabledGroups.has(group.id),
      onChange: (on: boolean) => void this.setGroup(group.id, on),
    }));
  }

  dispose(): void {
    this.points?.geometry.dispose();
    this.material?.dispose();
    this.points?.removeFromParent();
    this.clearPath();
    this.pathGroup.removeFromParent();
    this.points = null;
    this.material = null;
    this.sats = [];
  }

  private async setGroup(id: string, on: boolean): Promise<void> {
    if (on) this.enabledGroups.add(id);
    else this.enabledGroups.delete(id);
    if (on) await this.ensureGroup(id);
    this.rebuild();
  }

  private async ensureGroup(id: string): Promise<void> {
    if (this.groupData.has(id)) return;
    this.groupStatus.set(id, 'loading');
    try {
      this.groupData.set(id, await fetchTleGroup(this.http, id));
      this.groupStatus.set(id, 'ready');
    } catch (error) {
      console.warn(`[earth-lab] satellite group "${id}" failed`, error);
      this.groupStatus.set(id, 'error');
    }
  }

  /** Merge all enabled groups (first group wins on duplicates) and rebuild the GPU buffers. */
  private rebuild(): void {
    if (!this.context) return;

    const sats: Satellite[] = [];
    const seen = new Set<string>();
    for (const group of SATELLITE_GROUPS) {
      if (!this.enabledGroups.has(group.id)) continue;
      for (const record of this.groupData.get(group.id) ?? []) {
        if (seen.has(record.noradId)) continue;
        let satrec = this.satrecCache.get(record.noradId);
        if (satrec === undefined) {
          satrec = createSatrec(record.line1, record.line2);
          this.satrecCache.set(record.noradId, satrec);
        }
        if (!satrec) continue;
        seen.add(record.noradId);
        sats.push({ id: record.noradId, record, satrec, group });
      }
    }

    this.sats = sats;
    this.indexById = new Map(sats.map((s, i) => [s.id, i]));
    this.positions = new Float32Array(sats.length * 3);
    this.valid = new Uint8Array(sats.length);
    this.cursor = 0;

    const colors = new Float32Array(sats.length * 3);
    const sizes = new Float32Array(sats.length);
    sats.forEach((s, i) => {
      colors.set(hexToRgb(s.group.color), i * 3);
      sizes[i] = s.group.size;
    });

    const geometry = new BufferGeometry();
    geometry.setAttribute(
      'position',
      new BufferAttribute(this.positions, 3).setUsage(DynamicDrawUsage),
    );
    geometry.setAttribute('aColor', new BufferAttribute(colors, 3));
    geometry.setAttribute('aSize', new BufferAttribute(sizes, 1));

    const previous = this.points;
    this.points = new Points(geometry, this.material!);
    this.points.frustumCulled = false;
    this.points.renderOrder = 11;
    this.context.group.add(this.points);
    if (previous) {
      previous.geometry.dispose();
      previous.removeFromParent();
    }

    // Fill every position once so nothing flashes at the origin.
    const date = new Date(this.context.clock.time);
    for (let i = 0; i < sats.length; i++) this.propagateInto(i, date);

    if (this.selectedId && !this.indexById.has(this.selectedId)) this.clearPath();
  }

  private propagateInto(index: number, date: Date): void {
    const state = stateAt(this.sats[index]!.satrec, date);
    if (!state) {
      this.valid[index] = 0;
      this.positions.fill(0, index * 3, index * 3 + 3);
      return;
    }
    latLonToVector3(state.lat, state.lon, altitudeToRadius(state.altKm), this.scratch);
    this.positions[index * 3] = this.scratch.x;
    this.positions[index * 3 + 1] = this.scratch.y;
    this.positions[index * 3 + 2] = this.scratch.z;
    this.valid[index] = 1;
  }

  private buildPath(centerTime: number): void {
    this.clearPath();
    const index = this.selectedId ? this.indexById.get(this.selectedId) : undefined;
    if (index === undefined) return;

    const { satrec, group } = this.sats[index]!;
    const from = centerTime - PATH_BEFORE_MS;
    const to = centerTime + PATH_AFTER_MS;
    const points: number[] = [];
    const colors: number[] = [];
    const beads: number[] = [];
    const beadColors: number[] = [];
    const [r, g, b] = hexToRgb(group.color);
    const v = new Vector3();

    for (let t = from; t <= to; t += PATH_STEP_MS) {
      const state = stateAt(satrec, new Date(t));
      if (!state) continue;
      latLonToVector3(state.lat, state.lon, altitudeToRadius(state.altKm), v);
      points.push(v.x, v.y, v.z);
      // Brightest at "now", fading towards the past and the far future.
      const ahead = t >= centerTime;
      const fade = ahead
        ? 1 - (t - centerTime) / PATH_AFTER_MS
        : 1 - (centerTime - t) / PATH_BEFORE_MS;
      const level = 0.12 + 0.88 * Math.max(0, fade) ** 1.4;
      colors.push(r * level, g * level, b * level);
      // A bead every five minutes gives the path a sense of scale and direction.
      if (Math.round((t - from) / PATH_STEP_MS) % 5 === 0) {
        beads.push(v.x, v.y, v.z);
        beadColors.push(r * level, g * level, b * level);
      }
    }
    if (points.length < 6) return;

    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new Float32BufferAttribute(points, 3));
    geometry.setAttribute('color', new Float32BufferAttribute(colors, 3));
    this.pathLine = new Line(
      geometry,
      new LineBasicMaterial({
        vertexColors: true,
        transparent: true,
        depthWrite: false,
        blending: AdditiveBlending,
      }),
    );
    this.pathLine.frustumCulled = false;
    this.pathTime = centerTime;
    this.pathGroup.add(this.pathLine);

    const beadGeometry = new BufferGeometry();
    beadGeometry.setAttribute('position', new Float32BufferAttribute(beads, 3));
    beadGeometry.setAttribute('color', new Float32BufferAttribute(beadColors, 3));
    this.pathBeads = new Points(
      beadGeometry,
      new PointsMaterial({
        size: 3.5,
        sizeAttenuation: false,
        vertexColors: true,
        transparent: true,
        depthWrite: false,
      }),
    );
    this.pathBeads.frustumCulled = false;
    this.pathGroup.add(this.pathBeads);
  }

  private clearPath(): void {
    for (const object of [this.pathLine, this.pathBeads]) {
      if (!object) continue;
      object.geometry.dispose();
      (object.material as LineBasicMaterial | PointsMaterial).dispose();
      this.pathGroup.remove(object);
    }
    this.pathLine = null;
    this.pathBeads = null;
  }

  private describeSat(sat: Satellite, time: number, distancePx: number): PickResult | null {
    const state = stateAt(sat.satrec, new Date(time));
    if (!state) return null;

    const { record } = sat;
    const ageDays = Math.abs(time - record.epochMs) / 86_400_000;
    const rows: PickResult['rows'] = [
      ['Altitude', `${formatNumber(state.altKm)} km`],
      ['Speed', `${state.speedKmS.toFixed(2)} km/s (${formatNumber(state.speedKmS * 3600)} km/h)`],
      [
        'Orbit',
        `${formatDuration(periodMinutes(record.meanMotion))} · ${record.inclinationDeg.toFixed(1)}° incl.`,
      ],
      ['Group', sat.group.label],
      ['NORAD ID', record.noradId],
      ['Orbit data', formatRelative(record.epochMs, time)],
    ];
    if (ageDays > STALE_TLE_DAYS) {
      rows.push([
        'Accuracy',
        `Orbit data is ${Math.round(ageDays)} days off — position is approximate`,
      ]);
    }

    return {
      layerId: this.id,
      id: sat.id,
      distancePx,
      title: record.name,
      subtitle: `${sat.group.label} satellite`,
      color: sat.group.color,
      lat: state.lat,
      lon: state.lon,
      altKm: state.altKm,
      rows,
      link: {
        label: 'CelesTrak catalogue entry',
        href: `https://celestrak.org/satcat/tle.php?CATNR=${record.noradId}`,
      },
    };
  }
}
