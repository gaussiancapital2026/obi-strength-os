/* OBI Strength OS service worker — offline app shell.
 * Workout data lives in IndexedDB and is never read, written or deleted here.
 * The build (vite.config.ts → precacheManifest) replaces the three placeholders below with the real version,
 * a hash of this build's files, and the list of every emitted file (hashed JS/CSS, index.html, icons, manifest).
 */
const VERSION = '3.29.1';
const BUILD = 'ec568abbbb80';
const PRECACHE = ["./","./assets/index-BZKMan3n.js","./assets/index-DHJKFUeS.css","./icon-180.png","./icon-192.png","./icon-512.png","./icon.svg","./index.html","./manifest.webmanifest"];

// Cache names are namespaced by app AND scope path, so another app (or another copy of this app) on the same
// origin — e.g. a different GitHub Pages project — is never touched.
const PREFIX = 'obi-strength-os|';
const SCOPE = new URL(self.registration.scope).pathname;
const CACHE = `${PREFIX}${SCOPE}|${VERSION}|${BUILD}`;
const ours = name => name.startsWith(`${PREFIX}${SCOPE}|`);
const PRECACHE_URLS = new Set(PRECACHE.map(p => new URL(p, self.registration.scope).href));
const INDEX = new URL('./index.html', self.registration.scope).href;

// Remove only OLDER caches of this app in this scope. Other apps' caches and the page's IndexedDB are untouched.
const dropOldCaches = () => caches.keys().then(keys => Promise.all(keys.filter(k => ours(k) && k !== CACHE).map(k => caches.delete(k))));

self.addEventListener('install', event => {
  // Fetch every file fresh (bypassing the HTTP cache) so the precache matches this exact build. Old caches are
  // dropped only AFTER the new one is complete; if any file fails, install fails and the old version keeps working.
  event.waitUntil(caches.open(CACHE)
    .then(c => c.addAll(PRECACHE.map(p => new Request(new URL(p, self.registration.scope).href, { cache: 'reload' }))))
    .then(dropOldCaches)
    .then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  event.waitUntil(dropOldCaches().then(() => self.clients.claim()));
});

self.addEventListener('fetch', event => {
  const req = event.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== self.location.origin) return; // Google APIs, YouTube, photos: network only
  if (!url.pathname.startsWith(SCOPE)) return;

  if (req.mode === 'navigate') {
    // Network first so a new deploy is picked up; offline → the precached app shell.
    event.respondWith(fetch(req).catch(() => caches.open(CACHE).then(c => c.match(INDEX)).then(r => r || offlineResponse('text/html'))));
    return;
  }
  if (PRECACHE_URLS.has(url.href)) {
    // Hashed build files never change: cache first.
    event.respondWith(caches.open(CACHE).then(c => c.match(url.href)).then(r => r || fetch(req)));
    return;
  }
  // Anything else on our path: network, falling back to a cached copy of the SAME url. Never index.html for a
  // script/style/image request — a failed JS file must fail as JS, not be answered with HTML.
  event.respondWith(fetch(req).then(res => {
    if (res.ok && res.type === 'basic') { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); }
    return res;
  }).catch(() => caches.open(CACHE).then(c => c.match(req)).then(r => r || offlineResponse(null))));
});

function offlineResponse(type) {
  return new Response(type === 'text/html' ? '<!doctype html><title>Offline</title><p>Offline and this page is not cached yet.</p>' : '',
    { status: 504, statusText: 'Offline', headers: type ? { 'Content-Type': type } : {} });
}
