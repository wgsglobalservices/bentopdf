/**
 * BentoPDF Static Site Worker
 *
 * Deploys BentoPDF as a Cloudflare Worker with static asset binding.
 *
 * Routes supported:
 * - /                    -> /index.html
 * - /about               -> /about.html
 * - /fr/                 -> /fr/index.html
 * - /fr/about            -> /fr/about.html
 *
 * It also injects SharedArrayBuffer-required security headers for every HTML page.
 */

const SUPPORTED_LANGUAGES = [
  'en',
  'ar',
  'be',
  'da',
  'de',
  'es',
  'fr',
  'id',
  'it',
  'nl',
  'pt',
  'tr',
  'vi',
  'zh',
  'zh-TW',
];

function hasExtension(pathname) {
  const lastSegment = pathname.split('/').pop() || '';
  return lastSegment.includes('.');
}

function htmlSecurityHeaders(headers) {
  headers.set('Cross-Origin-Embedder-Policy', 'require-corp');
  headers.set('Cross-Origin-Opener-Policy', 'same-origin');
  headers.set('Cross-Origin-Resource-Policy', 'cross-origin');
  return headers;
}

function isNavigationRequest(request) {
  const secFetchDest = request.headers.get('sec-fetch-dest');
  if (secFetchDest === 'document') return true;

  const accept = request.headers.get('accept') || '';
  return accept.includes('text/html');
}

function makeHtmlCandidatePaths(pathname) {
  if (pathname === '/') return ['/index.html'];

  const trimmedPath = pathname.endsWith('/')
    ? pathname.slice(0, -1) || '/'
    : pathname;

  const parts = trimmedPath.split('/').filter(Boolean);
  const maybeLang = parts[0];
  const restParts = SUPPORTED_LANGUAGES.includes(maybeLang)
    ? parts.slice(1)
    : parts;

  const base = SUPPORTED_LANGUAGES.includes(maybeLang) ? `/${maybeLang}` : '';

  if (restParts.length === 0) {
    return base ? [`${base}/index.html`] : ['/index.html'];
  }

  const restPath = restParts.join('/');
  return [`${base}/${restPath}.html`, `${base}/${restPath}/index.html`];
}

async function fetchAsset(request, env, pathname) {
  const assetUrl = new URL(request.url);
  assetUrl.pathname = pathname;

  const assetRequest = new Request(assetUrl.toString(), request);
  return env.ASSETS.fetch(assetRequest);
}

async function resolveRequest(request, env) {
  const url = new URL(request.url);
  const pathname = url.pathname;

  if (hasExtension(pathname)) {
    return fetchAsset(request, env, pathname);
  }

  const htmlCandidates = makeHtmlCandidatePaths(pathname);
  for (const candidate of htmlCandidates) {
    const response = await fetchAsset(request, env, candidate);
    if (response.status !== 404) {
      return response;
    }
  }

  if (isNavigationRequest(request)) {
    const spaFallback = await fetchAsset(request, env, '/index.html');
    if (spaFallback.status !== 404) {
      return new Response(spaFallback.body, spaFallback);
    }
  }

  const notFoundPage = await fetchAsset(request, env, '/404.html');
  if (notFoundPage.status !== 404) {
    return new Response(notFoundPage.body, {
      status: 404,
      headers: notFoundPage.headers,
    });
  }

  return new Response('Not Found', { status: 404 });
}

function withSecurityHeaders(response) {
  const responseHeaders = new Headers(response.headers);
  const contentType = responseHeaders.get('Content-Type') || '';

  if (contentType.includes('text/html')) {
    htmlSecurityHeaders(responseHeaders);
    responseHeaders.set('Cache-Control', 'public, max-age=300');
  }

  return new Response(response.body, {
    status: response.status,
    headers: responseHeaders,
  });
}

export default {
  async fetch(request, env) {
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      return new Response('Method Not Allowed', { status: 405 });
    }

    const response = await resolveRequest(request, env);
    return withSecurityHeaders(response);
  },
};

export {
  hasExtension,
  isNavigationRequest,
  makeHtmlCandidatePaths,
  resolveRequest,
  withSecurityHeaders,
};
