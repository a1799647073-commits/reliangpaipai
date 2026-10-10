// 热量拍拍 · Service Worker
// 缓存核心静态资源，使 PWA 可离线打开、加快二次加载。
const CACHE = 'heat-tracking-v1';
const CORE = [
  './',
  './index.html',
  './styles.css',
  './api.js',
  './mock.js',
  './manifest.webmanifest',
  './icons/icon-512.jpg'
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(CORE)).catch(() => {})
  );
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// 网络优先，失败回退缓存；仅处理同源 GET（识别接口走不到时也自然回退）
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;
  if (url.pathname.startsWith('/api/')) return;

  e.respondWith(
    fetch(req).then((res) => {
      const copy = res.clone();
      caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
      return res;
    }).catch(() => caches.match(req).then((hit) => hit || caches.match('./')))
  );
});