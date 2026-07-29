const CACHE_PREFIX = 'polybool2d-';
const CACHE_NAME = `${CACHE_PREFIX}v2`;
const BASE_URL = new URL('./', self.location.href);
const INDEX_URL = new URL('index.html', BASE_URL);
const MANIFEST_URL = new URL('manifest.webmanifest', BASE_URL);
const ICON_URL = new URL('favicon.svg', BASE_URL);

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

async function precacheAppShell() {
  const cache = await caches.open(CACHE_NAME);
  const indexResponse = await fetchForCache(INDEX_URL);
  const html = await indexResponse.clone().text();
  await Promise.all([
    cache.put(BASE_URL.href, indexResponse.clone()),
    cache.put(INDEX_URL.href, indexResponse.clone()),
  ]);

  const assetUrls = new Set([MANIFEST_URL.href, ICON_URL.href]);
  const referencePattern = /\b(?:src|href)=["']([^"'#]+)["']/gi;
  for (
    let match = referencePattern.exec(html);
    match;
    match = referencePattern.exec(html)
  ) {
    try {
      const assetUrl = new URL(match[1], INDEX_URL);
      if (isScopedUrl(assetUrl)) assetUrls.add(assetUrl.href);
    } catch {
      // Ignore malformed or non-URL references in generated HTML.
    }
  }

  await Promise.all([...assetUrls].map(async (url) => {
    const response = await fetchForCache(new URL(url));
    await cache.put(url, response);
  }));
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    precacheAppShell().then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys
          .filter((key) => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME)
          .map((key) => caches.delete(key)),
      ))
      .then(() => self.clients.claim()),
  );
});

async function navigationResponse(request) {
  try {
    const response = await fetch(request);
    if (
      response.ok &&
      response.headers.get('content-type')?.includes('text/html')
    ) {
      const cache = await caches.open(CACHE_NAME);
      await Promise.all([
        cache.put(INDEX_URL.href, response.clone()),
        cache.put(BASE_URL.href, response.clone()),
      ]);
    }
    return response;
  } catch {
    return (
      await caches.match(INDEX_URL.href) ??
      await caches.match(BASE_URL.href) ??
      Response.error()
    );
  }
}

async function assetResponse(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(CACHE_NAME);
      await cache.put(request, response.clone());
    }
    return response;
  } catch {
    return Response.error();
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
