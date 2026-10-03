/**
 * Returns the URL when it is a plain http(s) link, otherwise null.
 * Links shown in the UI come from third-party feeds, so `javascript:`, `data:` and friends
 * must never reach an `href`.
 */
export function safeHttpUrl(value: string): string | null {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : null;
  } catch {
    return null;
  }
}
