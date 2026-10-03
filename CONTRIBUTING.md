# Contributing to Earth Lab

Thanks for your interest! Bug reports, ideas, docs fixes and new data layers are all welcome.

## Principles

These keep the project simple and are worth protecting:

1. **No backend, no API keys.** The app is static and talks to public APIs directly from the browser.
2. **Privacy first.** No analytics, no third-party scripts, no sending user data anywhere.
3. **Be honest about the data.** If a layer is approximate, delayed or decorative, the UI and docs say so.
4. **Time-aware by default.** Layers read the simulated time from the clock, never `Date.now()`.

## Getting set up

```bash
git clone https://github.com/HMJ07/earth-lab.git
cd earth-lab
npm install
npm run dev        # http://localhost:5173
```

Node.js 20 or newer.

## Before you open a pull request

```bash
npm run check      # typecheck + lint + format check + tests
npm run build
```

CI runs the same commands. `npm run format` fixes formatting for you.

### Guidelines

- **Tests.** New parsing, maths or state logic needs unit tests under `tests/`. Visual changes are checked by eye — mention in the PR what you looked at (a screenshot helps).
- **Types.** TypeScript is `strict`. Avoid `any`; prefer small pure functions.
- **Style.** Prettier and ESLint are authoritative. Match the surrounding code: comments explain _why_, not _what_.
- **Performance.** Avoid allocations in per-frame code. If you touch picking, propagation or the wind loop, mention the measured cost.
- **Commits.** [Conventional Commits](https://www.conventionalcommits.org/) are appreciated (`feat:`, `fix:`, `docs:`…), but not enforced.
- **Scope.** Small, focused pull requests are reviewed faster. For anything big, open an issue first to agree on the approach.

## Adding a data layer

This is the best first contribution. Follow [docs/ADDING_A_LAYER.md](docs/ADDING_A_LAYER.md). Before you start, confirm the data source:

- is **free** and needs **no key**,
- sends CORS headers that allow browser access,
- has a licence that allows redistribution of derived visualisations (and note it in `CREDITS.md`).

## Reporting bugs

Use the bug report template and include your browser, OS, the URL hash (`#layers=…&t=…`) and anything in the browser console. For security issues see [SECURITY.md](SECURITY.md) instead of opening a public issue.

## Code of Conduct

By participating you agree to follow the [Code of Conduct](CODE_OF_CONDUCT.md).
