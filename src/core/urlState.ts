/** Shareable app state, serialised into the URL hash: `#layers=quakes,satellites&t=1790000000000`. */
export interface UrlState {
  layers?: string[];
  /** Simulated time in ms since epoch. Absent means "live". */
  time?: number;
}

export function parseHash(hash: string): UrlState {
  const params = new URLSearchParams(hash.replace(/^#/, ''));
  const state: UrlState = {};

  const layers = params.get('layers');
  if (layers !== null) {
    state.layers = layers
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
  }

  const t = Number(params.get('t'));
  if (params.has('t') && Number.isFinite(t) && t > 0) state.time = Math.round(t);

  return state;
}

export function serializeHash(state: UrlState): string {
  const params = new URLSearchParams();
  if (state.layers) params.set('layers', state.layers.join(','));
  if (state.time !== undefined) params.set('t', String(Math.round(state.time)));
  const text = params.toString().replace(/%2C/g, ',');
  return text ? `#${text}` : '';
}
