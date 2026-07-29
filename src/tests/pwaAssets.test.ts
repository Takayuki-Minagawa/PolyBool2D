import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { runInNewContext } from 'node:vm';
import { describe, expect, it, vi } from 'vitest';
import {
  collectPrecachePaths,
  createPwaGeneration,
  renderServiceWorker,
} from '../../build/pwaServiceWorker';

const TEST_BUILD_ID = 'test-build';
const TEST_CACHE_PREFIX = 'polybool2d-%2Frepo%2F-';
const TEST_APP_CACHE = `${TEST_CACHE_PREFIX}app-${TEST_BUILD_ID}`;
const TEST_RUNTIME_CACHE = `${TEST_CACHE_PREFIX}runtime-${TEST_BUILD_ID}`;
const TEST_OLD_APP_CACHE = `${TEST_CACHE_PREFIX}app-old`;
const TEST_OLD_RUNTIME_CACHE = `${TEST_CACHE_PREFIX}runtime-old`;
const OTHER_SCOPE_CACHE = 'polybool2d-%2Fother%2F-app-old';
const TEST_PRECACHE_PATHS = [
  'index.html',
  'assets/app-123.js',
  'assets/manual.en-test.md',
  'assets/manual.ja-test.md',
  'manifest.webmanifest',
  'favicon.svg',
];

class FakeHeaders {
  constructor(private readonly values: Record<string, string> = {}) {}

  has(name: string): boolean {
    return name.toLowerCase() in this.values;
  }

  get(name: string): string | null {
    return this.values[name.toLowerCase()] ?? null;
  }
}

class FakeRequest {
  readonly url: string;
  readonly method: string;
  readonly mode: string;
  readonly headers: FakeHeaders;

  constructor(input: string | URL | FakeRequest, init: {
    method?: string;
    mode?: string;
    headers?: FakeHeaders;
  } = {}) {
    this.url = input instanceof FakeRequest
      ? input.url
      : input instanceof URL
        ? input.href
        : input;
    this.method = init.method ?? 'GET';
    this.mode = init.mode ?? 'same-origin';
    this.headers = init.headers ?? new FakeHeaders();
  }
}

class FakeResponse {
  readonly ok: boolean;
  readonly status: number;
  readonly headers: FakeHeaders;

  constructor(
    private readonly body: string,
    options: { status?: number; contentType?: string } = {},
  ) {
    this.status = options.status ?? 200;
    this.ok = this.status >= 200 && this.status < 300;
    this.headers = new FakeHeaders(
      options.contentType
        ? { 'content-type': options.contentType }
        : {},
    );
  }

  clone(): FakeResponse {
    return new FakeResponse(this.body, {
      status: this.status,
      contentType: this.headers.get('content-type') ?? undefined,
    });
  }

  async text(): Promise<string> {
    return this.body;
  }

  static error(): FakeResponse {
    return new FakeResponse('', { status: 500 });
  }
}

function serviceWorkerHarness() {
  const listeners = new Map<string, (event: {
    request: FakeRequest;
    waitUntil: (promise: Promise<unknown>) => void;
    respondWith: (promise: Promise<unknown>) => void;
  }) => void>();
  const puts: Array<string | FakeRequest> = [];
  const fallback = new FakeResponse('offline', { contentType: 'text/html' });
  const cache = {
    put: vi.fn(async (request: string | FakeRequest) => {
      puts.push(request);
    }),
    match: vi.fn(async () => fallback),
  };
  const caches = {
    open: vi.fn(async () => cache),
    keys: vi.fn(async () => [] as string[]),
    delete: vi.fn(async () => true),
  };
  const fetch = vi.fn(async (request: FakeRequest) => {
    if (request.url.endsWith('/index.html')) {
      return new FakeResponse(
        '<script type="module" src="/repo/assets/app-123.js"></script>',
        { contentType: 'text/html' },
      );
    }
    return new FakeResponse('asset');
  });
  const self = {
    location: {
      href: 'https://example.test/repo/sw.js',
    },
    clients: { claim: vi.fn(async () => undefined) },
    skipWaiting: vi.fn(async () => undefined),
    addEventListener: (
      type: string,
      listener: (typeof listeners extends Map<string, infer T> ? T : never),
    ) => listeners.set(type, listener),
  };
  const template = readFileSync(
    resolve(process.cwd(), 'src/pwa/serviceWorker.js'),
    'utf8',
  );
  const source = renderServiceWorker(
    template,
    TEST_BUILD_ID,
    TEST_PRECACHE_PATHS,
  );
  runInNewContext(source, {
    self,
    caches,
    fetch,
    URL,
    Request: FakeRequest,
    Response: FakeResponse,
  });
  return { cache, caches, fallback, fetch, listeners, puts, self };
}

