import {
  PerspectiveCamera,
  Raycaster,
  Scene,
  Sphere,
  Vector2,
  Vector3,
  WebGLRenderer,
} from 'three';
import { daylightPhase } from '../core/astronomy';
import { SimClock } from '../core/Clock';
import { altitudeToRadius, latLonToVector3, vector3ToLatLon } from '../core/geo';
import type { PickResult } from '../core/Layer';
import { LayerManager } from '../core/LayerManager';
import { parseHash, serializeHash } from '../core/urlState';
import { CameraRig, DEFAULT_DISTANCE } from '../scene/CameraRig';
import { Globe } from '../scene/Globe';
import { SelectionMarker } from '../scene/SelectionMarker';
import { createStars } from '../scene/Stars';
import { AboutDialog } from '../ui/AboutDialog';
import { h, icon } from '../ui/dom';
import { Hud } from '../ui/Hud';
import { InfoCard } from '../ui/InfoCard';
import { LayerPanel } from '../ui/LayerPanel';
import { Timeline } from '../ui/Timeline';
import { createLayers, DEFAULT_LAYERS } from './layers';

const SURFACE_MARKER_RADIUS = 1.004;
const HOVER_RADIUS_PX = 18;
const TOUCH_RADIUS_PX = 30;
const CLICK_MAX_MOVE_PX = 6;
const CLICK_MAX_MS = 500;
/** Half the layers panel width: how far the globe is nudged right on wide screens. */
const PANEL_SHIFT_PX = 150;

interface PointerState {
  x: number;
  y: number;
  inside: boolean;
  touch: boolean;
  dragging: boolean;
}

export class App {
  private readonly scene = new Scene();
  private readonly camera = new PerspectiveCamera(40, 1, 0.01, 300);
  private readonly globe = new Globe();
  private readonly clock = new SimClock();
  private readonly marker = new SelectionMarker();
  private readonly raycaster = new Raycaster();
  private readonly unitSphere = new Sphere(new Vector3(), 1);
  private readonly scratch = new Vector3();
  private readonly ndc = new Vector2();

  private renderer!: WebGLRenderer;
  private rig!: CameraRig;
  private layers!: LayerManager;
  private panel!: LayerPanel;
  private timeline!: Timeline;
  private info!: InfoCard;
  private hud!: Hud;
  private about!: AboutDialog;
  private leftColumn!: HTMLElement;

  private selection: PickResult | null = null;
  private pointer: PointerState = { x: 0, y: 0, inside: false, touch: false, dragging: false };
  private pointerDown: { x: number; y: number; t: number } | null = null;
  private hoverFrame = 0;
  private lastMs = performance.now();
  private elapsed = 0;
  private lastPanelRefresh = 0;
  private lastInfoRefresh = 0;
  private lastHash = '';
  private running = false;

  constructor(private readonly root: HTMLElement) {}

  async start(): Promise<void> {
    const canvas = h('canvas', { class: 'scene', 'aria-label': '3D globe' });
    this.root.prepend(canvas);

    try {
      this.renderer = new WebGLRenderer({
        canvas,
        antialias: true,
        powerPreference: 'high-performance',
      });
    } catch (error) {
      this.showFatal(
        'WebGL is not available in this browser, so the globe cannot be drawn.',
        error,
      );
      return;
    }
    // Let the browser restore a lost GPU context; three.js re-uploads everything by itself.
    canvas.addEventListener('webglcontextlost', (event) => event.preventDefault());
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setClearColor(0x03050b);

    this.scene.add(createStars(), this.globe.group, this.marker.mesh);

    this.rig = new CameraRig(this.camera, canvas);
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.rig.autoRotate = !reducedMotion;
    // Start roughly facing the viewer's longitude (derived from the time zone), tilted north.
    this.rig.lookAt(24, -new Date().getTimezoneOffset() / 4, DEFAULT_DISTANCE);

    this.layers = new LayerManager({
      parent: this.globe.group,
      clock: this.clock,
      camera: this.camera,
      pixelRatio: () => this.renderer.getPixelRatio(),
    });
    for (const layer of createLayers()) this.layers.register(layer);

    this.buildUi();
    this.bindEvents(canvas);
    this.observeResize();

    await this.globe.loadTextures(
      Math.min(8, this.renderer.capabilities.getMaxAnisotropy()),
      (loaded, total) => this.setSplashProgress(loaded / total),
    );

    this.applyUrlState();
    this.hideSplash();
    this.running = true;
    requestAnimationFrame(this.tick);

    if (import.meta.env.DEV) (window as unknown as { earthLab: App }).earthLab = this;
  }

