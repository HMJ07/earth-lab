import { describe, expect, it, vi } from 'vitest';
import { Http, HttpError, type StorageLike } from '../src/core/http';

function memoryStorage(): StorageLike & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => void data.set(k, v),
  };
}

const ok = (body: string) => Promise.resolve(new Response(body, { status: 200 }));

describe('Http', () => {
  it('returns the body and caches it within the TTL', async () => {
    const fetch = vi.fn(() => ok('hello'));
    const now = vi.fn(() => 1_000);
    const http = new Http({ fetch, storage: memoryStorage(), now });

    expect(await http.getText('https://x/a', { cacheKey: 'a', ttlMs: 60_000 })).toBe('hello');
    now.mockReturnValue(30_000);
    expect(await http.getText('https://x/a', { cacheKey: 'a', ttlMs: 60_000 })).toBe('hello');
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('refetches once the TTL has expired', async () => {
    const fetch = vi
      .fn()
      .mockImplementationOnce(() => ok('one'))
      .mockImplementationOnce(() => ok('two'));
    const now = vi.fn(() => 0);
    const http = new Http({ fetch, storage: memoryStorage(), now });

    await http.getText('https://x/a', { cacheKey: 'a', ttlMs: 1_000 });
    now.mockReturnValue(5_000);
    expect(await http.getText('https://x/a', { cacheKey: 'a', ttlMs: 1_000 })).toBe('two');
  });

  it('serves a stale copy when the network fails', async () => {
    const fetch = vi
      .fn()
      .mockImplementationOnce(() => ok('cached'))
      .mockImplementationOnce(() => Promise.reject(new Error('offline')));
    const now = vi.fn(() => 0);
    const http = new Http({ fetch, storage: memoryStorage(), now });

    await http.getText('https://x/a', { cacheKey: 'a', ttlMs: 10 });
    now.mockReturnValue(1_000_000);
    expect(await http.getText('https://x/a', { cacheKey: 'a', ttlMs: 10 })).toBe('cached');
  });

  it('reads entries persisted by a previous session', async () => {
    const storage = memoryStorage();
    storage.setItem('earthlab:v1:a', JSON.stringify({ t: 0, v: 'from-disk' }));
    const fetch = vi.fn(() => ok('fresh'));
    const http = new Http({ fetch, storage, now: () => 10 });

    expect(await http.getText('https://x/a', { cacheKey: 'a', ttlMs: 1_000 })).toBe('from-disk');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('throws when the network fails and nothing is cached', async () => {
    const http = new Http({ fetch: () => Promise.reject(new Error('offline')), storage: null });
    await expect(http.getText('https://x/a')).rejects.toThrow('offline');
  });

  it('throws HttpError with the status for non-2xx responses', async () => {
    const http = new Http({
      fetch: () => Promise.resolve(new Response('no', { status: 429 })),
      storage: null,
    });
    await expect(http.getText('https://x/a')).rejects.toMatchObject({
      name: 'HttpError',
      status: 429,
    });
    await expect(http.getText('https://x/a')).rejects.toBeInstanceOf(HttpError);
    await expect(http.getText('https://api.example.com/v1/forecast?lat=1,2,3')).rejects.toThrow(
      'HTTP 429 from api.example.com',
    );
  });

  it('survives a storage that throws', async () => {
    const storage: StorageLike = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('quota');
      },
    };
    const http = new Http({ fetch: () => ok('x'), storage });
    expect(await http.getText('https://x/a', { cacheKey: 'a', ttlMs: 1 })).toBe('x');
  });

  it('times out slow requests', async () => {
    const fetch = (_url: string, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(new Error('aborted')));
      });
    const http = new Http({ fetch: fetch as unknown as typeof globalThis.fetch, storage: null });
    await expect(http.getText('https://x/slow', { timeoutMs: 20 })).rejects.toThrow('aborted');
  });

  it('parses JSON and reports cache age', async () => {
    const now = vi.fn(() => 100);
    const http = new Http({ fetch: () => ok('{"a":1}'), storage: null, now });
    expect(await http.getJson<{ a: number }>('https://x/j', { cacheKey: 'j', ttlMs: 10 })).toEqual({
      a: 1,
    });
    now.mockReturnValue(160);
    expect(http.cacheAge('j')).toBe(60);
    expect(http.cacheAge('missing')).toBeNull();
  });
});
