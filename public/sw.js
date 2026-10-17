const CACHE = 'school-leave-public-v1';
// Only public offline UI is cached. Never cache accounts, Firebase, auth helpers,
// leave records, attachments, or authenticated HTML responses.
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.add('/offline.html')).then(() => self.skipWaiting()));
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k.startsWith('school-leave-public-') && k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== self.location.origin || url.pathname.startsWith('/__/') || event.request.mode !== 'navigate') return;
  event.respondWith(fetch(event.request).catch(async () => (await caches.match('/offline.html')) || new Response('Offline', {status:503,headers:{'Content-Type':'text/plain;charset=utf-8'}})));
});

// Push payloads contain only generic text. No leave details enter offline caches.
const PUSH_ROUTES = new Set(['/teacher_dashboard#pending-tab', '/teacher_dashboard#students-tab', '/student_leave_form#history-tab', '/student_leave_form#teachers-tab']);
self.addEventListener('push', event => {
  let data; try { data = event.data.json(); } catch { return; }
  if (!data || !PUSH_ROUTES.has(data.url)) return;
  event.waitUntil(self.registration.showNotification('ระบบลาเรียนออนไลน์', {
    body: typeof data.title === 'string' ? data.title.slice(0, 80) : 'มีรายการใหม่ในระบบ',
    icon: '/assets/icon-192.png', badge: '/assets/icon-192.png',
    tag: typeof data.tag === 'string' ? data.tag.slice(0, 80) : 'school-leave',
    data: {url: data.url}, renotify: false
  }));
});
self.addEventListener('notificationclick', event => {
  event.notification.close();
  const route = event.notification.data?.url;
  if (!PUSH_ROUTES.has(route)) return;
  event.waitUntil((async () => {
    const url = new URL(route, self.location.origin).href;
    const windows = await self.clients.matchAll({type: 'window', includeUncontrolled: true});
    for (const client of windows) {
      if (new URL(client.url).origin === self.location.origin) {
        await client.navigate(url); await client.focus(); return;
      }
    }
    await self.clients.openWindow(url);
  })());
});