  dispose(): void {
    this.running = false;
    this.layers.dispose();
    this.globe.dispose();
    this.marker.dispose();
    this.rig.dispose();
    this.renderer.dispose();
  }

  // ---------------------------------------------------------------- UI

  private buildUi(): void {
    this.hud = new Hud();
    this.info = new InfoCard(
      () => this.select(null),
      () => this.centerOnSelection(),
    );
    this.about = new AboutDialog(this.layers);

    this.panel = new LayerPanel(this.layers, {
      terminator: true,
      clouds: true,
      autoRotate: this.rig.autoRotate,
      onTerminator: (v) => this.globe.setTerminatorEnabled(v),
      onClouds: (v) => this.globe.setCloudsVisible(v),
      onAutoRotate: (v) => (this.rig.autoRotate = v),
    });
    this.timeline = new Timeline(this.clock, this.layers);

    const brand = h(
      'header',
      { class: 'brand' },
      h('img', {
        class: 'brand-mark',
        src: `${import.meta.env.BASE_URL}favicon.svg`,
        alt: '',
        width: 28,
        height: 28,
      }),
      h('div', {}, h('h1', {}, 'Earth Lab'), h('p', {}, 'Open data, live.')),
    );

    this.leftColumn = h('div', { class: 'left' }, brand, this.panel.element);

    const actions = h(
      'div',
      { class: 'actions' },
      h(
        'button',
        {
          class: 'icon-btn layers-toggle panel',
          type: 'button',
          'aria-label': 'Show or hide layers',
          onclick: () => this.leftColumn.classList.toggle('open'),
        },
        icon('layers'),
      ),
      h(
        'button',
        {
          class: 'icon-btn panel',
          type: 'button',
          'aria-label': 'About and shortcuts',
          onclick: () => this.about.toggle(),
        },
        icon('info'),
      ),
    );

    const ui = h(
      'div',
      { class: 'ui' },
      this.leftColumn,
      actions,
      this.hud.readout,
      this.info.element,
      this.timeline.element,
      this.hud.tooltip,
    );
    this.root.append(ui, this.about.element);
  }

  // ------------------------------------------------------------ events

  private bindEvents(canvas: HTMLCanvasElement): void {
    canvas.addEventListener('pointermove', (e) => {
      const rect = canvas.getBoundingClientRect();
      this.pointer.x = e.clientX - rect.left;
      this.pointer.y = e.clientY - rect.top;
      this.pointer.inside = true;
      this.pointer.touch = e.pointerType === 'touch';
      this.pointer.dragging = e.buttons !== 0;
      this.hoverFrame = 0; // refresh the hover state this frame
    });
    canvas.addEventListener('pointerleave', () => {
      this.pointer.inside = false;
      this.hud.setReadout(null);
      this.hud.setTooltip(null);
    });
    canvas.addEventListener('pointerdown', (e) => {
      this.pointerDown = { x: e.clientX, y: e.clientY, t: performance.now() };
      this.pointer.touch = e.pointerType === 'touch';
    });
    canvas.addEventListener('pointerup', (e) => {
      const down = this.pointerDown;
      this.pointerDown = null;
      this.pointer.dragging = false;
      if (!down) return;
      const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y);
      if (moved > CLICK_MAX_MOVE_PX || performance.now() - down.t > CLICK_MAX_MS) return;

      const rect = canvas.getBoundingClientRect();
      this.pointer.x = e.clientX - rect.left;
      this.pointer.y = e.clientY - rect.top;
      this.select(
        this.pickAtPointer(e.pointerType === 'touch' ? TOUCH_RADIUS_PX : HOVER_RADIUS_PX),
        true,
      );
    });

    window.addEventListener('keydown', (e) => this.onKey(e));
    window.addEventListener('beforeunload', () => this.syncHash(true));