describe('PWA assets', () => {
  it('derives deterministic generations and includes manual assets', () => {
    const template = readFileSync(
      resolve(process.cwd(), 'src/pwa/serviceWorker.js'),
      'utf8',
    );
    const assets = [
      { path: 'index.html', source: '<html />' },
      { path: 'assets/manual.en-a.md', source: 'English' },
      { path: 'assets/manual.ja-b.md', source: '日本語' },
    ];

    expect(createPwaGeneration(template, assets)).toBe(
      createPwaGeneration(template, [...assets].reverse()),
    );
    expect(createPwaGeneration(template, assets)).not.toBe(
      createPwaGeneration(template, [
        ...assets.slice(0, -1),
        { path: 'assets/manual.ja-b.md', source: '更新' },
      ]),
    );
    expect(collectPrecachePaths(
      assets.map(({ path }) => path),
      ['manifest.webmanifest', 'favicon.svg', 'sw.js'],
    )).toEqual([
      'assets/manual.en-a.md',
      'assets/manual.ja-b.md',
      'favicon.svg',
      'index.html',
      'manifest.webmanifest',
    ]);
  });

  it('keeps manifest navigation fields relative to its deployment directory', () => {
    const manifest = JSON.parse(readFileSync(
      resolve(process.cwd(), 'public/manifest.webmanifest'),
      'utf8',
    )) as {
      id: string;
      start_url: string;
      scope: string;
      icons: Array<{ src: string }>;
    };
    expect(manifest.id).toBe('./');
    expect(manifest.start_url).toBe('./');
    expect(manifest.scope).toBe('./');
    expect(manifest.icons[0].src).toBe('./favicon.svg');
  });

  it('precaches generated assets relative to a subpath service worker', async () => {
    const harness = serviceWorkerHarness();
    let installPromise: Promise<unknown> | undefined;
    harness.listeners.get('install')!({
      request: new FakeRequest('https://example.test/repo/'),
      waitUntil: (promise) => {
        installPromise = promise;
      },
      respondWith: () => undefined,
    });
    await installPromise;

    expect(harness.fetch.mock.calls.map(([request]) => request.url)).toEqual(
      expect.arrayContaining([
        'https://example.test/repo/index.html',
        'https://example.test/repo/assets/app-123.js',
        'https://example.test/repo/assets/manual.en-test.md',
        'https://example.test/repo/assets/manual.ja-test.md',
        'https://example.test/repo/manifest.webmanifest',
        'https://example.test/repo/favicon.svg',
      ]),
    );
    expect(harness.puts).toContain('https://example.test/repo/');
    expect(harness.puts).toContain('https://example.test/repo/index.html');
    expect(harness.self.skipWaiting).not.toHaveBeenCalled();
  });

  it('keeps old caches when installing a new shell fails', async () => {
    const harness = serviceWorkerHarness();
    harness.caches.keys.mockResolvedValue([
      TEST_OLD_APP_CACHE,
      TEST_OLD_RUNTIME_CACHE,
    ]);
    harness.fetch.mockImplementation(async (request) => {
      if (request.url.endsWith('/assets/manual.ja-test.md')) {
        throw new Error('offline');
      }
      return new FakeResponse('asset');
    });
    let installPromise: Promise<unknown> | undefined;
    harness.listeners.get('install')!({
      request: new FakeRequest('https://example.test/repo/'),
      waitUntil: (promise) => {
        installPromise = promise;
      },
      respondWith: () => undefined,
    });

    await expect(installPromise).rejects.toThrow('offline');
    expect(harness.caches.delete).not.toHaveBeenCalledWith(
      TEST_OLD_APP_CACHE,
    );
    expect(harness.caches.delete).not.toHaveBeenCalledWith(
      TEST_OLD_RUNTIME_CACHE,
    );
    expect(harness.self.clients.claim).not.toHaveBeenCalled();
  });

  it('deletes old caches only after a complete shell activates', async () => {
    const harness = serviceWorkerHarness();
    harness.caches.keys.mockResolvedValue([
      TEST_OLD_APP_CACHE,
      TEST_OLD_RUNTIME_CACHE,
      TEST_APP_CACHE,
      TEST_RUNTIME_CACHE,
      OTHER_SCOPE_CACHE,
    ]);
    let installPromise: Promise<unknown> | undefined;
    harness.listeners.get('install')!({
      request: new FakeRequest('https://example.test/repo/'),
      waitUntil: (promise) => {
        installPromise = promise;
      },
      respondWith: () => undefined,
    });
    await installPromise;
    expect(harness.caches.delete).not.toHaveBeenCalledWith(
      TEST_OLD_APP_CACHE,
    );
    harness.caches.delete.mockClear();

    let activatePromise: Promise<unknown> | undefined;
    harness.listeners.get('activate')!({
      request: new FakeRequest('https://example.test/repo/'),
      waitUntil: (promise) => {
        activatePromise = promise;
      },
      respondWith: () => undefined,
    });
    await activatePromise;

    expect(harness.caches.delete).toHaveBeenCalledWith(TEST_OLD_APP_CACHE);
    expect(harness.caches.delete).toHaveBeenCalledWith(
      TEST_OLD_RUNTIME_CACHE,
    );
    expect(harness.caches.delete).not.toHaveBeenCalledWith(
      TEST_APP_CACHE,
    );
    expect(harness.caches.delete).not.toHaveBeenCalledWith(OTHER_SCOPE_CACHE);
    expect(harness.self.clients.claim).toHaveBeenCalledOnce();
  });

  it('removes only the new cache when a cache write fails', async () => {
    const harness = serviceWorkerHarness();
    harness.caches.keys.mockResolvedValue([
      TEST_OLD_APP_CACHE,
      OTHER_SCOPE_CACHE,
    ]);
    harness.cache.put.mockRejectedValueOnce(new Error('quota exceeded'));
    let installPromise: Promise<unknown> | undefined;
    harness.listeners.get('install')!({
      request: new FakeRequest('https://example.test/repo/'),
      waitUntil: (promise) => {
        installPromise = promise;
      },
      respondWith: () => undefined,
    });

    await expect(installPromise).rejects.toThrow('quota exceeded');
    expect(harness.caches.delete).toHaveBeenCalledWith(
      TEST_APP_CACHE,
    );
    expect(harness.caches.delete).not.toHaveBeenCalledWith(
      TEST_OLD_APP_CACHE,
    );
    expect(harness.caches.delete).not.toHaveBeenCalledWith(OTHER_SCOPE_CACHE);
  });

  it('uses the cached subpath index when an offline navigation fails', async () => {
    const harness = serviceWorkerHarness();
    harness.fetch.mockRejectedValueOnce(new Error('offline'));
    let responsePromise: Promise<unknown> | undefined;
    harness.listeners.get('fetch')!({
      request: new FakeRequest('https://example.test/repo/project', {
        mode: 'navigate',
      }),
      waitUntil: () => undefined,
      respondWith: (promise) => {
        responsePromise = promise;
      },
    });

    await expect(responsePromise).resolves.toBe(harness.fallback);
    expect(harness.cache.match).toHaveBeenCalledWith(
      'https://example.test/repo/index.html',
    );
  });

  it('does not overwrite the shell cache with online navigation HTML', async () => {
    const harness = serviceWorkerHarness();
    let responsePromise: Promise<unknown> | undefined;
    harness.listeners.get('fetch')!({
      request: new FakeRequest('https://example.test/repo/project', {
        mode: 'navigate',
      }),
      waitUntil: () => undefined,
      respondWith: (promise) => {
        responsePromise = promise;
      },
    });

    await expect(responsePromise).resolves.not.toBe(harness.fallback);
    expect(harness.cache.put).not.toHaveBeenCalled();
  });

  it('refreshes assets from the network and falls back to cache offline', async () => {
    const online = serviceWorkerHarness();
    let onlineResponse: Promise<unknown> | undefined;
    const request = new FakeRequest('https://example.test/repo/favicon.svg');
    online.listeners.get('fetch')!({
      request,
      waitUntil: () => undefined,
      respondWith: (promise) => {
        onlineResponse = promise;
      },
    });

    await expect(onlineResponse).resolves.not.toBe(online.fallback);
    expect(online.fetch).toHaveBeenCalledWith(request);
    expect(online.cache.put).toHaveBeenCalledWith(
      request,
      expect.any(FakeResponse),
    );

    const offline = serviceWorkerHarness();
    offline.fetch.mockRejectedValueOnce(new Error('offline'));
    let offlineResponse: Promise<unknown> | undefined;
    offline.listeners.get('fetch')!({
      request,
      waitUntil: () => undefined,
      respondWith: (promise) => {
        offlineResponse = promise;
      },
    });
    await expect(offlineResponse).resolves.toBe(offline.fallback);
    expect(offline.cache.match).toHaveBeenCalledWith(request);
  });
});
