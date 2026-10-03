# Security policy

## Supported versions

Only the latest release on `main` receives fixes.

## Reporting a vulnerability

Please **do not open a public issue**. Use GitHub's private reporting instead:
[Report a vulnerability](https://github.com/HMJ07/earth-lab/security/advisories/new).

Include what you found, how to reproduce it and the impact you see. You can expect an acknowledgement within a few days.

## Scope and design notes

Earth Lab is a static site with no server, no accounts and no stored user data, so the realistic attack surface is the browser:

- **Third-party feeds are untrusted input.** All text from USGS, CelesTrak, NASA EONET and Open-Meteo is inserted with `textContent`/text nodes. `innerHTML` is only used for static, hard-coded icon markup.
- **Links from feeds** pass through `safeHttpUrl` and only `http(s)` URLs are rendered; they open with `rel="noopener noreferrer"`.
- **Parsers tolerate malformed data** (see `tests/`) and never `eval` anything.
- **Storage.** The only thing stored is a cache of public API responses in `localStorage`, under the `earthlab:v1:` prefix.
- **Dependencies** are few (`three`, `satellite.js`) and kept current with Dependabot.

Reports about the availability of the public data providers themselves should go to those providers.
