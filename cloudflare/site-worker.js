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

const HTML_EXTENSIONS = new Set(['.html', '.htm']);

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

function normalizePath(pathname) {
  if (pathname === '/') return '/index.html';

  const parts = pathname.split('/').filter(Boolean);
  const lang = parts[0];
  const isLanguageRoute = SUPPORTED_LANGUAGES.includes(lang);

  if (isLanguageRoute) {
    const langPath = parts.slice(1).join('/');

    if (!langPath) return `/${lang}/index.html`;

    if (langPath.endsWith('/')) {
      return `/${lang}/${langPath}index.html`;
    }

    if (!hasExtension(langPath)) {
      return `/${lang}/${langPath}.html`;
    }

    return `/${lang}/${langPath}`;
  }

  if (pathname.endsWith('/')) {
    return `${pathname}index.html`;
  }

  if (!hasExtension(pathname)) {
    return `${pathname}.html`;
  }

  return pathname;
}

async function fetchAsset(request, env, pathname) {
  const assetUrl = new URL(request.url);
  assetUrl.pathname = pathname;

  const assetRequest = new Request(assetUrl.toString(), request);
  return env.ASSETS.fetch(assetRequest);
}

async function resolveWithFallbacks(request, env, pathname) {
  const primary = await fetchAsset(request, env, pathname);
  if (primary.status !== 404) return primary;

  const indexFallback = await fetchAsset(request, env, '/index.html');
  if (indexFallback.status !== 404)
    return new Response(indexFallback.body, indexFallback);

  return primary;
}

export default {
  async fetch(request, env) {
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      return new Response('Method Not Allowed', { status: 405 });
    }

    const url = new URL(request.url);
    const normalizedPath = normalizePath(url.pathname);
    const response = await resolveWithFallbacks(request, env, normalizedPath);

    if (response.status === 404) {
      return new Response('Not Found', { status: 404 });
    }

    const responseHeaders = new Headers(response.headers);
    const ext = normalizedPath
      .slice(normalizedPath.lastIndexOf('.'))
      .toLowerCase();

    if (
      HTML_EXTENSIONS.has(ext) ||
      responseHeaders.get('Content-Type')?.includes('text/html')
    ) {
      htmlSecurityHeaders(responseHeaders);
      responseHeaders.set('Cache-Control', 'public, max-age=300');
    }

    return new Response(response.body, {
      status: response.status,
      headers: responseHeaders,
    });
  },
};
