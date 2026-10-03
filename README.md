<div align="center">

# 🌍 Earth Lab

**A living 3D globe of open scientific data — earthquakes, satellites, natural events and wind — with a time machine to replay the last 30 days.**

Runs entirely in your browser. No backend, no API keys, no tracking.

[![CI](https://github.com/HMJ07/earth-lab/actions/workflows/ci.yml/badge.svg)](https://github.com/HMJ07/earth-lab/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178c6?logo=typescript&logoColor=white)
![three.js](https://img.shields.io/badge/three.js-WebGL-black?logo=threedotjs)
![No backend](https://img.shields.io/badge/backend-none-success)

[Español](README.es.md) · [Architecture](docs/ARCHITECTURE.md) · [Add a layer](docs/ADDING_A_LAYER.md) · [Roadmap](docs/ROADMAP.md)

<img src="docs/img/hero.jpg" alt="Earth Lab showing earthquakes, storm tracks and the day/night terminator over the Atlantic" width="100%">

</div>

## What is it?

Earth Lab puts several public scientific data feeds on one interactive planet and lets you move through time. Watch the last month of earthquakes arrive in sequence, follow the ISS along its orbit, see where wildfires and storms are active right now, or watch thousands of wind particles flow across the oceans.

Everything is computed on the client: orbits are propagated with SGP4, the Sun's position comes from astronomical formulae, and the globe is rendered with custom GLSL shaders.

<table>
  <tr>
    <td width="50%"><img src="docs/img/wind.jpg" alt="Surface wind particles over the Pacific"><br><sub><b>Wind</b> — particle flow over a dimmed globe</sub></td>
    <td width="50%"><img src="docs/img/satellites.jpg" alt="Roughly ten thousand satellites orbiting Earth"><br><sub><b>Satellites</b> — ~10 000 with Starlink enabled</sub></td>
  </tr>
</table>

## Features

| Layer                 | What you see                                                                                                                               | Source                                     |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------ |
| 🌋 **Earthquakes**    | Every M2.5+ event of the last 30 days. Colour = depth, size = magnitude, fresh events pulse.                                               | [USGS](https://earthquake.usgs.gov/)       |
| 🛰️ **Satellites**     | Space stations, the brightest satellites, GPS, weather and (opt-in) Starlink. Click one for its altitude, speed, orbit and projected path. | [CelesTrak](https://celestrak.org/)        |
| 🔥 **Natural events** | Wildfires, severe storms (with their tracks), volcanoes, floods and sea ice.                                                               | [NASA EONET](https://eonet.gsfc.nasa.gov/) |
| 💨 **Wind**           | Animated surface wind, coloured by speed.                                                                                                  | [Open-Meteo](https://open-meteo.com/)      |
| 🌗 **Day / night**    | Real terminator from the Sun's computed position, twilight band, city lights.                                                              | computed                                   |

Plus:

- ⏪ **Time machine** — scrub or play back up to **1 day per second**. A sparkline shows when things happened. Every moment has a shareable link (`#t=…`).
- 🔌 **Plugin-style layers** — a new dataset is one class implementing a small `Layer` interface. See [Adding a layer](docs/ADDING_A_LAYER.md).
- ⚡ **Fast** — ~10 000 satellites propagate within a 3 ms/frame budget; hover-picking over all of them takes about a millisecond.
- 📱 **Responsive**, keyboard-operable controls, respects `prefers-reduced-motion`.
- 🔒 **Private** — nothing is sent anywhere except the public data APIs above, straight from your browser.

<p align="center"><img src="docs/img/ui.jpg" alt="Earth Lab interface: layers panel, details card and time machine" width="80%"></p>

## Quick start

Requires **Node.js 20+**.

```bash
git clone https://github.com/HMJ07/earth-lab.git
cd earth-lab
npm install
npm run dev
```

Open <http://localhost:5173>. To get a production build: `npm run build` (output in `dist/`).

### Controls

| Action              | Input                          |
| ------------------- | ------------------------------ |
| Rotate / zoom       | Drag / scroll or pinch         |
| Details of a marker | Click it (hover for a preview) |
| Toggle layers       | `1` – `4` or the switches      |
| Play / pause time   | `Space`                        |
| Back to live        | `L`                            |
| Auto-rotate         | `R`                            |
| Close details       | `Esc`                          |
| Help & credits      | `?`                            |

### Shareable links

The URL hash stores the active layers and the moment in time:

```
https://<your-site>/#layers=quakes,satellites,events&t=1789755177796
```

## Known limitations

Being upfront about what the data can and cannot do:

- **Satellite accuracy decays with time.** SGP4 is accurate to roughly a kilometre near the element-set epoch and drifts by days. When you rewind far from the epoch the card warns you that the position is approximate.
- **Wind shows current conditions and is coarse.** It is interpolated from a 15° grid (264 points), the most the free Open-Meteo tier allows per refresh. It ignores the time machine.
- **Clouds are decorative.** A static texture, not live cloud cover.
- **No live flights.** The free flight-tracking APIs (OpenSky, adsb.lol…) do not allow browser access from other origins. A proxy is on the [roadmap](docs/ROADMAP.md).
- **Public APIs can be slow or rate-limited.** Responses are cached (`localStorage`) and a stale copy is used if the network fails.

## How it works

```
src/
├── app/        App.ts (orchestrator) · layers.ts (the layer registry)
├── core/       Clock · Layer interface · LayerManager · http+cache · geo · astronomy · url state
├── scene/      Globe & shaders · stars · camera rig · selection marker · point picking
├── layers/     earthquakes · satellites · events · wind   ← one folder per dataset
└── ui/         layer panel · timeline · info card · HUD · about dialog
```

A few decisions worth knowing about (details in [ARCHITECTURE.md](docs/ARCHITECTURE.md)):

- **One clock drives everything.** `SimClock` is either _live_ or free-running inside a 30-day window. Layers receive the simulated time every frame and never touch `Date.now()`.
- **Time-travel on the GPU.** Quakes and event markers carry their timestamps as vertex attributes; the shader decides what is visible. Scrubbing costs one uniform update, not a rebuild.
- **Budgeted orbit propagation.** Satellites are propagated round-robin within a CPU time budget per frame, so even 10 000 of them keep the UI smooth.
- **Layers are isolated.** The manager lazy-loads each layer on first use, contains its failures, and handles visibility, picking and selection.

## Scripts

| Command                                 | What it does                       |
| --------------------------------------- | ---------------------------------- |
| `npm run dev`                           | Dev server with hot reload         |
| `npm run build`                         | Typecheck + production build       |
| `npm run preview`                       | Serve the production build locally |
| `npm test`                              | Run the unit tests (Vitest)        |
| `npm run typecheck` · `lint` · `format` | TypeScript, ESLint, Prettier       |
| `npm run check`                         | Everything CI runs                 |

## Deploying

The repo ships with a GitHub Actions workflow that builds and publishes to **GitHub Pages** on every push to `main`
(enable _Settings → Pages → Source: GitHub Actions_). To host under a sub-path yourself, set `BASE_PATH`:

```bash
BASE_PATH=/earth-lab/ npm run build
```

It is a static site: any static host (Netlify, Cloudflare Pages, S3…) works.

## Contributing

Ideas, bug reports and new layers are very welcome — see [CONTRIBUTING.md](CONTRIBUTING.md). A good first contribution is a new data layer; the [guide](docs/ADDING_A_LAYER.md) walks through one in ~100 lines.

## Credits

Earth imagery by NASA; data from USGS, CelesTrak, NASA EONET and Open-Meteo; built with [three.js](https://threejs.org/) and [satellite.js](https://github.com/shashwatak/satellite-js). Full attribution and licences in [CREDITS.md](CREDITS.md).

## License

[MIT](LICENSE) © HMJ07
