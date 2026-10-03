# Adding a layer

A layer is one class implementing the `Layer` interface. This guide builds the smallest useful one. The finished file is [`docs/examples/CitiesLayer.ts`](examples/CitiesLayer.ts) — it is compiled in CI, so it is always current.

## 1. Create the class

Put it in `src/layers/<name>/<Name>Layer.ts`. The minimum:

```ts
export class CitiesLayer implements Layer {
  readonly id = 'cities'; // unique; also used in the URL hash
  readonly label = 'Cities'; // shown in the panel
  readonly description = '…';
  readonly color = '#7cc4ff'; // accent colour of the UI row
  readonly timeAware = false; // does it react to the time machine?
  readonly attribution = { name: 'Example data', url: 'https://example.com/' };

  async load(context: LayerContext): Promise<void> {
    /* build objects, add to context.group */
  }
  update(frame: FrameInfo): void {
    /* per-frame work */
  }
  pick(query: PickQuery): PickResult | null {
    /* hit-test */
  }
  status(): string {
    return '5 cities';
  }
  dispose(): void {
    /* free GPU resources */
  }
}
```

## 2. Register it

In `src/app/layers.ts`:

```ts
export function createLayers(): Layer[] {
  return [
    new EarthquakeLayer(),
    new SatelliteLayer(),
    new EventLayer(),
    new WindLayer(),
    new CitiesLayer(),
  ];
}
```

That is all the wiring there is. The panel switch, keyboard shortcut (`5`), URL state, lazy loading, error handling and visibility are handled for you.

## 3. Things worth knowing

**Coordinates.** `latLonToVector3(lat, lon, radius)` converts degrees to a point on the globe. Use a radius a little above 1 (e.g. `1.004`) so markers do not z-fight with the imagery; use `altitudeToRadius(km)` for things that fly.

**Time.** If `timeAware` is `true`, use `frame.time` (ms since epoch), never `Date.now()`. For many items, do what the earthquake layer does: upload each item's timestamp as a vertex attribute and let the shader hide the ones that have not happened yet. It makes scrubbing free.

**Data.** Fetch with the shared client so you get timeouts, caching and stale-on-error for free:

```ts
import { http } from '../../core/http';
const data = await http.getJson<MyFeed>(URL, { cacheKey: 'my-feed', ttlMs: 10 * 60_000 });
```

The source **must** send CORS headers that allow browser access. Check with
`curl -sI -H 'Origin: https://example.com' <url> | grep -i access-control`.

**Parsing.** Keep parsing in a pure function (`parseMyFeed(json): Item[]`), tolerant of malformed rows, and unit-test it — see `tests/usgs.test.ts`.

**Picking.** For point clouds use `pickNearest` from `scene/pointPicking.ts`. It projects efficiently, honours the hover radius and ignores points behind the planet.

**Links.** Anything in `PickResult.link` is filtered through `safeHttpUrl`; only `http(s)` links are rendered.

**Rendering style.** Markers that read well on both the bright day side and the dark night side use normal blending with a darker rim; see the shaders in `EarthquakeLayer.ts`. Set `renderOrder` to 10 or higher so markers draw over the clouds.

## 4. Optional extras

| Add this                | To get                                                      |
| ----------------------- | ----------------------------------------------------------- |
| `controls()`            | sliders, toggle chips and segmented selects under the layer |
| `describe(id, time)`    | a live-updating details card for moving items               |
| `probe(lat, lon, time)` | a text next to the cursor coordinates (wind uses it)        |
| `activity(from, to, n)` | bars on the timeline sparkline                              |
| `select(id)`            | react to selection, e.g. draw a path                        |
| `dimsGlobe = 0.6`       | darken the imagery so thin overlays stand out               |

## 5. Test it

Add a unit test for your parser and anything else that is pure logic under `tests/`, then run:

```bash
npm run check
```

and look at the layer in `npm run dev`.
