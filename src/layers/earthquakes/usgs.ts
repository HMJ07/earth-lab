import type { Http } from '../../core/http';

export const USGS_FEED =
  'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/2.5_month.geojson';

export interface Quake {
  id: string;
  /** ms since epoch */
  time: number;
  lat: number;
  lon: number;
  depthKm: number;
  mag: number;
  place: string;
  url: string;
  tsunami: boolean;
  felt: number | null;
}

interface RawFeature {
  id?: unknown;
  properties?: {
    mag?: unknown;
    place?: unknown;
    time?: unknown;
    url?: unknown;
    tsunami?: unknown;
    felt?: unknown;
  };
  geometry?: { coordinates?: unknown };
}

const isNumber = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/** Turns a USGS GeoJSON feed into clean, time-sorted quakes. Malformed rows are dropped. */
export function parseUsgs(json: unknown): Quake[] {
  const features = (json as { features?: unknown })?.features;
  if (!Array.isArray(features)) throw new Error('Unexpected USGS response: no features array');

  const quakes: Quake[] = [];
  for (const feature of features as RawFeature[]) {
    const p = feature.properties;
    const c = feature.geometry?.coordinates;
    if (!p || !Array.isArray(c)) continue;

    const [lon, lat, depth] = c as unknown[];
    if (!isNumber(p.mag) || !isNumber(p.time) || !isNumber(lon) || !isNumber(lat)) continue;
    if (Math.abs(lat) > 90 || Math.abs(lon) > 180) continue;

    quakes.push({
      id: String(feature.id ?? `${p.time}:${lat}:${lon}`),
      time: p.time,
      lat,
      lon,
      depthKm: isNumber(depth) ? Math.max(0, depth) : 0,
      mag: p.mag,
      place: typeof p.place === 'string' ? p.place : 'Unknown location',
      url: typeof p.url === 'string' ? p.url : 'https://earthquake.usgs.gov/earthquakes/map/',
      tsunami: p.tsunami === 1,
      felt: isNumber(p.felt) ? p.felt : null,
    });
  }
  return quakes.sort((a, b) => a.time - b.time);
}

export async function fetchQuakes(http: Http, signal?: AbortSignal): Promise<Quake[]> {
  const json = await http.getJson<unknown>(USGS_FEED, {
    cacheKey: 'usgs:2.5_month',
    ttlMs: 5 * 60_000,
    signal,
  });
  return parseUsgs(json);
}
