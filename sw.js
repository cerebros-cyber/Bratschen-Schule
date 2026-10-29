// Service Worker: hält die App offline verfügbar.
// Bei Änderungen an den Dateien VERSION erhöhen, damit Geräte die neue Fassung laden.
const VERSION = 'bratsche-v2';
const FILES = [
  './',
  'index.html',
  'manifest.webmanifest',
  'css/style.css',
  'js/analysis.js',
  'js/app.js',
  'js/curriculum.js',
  'js/fingering.js',
  'js/notes.js',
  'js/pitch.js',
  'js/progress.js',
  'js/songs.js',
  'js/staff.js',
  'js/synth.js',
  'fonts/Cinzel-normal.woff2',
  'fonts/EBGaramond-normal.woff2',
  'fonts/EBGaramond-italic.woff2',
  'icons/favicon-64.png',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/icon-maskable-512.png',
  'icons/apple-touch-icon.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('bratsche-') && k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

// Netzwerk zuerst (für Aktualisierungen), bei Offline-Betrieb aus dem Cache
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  e.respondWith(
    fetch(e.request.mode === 'navigate' ? new Request(e.request.url, { cache: 'no-cache' }) : new Request(e.request, { cache: 'no-cache' }))
      .then((res) => {
        if (res.ok && !url.search) {
          const copy = res.clone();
          caches.open(VERSION).then((c) => c.put(e.request, copy));
        }
        return res;
      })
      .catch(() => caches.match(e.request, { ignoreSearch: true }).then((r) => r || caches.match('./'))),
  );
});
