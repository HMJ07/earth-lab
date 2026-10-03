export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export interface HttpOptions {
  /** Cache key. Without it the request is never cached. */
  cacheKey?: string;
  /** How long a cached body counts as fresh. */
  ttlMs?: number;
  timeoutMs?: number;
  signal?: AbortSignal;
}

export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly url: string,
  ) {
    // Only the host goes in the message: full URLs (long coordinate lists) are noise for users.
    super(`HTTP ${status} from ${hostOf(url)}`);
    this.name = 'HttpError';
  }
}

function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

interface HttpDeps {
  fetch?: typeof fetch;
  storage?: StorageLike | null;
  now?: () => number;
}

interface CacheEntry {
  t: number;
  v: string;
}

const KEY_PREFIX = 'earthlab:v1:';

/**
 * A small fetch wrapper with timeout, an in-memory + localStorage cache and
 * stale-on-error fallback: if the network fails but we have an old copy, we use it.
 * Public data APIs are rate limited and flaky; the app should survive both.
 */
export class Http {
  private readonly fetchFn: typeof fetch;
  private readonly storage: StorageLike | null;
  private readonly now: () => number;
  private readonly memory = new Map<string, CacheEntry>();

  constructor(deps: HttpDeps = {}) {
    this.fetchFn = deps.fetch ?? ((...args) => globalThis.fetch(...args));
    this.storage = deps.storage === undefined ? safeLocalStorage() : deps.storage;
    this.now = deps.now ?? Date.now;
  }

  async getText(url: string, options: HttpOptions = {}): Promise<string> {
    const { cacheKey, ttlMs = 0, timeoutMs = 20_000, signal } = options;
    const cached = cacheKey ? this.readCache(cacheKey) : null;
    if (cached && this.now() - cached.t < ttlMs) return cached.v;

    try {
      const body = await this.fetchWithTimeout(url, timeoutMs, signal);
      if (cacheKey) this.writeCache(cacheKey, body);
      return body;
    } catch (error) {
      if (signal?.aborted) throw error;
      if (cached) return cached.v;
      throw error;
    }
  }

  async getJson<T>(url: string, options: HttpOptions = {}): Promise<T> {
    return JSON.parse(await this.getText(url, options)) as T;
  }

  /** Age in ms of the cached copy, or null when nothing is cached. */
  cacheAge(cacheKey: string): number | null {
    const entry = this.readCache(cacheKey);
    return entry ? this.now() - entry.t : null;
  }

  private async fetchWithTimeout(
    url: string,
    timeoutMs: number,
    external?: AbortSignal,
  ): Promise<string> {
    const controller = new AbortController();
    const timer = setTimeout(
      () => controller.abort(new Error(`Timeout after ${timeoutMs} ms`)),
      timeoutMs,
    );
    const onAbort = () => controller.abort(external?.reason);
    external?.addEventListener('abort', onAbort, { once: true });
    try {
      const response = await this.fetchFn(url, { signal: controller.signal });
      if (!response.ok) throw new HttpError(response.status, url);
      return await response.text();
    } finally {
      clearTimeout(timer);
      external?.removeEventListener('abort', onAbort);
    }
  }

  private readCache(key: string): CacheEntry | null {
    const fullKey = KEY_PREFIX + key;
    const inMemory = this.memory.get(fullKey);
    if (inMemory) return inMemory;
    try {
      const raw = this.storage?.getItem(fullKey);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as CacheEntry;
      if (typeof parsed.t !== 'number' || typeof parsed.v !== 'string') return null;
      this.memory.set(fullKey, parsed);
      return parsed;
    } catch {
      return null;
    }
  }

  private writeCache(key: string, value: string): void {
    const fullKey = KEY_PREFIX + key;
    const entry: CacheEntry = { t: this.now(), v: value };
    this.memory.set(fullKey, entry);
    try {
      this.storage?.setItem(fullKey, JSON.stringify(entry));
    } catch {
      // Quota exceeded or storage disabled: the in-memory copy is enough.
    }
  }
}

function safeLocalStorage(): StorageLike | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

export const http = new Http();
