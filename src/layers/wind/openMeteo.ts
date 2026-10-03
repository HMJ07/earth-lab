import { HttpError, type Http } from '../../core/http';
import type { LatLon } from '../../core/geo';
import { windToUV, WindField } from './windField';

const ENDPOINT = 'https://api.open-meteo.com/v1/forecast';
/** Open-Meteo accepts many coordinates per request; keep URLs comfortably short. */
const BATCH_SIZE = 100;
/**
 * Open-Meteo's free tier allows 600 "calls" per minute and bills every coordinate as one call, so
 * the grid has to stay well under that: 15° gives 24 x 11 = 264 points per refresh.
 */
export const GRID_STEP_DEG = 15;
export const LAT_MIN = -75;
export const LAT_MAX = 75;

export function buildUrl(coordinates: LatLon[]): string {
  const lat = coordinates.map((c) => c.lat).join(',');
  const lon = coordinates.map((c) => c.lon).join(',');
  return (
    `${ENDPOINT}?latitude=${lat}&longitude=${lon}` +
    '&current=wind_speed_10m,wind_direction_10m&wind_speed_unit=ms'
  );
}

interface CurrentBlock {
  current?: { wind_speed_10m?: unknown; wind_direction_10m?: unknown };
}

/** Open-Meteo answers with an object for one location and an array for several. */
export function parseWindResponse(
  json: unknown,
  expected: number,
): Array<{ u: number; v: number }> {
  const blocks = (Array.isArray(json) ? json : [json]) as CurrentBlock[];
  if (blocks.length !== expected) {
    throw new Error(`Open-Meteo returned ${blocks.length} locations, expected ${expected}`);
  }
  return blocks.map((block) => {
    const speed = block.current?.wind_speed_10m;
    const direction = block.current?.wind_direction_10m;
    if (typeof speed !== 'number' || typeof direction !== 'number') return { u: 0, v: 0 };
    return windToUV(speed, direction);
  });
}

export interface WindSnapshot {
  field: WindField;
  fetchedAt: number;
}

export async function fetchWindField(http: Http, signal?: AbortSignal): Promise<WindSnapshot> {
  const field = new WindField(GRID_STEP_DEG, LAT_MIN, LAT_MAX);
  const coordinates = field.coordinates();

  const batches: LatLon[][] = [];
  for (let i = 0; i < coordinates.length; i += BATCH_SIZE) {
    batches.push(coordinates.slice(i, i + BATCH_SIZE));
  }

  let results: Array<Array<{ u: number; v: number }>>;
  try {
    results = await Promise.all(
      batches.map(async (batch, index) => {
        const json = await http.getJson<unknown>(buildUrl(batch), {
          cacheKey: `wind:${GRID_STEP_DEG}:${index}`,
          ttlMs: 30 * 60_000,
          signal,
        });
        return parseWindResponse(json, batch.length);
      }),
    );
  } catch (error) {
    if (error instanceof HttpError && error.status === 429) {
      throw new Error('Open-Meteo rate limit reached. Wait a minute and retry.', { cause: error });
    }
    throw error;
  }

  let offset = 0;
  for (const vectors of results) {
    vectors.forEach((vector, i) => field.set(offset + i, vector));
    offset += vectors.length;
  }

  const ages = batches.map((_, i) => http.cacheAge(`wind:${GRID_STEP_DEG}:${i}`) ?? 0);
  return { field, fetchedAt: Date.now() - Math.max(...ages) };
}
