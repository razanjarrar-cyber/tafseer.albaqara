// يعمل التطبيق دون اتصال: الواجهة وبيانات الآيات وصفحات المصحف تُخزَّن عند أول فتح
const V = 'tafseer-v4';
const SHELL = ['./', 'index.html', 'style.css', 'app.js', 'manifest.webmanifest', 'data/ayat.json', 'icons/icon-192.png', 'icons/icon-512.png'];
self.addEventListener('install', e => { e.waitUntil(caches.open(V).then(c => c.addAll(SHELL))); self.skipWaiting(); });
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== V && k !== 'tafseer-offline').map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const req = e.request; if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (req.headers.has('range') || /\.(m4a|mp3|mp4|aac|ogg|wav)$/i.test(url.pathname) || url.hostname.includes('firebasestorage') || url.hostname.includes('googleapis.com') && !url.hostname.startsWith('fonts')) return; // audio & firebase: network
  const cacheFirst = url.pathname.includes('/pages/') || url.hostname.startsWith('fonts.');
  if (cacheFirst) {
    e.respondWith(caches.match(req).then(r => r || fetch(req).then(res => { const cp = res.clone(); caches.open(V).then(c => c.put(req, cp)); return res; })));
  } else if (url.origin === location.origin) {
    // network first so new recordings / updates appear, cache as fallback
    e.respondWith(fetch(req).then(res => { const cp = res.clone(); caches.open(V).then(c => c.put(req, cp)); return res; }).catch(() => caches.match(req)));
  }
});
