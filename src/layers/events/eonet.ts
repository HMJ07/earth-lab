import type { Http } from '../../core/http';

export const EONET_URL = 'https://eonet.gsfc.nasa.gov/api/v3/events?days=30&status=all';

export interface EventPoint {
  time: number;
  lat: number;
  lon: number;
  magnitude?: number;
  unit?: string;
}

export interface NaturalEvent {
  id: string;
  title: string;
  category: string;
  categoryTitle: string;
  link: string;
  sourceUrl?: string;
  /** First recorded position time. */
  start: number;
  /** When NASA closed the event, or null while it is still open. */
  closed: number | null;
  /** Positions over time, ascending. Storms have many; most events have one. */
  points: EventPoint[];
}

interface RawGeometry {
  date?: unknown;
  type?: unknown;
  coordinates?: unknown;
  magnitudeValue?: unknown;
  magnitudeUnit?: unknown;
}

interface RawEvent {
  id?: unknown;
  title?: unknown;
  link?: unknown;
  closed?: unknown;
  categories?: Array<{ id?: unknown; title?: unknown }>;
  sources?: Array<{ url?: unknown }>;
  geometry?: RawGeometry[];
}

const isNumber = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/** Representative [lon, lat] of a Point or Polygon geometry (polygons use the vertex centroid). */
export function geometryCenter(type: unknown, coordinates: unknown): [number, number] | null {
  if (type === 'Point' && Array.isArray(coordinates)) {
    const [lon, lat] = coordinates as unknown[];
    return isNumber(lon) && isNumber(lat) ? [lon, lat] : null;
  }
  if (type === 'Polygon' && Array.isArray(coordinates) && Array.isArray(coordinates[0])) {
    const ring = coordinates[0] as unknown[];
    let sx = 0;
    let sy = 0;
    let n = 0;
    for (const vertex of ring) {
      if (!Array.isArray(vertex)) continue;
      const [lon, lat] = vertex as unknown[];
      if (!isNumber(lon) || !isNumber(lat)) continue;
      sx += lon;
      sy += lat;
      n++;
    }
    return n > 0 ? [sx / n, sy / n] : null;
  }
  return null;
}

export function parseEonet(json: unknown): NaturalEvent[] {
  const events = (json as { events?: unknown })?.events;
  if (!Array.isArray(events)) throw new Error('Unexpected EONET response: no events array');

  const result: NaturalEvent[] = [];
  for (const raw of events as RawEvent[]) {
    const category = raw.categories?.[0];
    if (!category || typeof category.id !== 'string' || typeof raw.id !== 'string') continue;

    const points: EventPoint[] = [];
    for (const g of raw.geometry ?? []) {
      const time = typeof g.date === 'string' ? Date.parse(g.date) : NaN;
      const center = geometryCenter(g.type, g.coordinates);
      if (!Number.isFinite(time) || !center) continue;
      points.push({
        time,
        lon: center[0],
        lat: center[1],
        magnitude: isNumber(g.magnitudeValue) ? g.magnitudeValue : undefined,
        unit: typeof g.magnitudeUnit === 'string' ? g.magnitudeUnit : undefined,
      });
    }
    if (points.length === 0) continue;
    points.sort((a, b) => a.time - b.time);

    const closed = typeof raw.closed === 'string' ? Date.parse(raw.closed) : NaN;
    result.push({
      id: raw.id,
      title: typeof raw.title === 'string' ? raw.title : raw.id,
      category: category.id,
      categoryTitle: typeof category.title === 'string' ? category.title : category.id,
      link: typeof raw.link === 'string' ? raw.link : 'https://eonet.gsfc.nasa.gov/',
      sourceUrl: raw.sources?.find((s) => typeof s.url === 'string')?.url as string | undefined,
      start: points[0]!.time,
      closed: Number.isFinite(closed) ? closed : null,
      points,
    });
  }
  return result.sort((a, b) => a.start - b.start);
}

export async function fetchEvents(http: Http, signal?: AbortSignal): Promise<NaturalEvent[]> {
  const json = await http.getJson<unknown>(EONET_URL, {
    cacheKey: 'eonet:30d',
    ttlMs: 30 * 60_000,
    timeoutMs: 45_000,
    signal,
  });
  return parseEonet(json);
}

/** Index of the last point at or before `time`, or -1 when the event has not started. */
export function currentPointIndex(event: NaturalEvent, time: number): number {
  let index = -1;
  for (let i = 0; i < event.points.length; i++) {
    if (event.points[i]!.time <= time) index = i;
    else break;
  }
  return index;
}

/** Display metadata for EONET categories. */
export const EVENT_CATEGORIES: Record<string, { label: string; color: string }> = {
  wildfires: { label: 'Wildfires', color: '#ff8a3d' },
  severeStorms: { label: 'Severe storms', color: '#7aa2ff' },
  volcanoes: { label: 'Volcanoes', color: '#ff4d6d' },
  floods: { label: 'Floods', color: '#3bc9db' },
  seaLakeIce: { label: 'Sea & lake ice', color: '#d0ebff' },
  drought: { label: 'Drought', color: '#d4a373' },
  dustHaze: { label: 'Dust & haze', color: '#c9a66b' },
  landslides: { label: 'Landslides', color: '#b08968' },
  snow: { label: 'Snow', color: '#f8f9fa' },
  tempExtremes: { label: 'Temperature extremes', color: '#ff6b6b' },
  waterColor: { label: 'Water colour', color: '#2ec4b6' },
  earthquakes: { label: 'Earthquakes', color: '#ff7a45' },
  manmade: { label: 'Manmade', color: '#adb5bd' },
};

export const FALLBACK_CATEGORY = { label: 'Other', color: '#ced4da' };
