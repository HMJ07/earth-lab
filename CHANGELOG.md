# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses
[Semantic Versioning](https://semver.org/).

## [0.1.0] — 2026-10-03

### Added

- Interactive 3D globe with day/night terminator computed from the Sun's position, city lights, clouds and atmosphere.
- Layers: earthquakes (USGS), satellites (CelesTrak + SGP4, optional Starlink), natural events with storm tracks (NASA EONET) and wind particles (Open-Meteo).
- Time machine over the last 30 days with play speeds up to 1 day/s, activity sparkline and shareable URLs.
- Details card, hover tooltips, coordinate/daylight read-out and keyboard shortcuts.
- Plugin-style layer architecture with documentation and a type-checked example.
- HTTP client with timeouts, caching and stale-on-error fallback.
- Unit tests, CI workflow and GitHub Pages deployment workflow.
