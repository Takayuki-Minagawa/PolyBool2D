const BUILD_ID = __POLYBOOL_BUILD_ID__;
const PRECACHE_PATHS = __POLYBOOL_PRECACHE_PATHS__;
const BASE_URL = new URL('./', self.location.href);
const CACHE_PREFIX = `polybool2d-${encodeURIComponent(BASE_URL.pathname)}-`;
const APP_CACHE_NAME = `${CACHE_PREFIX}app-${BUILD_ID}`;
const RUNTIME_CACHE_NAME = `${CACHE_PREFIX}runtime-${BUILD_ID}`;
const INDEX_URL = new URL('index.html', BASE_URL);

function isScopedUrl(url) {
  return (
    url.origin === BASE_URL.origin &&
    url.pathname.startsWith(BASE_URL.pathname)
  );
}

async function fetchForCache(url) {
  const response = await fetch(new Request(url, { cache: 'reload' }));
  if (!response.ok) {
    throw new Error(`Unable to precache ${url.href}: ${response.status}`);
  }
  return response;
}

function rejectionFrom(results) {
  return results.find((result) => result.status === 'rejected');
}

async function precacheAppShell() {
  await caches.delete(APP_CACHE_NAME);
  try {
    const fetchResults = await Promise.allSettled(
      PRECACHE_PATHS.map(async (path) => {
        const url = new URL(path, BASE_URL);
        if (!isScopedUrl(url)) {
          throw new Error(`Precache URL is outside the app scope: ${url.href}`);
        }
        return {
          url,
          response: await fetchForCache(url),
        };
      }),
    );
    const fetchFailure = rejectionFrom(fetchResults);
    if (fetchFailure) throw fetchFailure.reason;
    const entries = fetchResults.map((result) => result.value);
    const indexEntry = entries.find(
      ({ url }) => url.href === INDEX_URL.href,
    );
    if (!indexEntry) {
      throw new Error('The app-shell precache is missing index.html.');
    }

    const cache = await caches.open(APP_CACHE_NAME);
    const assetWriteResults = await Promise.allSettled(
      entries
        .filter(({ url }) => url.href !== INDEX_URL.href)
        .map(({ url, response }) => cache.put(url.href, response.clone())),
    );
    const assetWriteFailure = rejectionFrom(assetWriteResults);
    if (assetWriteFailure) throw assetWriteFailure.reason;

    const indexWriteResults = await Promise.allSettled([
      cache.put(INDEX_URL.href, indexEntry.response.clone()),
      cache.put(BASE_URL.href, indexEntry.response.clone()),
    ]);
    const indexWriteFailure = rejectionFrom(indexWriteResults);
    if (indexWriteFailure) throw indexWriteFailure.reason;
  } catch (error) {
    await caches.delete(APP_CACHE_NAME);
    throw error;
  }
}

self.addEventListener('install', (event) => {
  event.waitUntil(precacheAppShell());
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys
          .filter(
            (key) =>
              key.startsWith(CACHE_PREFIX) &&
              key !== APP_CACHE_NAME &&
              key !== RUNTIME_CACHE_NAME,
          )
          .map((key) => caches.delete(key)),
      ))
      .then(() => self.clients.claim()),
  );
});

async function matchFromCurrentCaches(request) {
  const runtimeCache = await caches.open(RUNTIME_CACHE_NAME);
  const runtimeResponse = await runtimeCache.match(request);
  if (runtimeResponse) return runtimeResponse;
  const appCache = await caches.open(APP_CACHE_NAME);
  return appCache.match(request);
}

async function navigationResponse(request) {
  try {
    return await fetch(request);
  } catch {
    return (
      await matchFromCurrentCaches(INDEX_URL.href) ??
      await matchFromCurrentCaches(BASE_URL.href) ??
      Response.error()
    );
  }
}

async function assetResponse(request) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      try {
        const cache = await caches.open(RUNTIME_CACHE_NAME);
        await cache.put(request, response.clone());
      } catch {
        // A cache write failure must not hide a valid network response.
      }
      return response;
    }
    return await matchFromCurrentCaches(request) ?? response;
  } catch {
    return await matchFromCurrentCaches(request) ?? Response.error();
  }
}

self.addEventListener('fetch', (event) => {
  if (
    event.request.method !== 'GET' ||
    event.request.headers.has('range')
  ) return;
  const requestUrl = new URL(event.request.url);
  if (!isScopedUrl(requestUrl)) return;

  event.respondWith(
    event.request.mode === 'navigate'
      ? navigationResponse(event.request)
      : assetResponse(event.request),
  );
});
