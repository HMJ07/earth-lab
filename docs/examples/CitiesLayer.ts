/**
 * A complete, minimal data layer: a handful of cities as dots on the globe.
 * It is the example used by docs/ADDING_A_LAYER.md and is type-checked in CI, so it cannot rot.
 *
 * To try it, add `new CitiesLayer()` to the array in src/app/layers.ts.
 */
import { BufferAttribute, BufferGeometry, Points, PointsMaterial } from 'three';
import { formatCoord, formatNumber } from '../../src/core/format';
import { latLonToVector3 } from '../../src/core/geo';
import type { FrameInfo, Layer, LayerContext, PickQuery, PickResult } from '../../src/core/Layer';
import { pickNearest } from '../../src/scene/pointPicking';

interface City {
  name: string;
  lat: number;
  lon: number;
  population: number;
}

const CITIES: readonly City[] = [
  { name: 'Tokyo', lat: 35.68, lon: 139.69, population: 37_400_000 },
  { name: 'Delhi', lat: 28.61, lon: 77.21, population: 31_000_000 },
  { name: 'São Paulo', lat: -23.55, lon: -46.63, population: 22_000_000 },
  { name: 'Lagos', lat: 6.52, lon: 3.38, population: 15_400_000 },
  { name: 'Madrid', lat: 40.42, lon: -3.7, population: 6_700_000 },
];

export class CitiesLayer implements Layer {
  // Identity and presentation ------------------------------------------------
  readonly id = 'cities';
  readonly label = 'Cities';
  readonly description = 'A few of the world’s largest cities.';
  readonly color = '#7cc4ff';
  /** `false` = the layer ignores the time machine and always shows "now". */
  readonly timeAware = false;
  readonly attribution = { name: 'Example data', url: 'https://example.com/' };

  private points: Points | null = null;
  private positions = new Float32Array(0);

  /** Called once, the first time the user switches the layer on. Fetch data here if you need to. */
  async load(context: LayerContext): Promise<void> {
    this.positions = new Float32Array(CITIES.length * 3);
    CITIES.forEach((city, i) => {
      // Slightly above the surface so the dots never z-fight with the imagery.
      const p = latLonToVector3(city.lat, city.lon, 1.004);
      this.positions.set([p.x, p.y, p.z], i * 3);
    });

    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new BufferAttribute(this.positions, 3));
    this.points = new Points(
      geometry,
      new PointsMaterial({ color: this.color, size: 9, sizeAttenuation: false, depthWrite: false }),
    );
    this.points.renderOrder = 10; // above the clouds, with the other markers
    context.group.add(this.points); // the manager shows/hides this group for you
  }

  /** Called every frame while the layer is on. Static layers have nothing to do. */
  update(_frame: FrameInfo): void {}

  /** Hit-testing. `pickNearest` handles projection and hides points behind the planet. */
  pick(query: PickQuery): PickResult | null {
    const hit = pickNearest(this.positions, CITIES.length, query, () => true);
    if (!hit) return null;

    const city = CITIES[hit.index]!;
    return {
      layerId: this.id,
      id: city.name,
      distancePx: hit.distancePx,
      title: city.name,
      subtitle: 'City',
      color: this.color,
      lat: city.lat,
      lon: city.lon,
      rows: [
        ['Population', formatNumber(city.population)],
        ['Position', formatCoord(city.lat, city.lon)],
      ],
    };
  }

  status(): string {
    return `${CITIES.length} cities`;
  }

  dispose(): void {
    this.points?.geometry.dispose();
    (this.points?.material as PointsMaterial | undefined)?.dispose();
    this.points?.removeFromParent();
    this.points = null;
  }
}
