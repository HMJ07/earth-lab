const utcDate = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'UTC',
  weekday: 'short',
  day: 'numeric',
  month: 'short',
  year: 'numeric',
});

const utcTime = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'UTC',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: false,
});

const utcShort = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'UTC',
  day: 'numeric',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

export const formatUtcDate = (ms: number): string => utcDate.format(ms);
export const formatUtcTime = (ms: number): string => `${utcTime.format(ms)} UTC`;
export const formatUtcShort = (ms: number): string => `${utcShort.format(ms)} UTC`;

export function formatRelative(ms: number, now: number): string {
  const diff = now - ms;
  const future = diff < 0;
  const s = Math.abs(diff) / 1000;

  let text: string;
  if (s < 60) return future ? 'in a moment' : 'just now';
  if (s < 3_600) text = `${Math.round(s / 60)} min`;
  else if (s < 48 * 3_600) text = `${Math.round(s / 3_600)} h`;
  else text = `${Math.round(s / 86_400)} d`;
  return future ? `in ${text}` : `${text} ago`;
}

export function formatCoord(lat: number, lon: number): string {
  const ns = lat >= 0 ? 'N' : 'S';
  const ew = lon >= 0 ? 'E' : 'W';
  return `${Math.abs(lat).toFixed(2)}°${ns} ${Math.abs(lon).toFixed(2)}°${ew}`;
}

export function formatNumber(value: number, digits = 0): string {
  return value.toLocaleString('en-US', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

export function formatDuration(totalMinutes: number): string {
  const h = Math.floor(totalMinutes / 60);
  const m = Math.round(totalMinutes % 60);
  return h > 0 ? `${h} h ${m} min` : `${m} min`;
}