    this.layers.changed.on((entry) => {
      if (this.selection?.layerId === entry.layer.id && !entry.enabled) this.select(null);
    });
  }

  private onKey(e: KeyboardEvent): void {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const target = e.target as HTMLElement | null;
    if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return;

    const key = e.key.toLowerCase();
    if (
      key === ' ' &&
      (document.activeElement === document.body ||
        document.activeElement === this.renderer.domElement)
    ) {
      e.preventDefault();
      this.clock.toggle();
    } else if (key === 'l') this.clock.goLive();
    else if (key === 'r') {
      this.rig.autoRotate = !this.rig.autoRotate;
      this.panel.syncSettings();
    } else if (key === 'escape') this.select(null);
    else if (key === '?') this.about.toggle();
    else if (/^[1-9]$/.test(key)) {
      const entry = this.layers.list()[Number(key) - 1];
      if (entry) void this.layers.setEnabled(entry.layer.id, !entry.enabled);
    }
  }

  private observeResize(): void {
    const apply = () => {
      const width = this.root.clientWidth || window.innerWidth;
      const height = this.root.clientHeight || window.innerHeight;
      this.renderer.setSize(width, height, false);
      const aspect = width / height;
      this.camera.aspect = aspect;
      // Portrait screens: widen the field of view so the globe still fits horizontally.
      this.camera.fov = aspect >= 1 ? 40 : Math.min(75, 40 / Math.pow(aspect, 0.8));
      // Desktop: slide the globe right so it sits in the free space next to the layers panel.
      if (width > 900) this.camera.setViewOffset(width, height, -PANEL_SHIFT_PX, 0, width, height);
      else this.camera.clearViewOffset();
      this.camera.updateProjectionMatrix();
    };
    new ResizeObserver(apply).observe(this.root);
    apply();
  }

  // ------------------------------------------------------- URL state

  private applyUrlState(): void {
    const state = parseHash(window.location.hash);
    const known = new Set(this.layers.list().map((e) => e.layer.id));
    const wanted = (state.layers ?? DEFAULT_LAYERS).filter((id) => known.has(id));
    for (const id of wanted) void this.layers.setEnabled(id, true);

    if (state.time !== undefined) {
      this.clock.seek(state.time);
      this.clock.pause();
    }
  }

  private syncHash(force = false): void {
    const hash = serializeHash({
      layers: this.layers.enabledIds(),
      time: this.clock.live ? undefined : this.clock.time,
    });
    if (!force && hash === this.lastHash) return;
    this.lastHash = hash;
    try {
      window.history.replaceState(
        null,
        '',
        hash || window.location.pathname + window.location.search,
      );
    } catch {
      // Sandboxed iframes may forbid history changes; sharing links is a nice-to-have.
    }
  }

  // --------------------------------------------------------- picking

  private pickAtPointer(radiusPx: number): PickResult | null {
    const canvas = this.renderer.domElement;
    return this.layers.pick({
      x: this.pointer.x,
      y: this.pointer.y,
      width: canvas.clientWidth,
      height: canvas.clientHeight,
      camera: this.camera,
      radiusPx,
      time: this.clock.time,
    });
  }

  private updateHover(): void {
    const canvas = this.renderer.domElement;
    const { pointer } = this;
    if (!pointer.inside || pointer.dragging || pointer.touch) {
      this.hud.setTooltip(null);
      if (!pointer.inside || pointer.dragging) this.hud.setReadout(null);
      canvas.style.cursor = pointer.dragging ? 'grabbing' : '';
      return;
    }

    const hit = this.pickAtPointer(HOVER_RADIUS_PX);
    canvas.style.cursor = hit ? 'pointer' : 'grab';
    this.hud.setTooltip(
      hit
        ? { title: hit.title, subtitle: hit.subtitle, color: hit.color, x: pointer.x, y: pointer.y }
        : null,
    );

    this.ndc.set(
      (pointer.x / canvas.clientWidth) * 2 - 1,
      -(pointer.y / canvas.clientHeight) * 2 + 1,
    );
    this.raycaster.setFromCamera(this.ndc, this.camera);
    const point = this.raycaster.ray.intersectSphere(this.unitSphere, this.scratch);
    if (!point) {
      this.hud.setReadout(null);
      return;
    }
    const { lat, lon } = vector3ToLatLon(point);
    const time = this.clock.time;
    const probes: string[] = [];
    for (const entry of this.layers.list()) {
      if (!entry.enabled || entry.state !== 'ready') continue;
      const text = entry.layer.probe?.(lat, lon, time);
      if (text) probes.push(text);
    }
    this.hud.setReadout({ lat, lon, phase: daylightPhase(lat, lon, time), probes });
  }

  // ------------------------------------------------------- selection

  private select(result: PickResult | null, fly = false): void {
    const previous = this.selection;
    this.selection = result;
    this.layers.select(result, previous);

    if (!result) {
      this.info.hide();
      this.marker.set(null);
      return;
    }
    this.info.show(result);
    this.marker.set(this.positionOf(result), result.color);
    if (fly) this.flyToSelection();
  }

  private positionOf(result: PickResult): Vector3 {
    const radius =
      result.altKm !== undefined ? altitudeToRadius(result.altKm) : SURFACE_MARKER_RADIUS;
    return latLonToVector3(result.lat, result.lon, radius);
  }

  private flyToSelection(): void {
    if (!this.selection) return;
    const preferred = this.selection.altKm !== undefined ? 2.7 : 2.2;
    this.rig.flyTo(this.selection.lat, this.selection.lon, Math.min(this.rig.distance, preferred));
  }

  private centerOnSelection(): void {
    this.rig.autoRotate = false;
    this.panel.syncSettings();
    this.flyToSelection();
  }

  /**
   * Moving items (satellites, storms) report fresh details every frame so the marker follows them.
   * Static items only need their relative times ("3 h ago") refreshed now and then.
   */
  private refreshSelection(time: number, nowMs: number): void {
    if (!this.selection) return;
    const layer = this.layers.get(this.selection.layerId)?.layer;
    if (!layer?.describe) return;
    if (!layer.movesItems && nowMs - this.lastInfoRefresh < 250) return;

    const fresh = layer.describe(this.selection.id, time);
    if (!fresh) return;
    this.selection = fresh;
    if (layer.movesItems) this.marker.moveTo(this.positionOf(fresh));
    if (nowMs - this.lastInfoRefresh > 250) {
      this.lastInfoRefresh = nowMs;
      this.info.update(fresh);
    }
  }

  // -------------------------------------------------------- the loop

  private tick = (nowMs: number): void => {
    if (!this.running) return;
    const dt = Math.min((nowMs - this.lastMs) / 1000, 0.25);
    this.lastMs = nowMs;
    this.elapsed += dt;

    this.clock.tick(dt * 1000);
    const time = this.clock.time;

    this.globe.setSimTime(time);
    this.layers.update({
      time,
      dt,
      elapsed: this.elapsed,
      live: this.clock.live,
      camera: this.camera,
    });
    this.rig.update();
    this.globe.setDim(this.layers.globeDim());
    this.globe.update(this.camera, dt);
    this.refreshSelection(time, nowMs);
    this.marker.update(this.camera, this.renderer.domElement.clientHeight, this.elapsed);

    // Hover picking scans every marker, so run it every few frames unless the pointer just moved.
    if (this.hoverFrame-- <= 0) {
      this.hoverFrame = 4;
      this.updateHover();
    }

    this.timeline.update();
    if (nowMs - this.lastPanelRefresh > 250) {
      this.lastPanelRefresh = nowMs;
      this.panel.refresh();
      this.panel.syncSettings();
      this.syncHash();
    }

    this.renderer.render(this.scene, this.camera);
    requestAnimationFrame(this.tick);
  };

  // ------------------------------------------------------------ splash

  private setSplashProgress(fraction: number): void {
    const bar = document.querySelector<HTMLElement>('#splash .bar i');
    if (bar) bar.style.transform = `scaleX(${fraction})`;
  }

  private hideSplash(): void {
    const splash = document.getElementById('splash');
    if (!splash) return;
    splash.classList.add('done');
    splash.addEventListener('transitionend', () => splash.remove(), { once: true });
    window.setTimeout(() => splash.remove(), 1500);
  }

  private showFatal(message: string, error: unknown): void {
    console.error(error);
    const splash = document.getElementById('splash');
    if (splash) {
      splash.classList.add('fatal');
      splash.querySelector('p')!.textContent = message;
    }
  }
}
