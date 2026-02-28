import test from 'node:test';
import assert from 'node:assert/strict';
import {
  makeHtmlCandidatePaths,
  resolveRequest,
  withSecurityHeaders,
} from './site-worker.js';

function makeEnv(routes) {
  return {
    ASSETS: {
      async fetch(request) {
        const path = new URL(request.url).pathname;
        const hit = routes[path];
        if (!hit) {
          return new Response('missing', { status: 404 });
        }
        return new Response(hit.body || '', {
          status: hit.status || 200,
          headers: hit.headers || {},
        });
      },
    },
  };
}

test('builds language and root html candidate paths correctly', () => {
  assert.deepEqual(makeHtmlCandidatePaths('/'), ['/index.html']);
  assert.deepEqual(makeHtmlCandidatePaths('/about'), [
    '/about.html',
    '/about/index.html',
  ]);
  assert.deepEqual(makeHtmlCandidatePaths('/fr'), [
    '/fr/index.html',
    '/index.html',
  ]);
  assert.deepEqual(makeHtmlCandidatePaths('/fr/about'), [
    '/fr/about.html',
    '/fr/about/index.html',
    '/about.html',
    '/about/index.html',
  ]);
});

test('does not fall back to index for missing static assets with extension', async () => {
  const env = makeEnv({
    '/index.html': { body: 'index', headers: { 'Content-Type': 'text/html' } },
  });
  const request = new Request('https://example.com/assets/app.js', {
    headers: { accept: '*/*' },
  });

  const response = await resolveRequest(request, env);
  assert.equal(response.status, 404);
});

test('falls back to english page when localized html is missing', async () => {
  const env = makeEnv({
    '/about.html': {
      body: 'about-en',
      headers: { 'Content-Type': 'text/html' },
    },
  });

  const request = new Request('https://example.com/fr/about', {
    headers: { accept: 'text/html' },
  });

  const response = await resolveRequest(request, env);
  assert.equal(response.status, 200);
  assert.equal(await response.text(), 'about-en');
});

test('falls back to index for navigation requests only', async () => {
  const env = makeEnv({
    '/index.html': { body: 'index', headers: { 'Content-Type': 'text/html' } },
  });

  const navRequest = new Request('https://example.com/unknown-route', {
    headers: { accept: 'text/html' },
  });

  const apiRequest = new Request('https://example.com/unknown-route', {
    headers: { accept: 'application/json' },
  });

  const navResponse = await resolveRequest(navRequest, env);
  const apiResponse = await resolveRequest(apiRequest, env);

  assert.equal(navResponse.status, 200);
  assert.equal(await navResponse.text(), 'index');
  assert.equal(apiResponse.status, 404);
});

test('injects COEP/COOP/CORP headers for html responses', async () => {
  const response = new Response('<html></html>', {
    status: 200,
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  });

  const secured = withSecurityHeaders(response);

  assert.equal(
    secured.headers.get('Cross-Origin-Embedder-Policy'),
    'require-corp'
  );
  assert.equal(
    secured.headers.get('Cross-Origin-Opener-Policy'),
    'same-origin'
  );
  assert.equal(
    secured.headers.get('Cross-Origin-Resource-Policy'),
    'cross-origin'
  );
});
