import type { Http } from '../../core/http';

export interface SatelliteGroup {
  id: string;
  label: string;
  hint: string;
  color: string;
  /** Marker size in px. */
  size: number;
  defaultOn: boolean;
}

export const SATELLITE_GROUPS: readonly SatelliteGroup[] = [
  {
    id: 'stations',
    label: 'Space stations',
    hint: 'ISS, Tiangong',
    color: '#ffd166',
    size: 9,
    defaultOn: true,
  },
  {
    id: 'visual',
    label: 'Brightest',
    hint: '~160 visible to the eye',
    color: '#f1f5f9',
    size: 5,
    defaultOn: true,
  },
  {
    id: 'gps-ops',
    label: 'GPS',
    hint: '~30 navigation satellites',
    color: '#80ed99',
    size: 5,
    defaultOn: true,
  },
  {
    id: 'weather',
    label: 'Weather',
    hint: 'NOAA, Meteosat, GOES…',
    color: '#4cc9f0',
    size: 5,
    defaultOn: false,
  },
  {
    id: 'starlink',
    label: 'Starlink',
    hint: '~9 000 · heavy, may stutter',
    color: '#c77dff',
    size: 3,
    defaultOn: false,
  },
];

export interface TleRecord {
  name: string;
  line1: string;
  line2: string;
  noradId: string;
  /** TLE epoch, ms since Unix epoch. */
  epochMs: number;
  inclinationDeg: number;
  /** Revolutions per day. */
  meanMotion: number;
}

/** Epoch of a TLE: two-digit year + fractional day-of-year (cols 19-32 of line 1). */
export function tleEpochMs(line1: string): number {
  const yy = Number(line1.slice(18, 20));
  const day = Number(line1.slice(20, 32));
  const year = yy < 57 ? 2000 + yy : 1900 + yy;
  return Date.UTC(year, 0, 1) + (day - 1) * 86_400_000;
}

/** Parses the classic 3-line TLE format. Incomplete or malformed triplets are skipped. */
export function parseTle(text: string): TleRecord[] {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trimEnd())
    .filter((l) => l.length > 0);

  const records: TleRecord[] = [];
  for (let i = 0; i + 2 < lines.length; i++) {
    const [name, l1, l2] = [lines[i]!, lines[i + 1]!, lines[i + 2]!];
    if (!l1.startsWith('1 ') || !l2.startsWith('2 ') || l1.length < 64 || l2.length < 68) continue;

    const epochMs = tleEpochMs(l1);
    const meanMotion = Number(l2.slice(52, 63));
    const inclinationDeg = Number(l2.slice(8, 16));
    if (
      !Number.isFinite(epochMs) ||
      !Number.isFinite(meanMotion) ||
      !Number.isFinite(inclinationDeg)
    ) {
      continue;
    }

    records.push({
      name: name.replace(/^0 /, '').trim(),
      line1: l1,
      line2: l2,
      noradId: l1.slice(2, 7).trim(),
      epochMs,
      inclinationDeg,
      meanMotion,
    });
    i += 2;
  }
  return records;
}

export async function fetchTleGroup(
  http: Http,
  group: string,
  signal?: AbortSignal,
): Promise<TleRecord[]> {
  // CelesTrak refreshes its data every ~2 hours and asks clients not to poll more often.
  const url = `https://celestrak.org/NORAD/elements/gp.php?GROUP=${encodeURIComponent(group)}&FORMAT=tle`;
  const text = await http.getText(url, {
    cacheKey: `tle:${group}`,
    ttlMs: 2 * 3_600_000,
    timeoutMs: 45_000,
    signal,
  });
  const records = parseTle(text);
  if (records.length === 0) throw new Error(`CelesTrak returned no satellites for "${group}"`);
  return records;
}
