# Roadmap

Ideas, roughly in the order they are interesting. Pick one up by opening an issue first.

## Next

- **Epidemic lab.** An agent-based SIR simulation as a layer: people on a real population grid, moving along real air routes, with sliders for transmission and interventions. It reuses the clock and layer system; the new part is the simulation core (ideally in a Web Worker) and a population raster.
- **NASA GIBS imagery layer.** Daily true-colour and thematic imagery (sea-surface temperature, aerosols, fires) from NASA's tile service, which sends CORS headers and is time-addressable, so it plugs straight into the time machine.
- **Live flights via an optional proxy.** OpenSky and similar services block cross-origin browser access. A tiny Cloudflare Worker could relay them; the layer would stay optional so the app remains backend-free by default.
- **Higher-resolution wind.** Replace the 15° grid with a pre-processed GFS/ICON field published as static tiles (a scheduled GitHub Action could refresh them).

## Polish

- Search box: jump to a place or a satellite by name.
- Embed mode: `?embed=1&layers=…` with the UI stripped down, for iframes.
- Export a timelapse as video/GIF.
- Move SGP4 to a Web Worker.
- Installable PWA with offline cache of the last data.
- i18n (the UI is English only today).
- Keyboard-only picking and a screen-reader summary of what is on the globe.

## Maybe

- WebGPU renderer when browser support is universal.
- Volcano and tsunami alert feeds.
- Space-weather layer (aurora oval, Kp index).
