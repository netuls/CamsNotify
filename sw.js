// CamsNotify Service Worker - Background Notifications
const CACHE_NAME = 'camsnotify-v1';

// ===== INSTALL =====
self.addEventListener('install', e => {
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(self.clients.claim());
});

// ===== BACKGROUND SYNC CHECK =====
// Recebe mensagem do app principal com os lembretes
self.addEventListener('message', e => {
  if (e.data && e.data.type === 'SET_REMINDERS') {
    // Armazena lembretes no SW via IndexedDB simulado com a própria mensagem
    self.reminders = e.data.reminders;
  }
});

// ===== PERIODIC BACKGROUND SYNC (Android Chrome) =====
self.addEventListener('periodicsync', e => {
  if (e.tag === 'check-reminders') {
    e.waitUntil(checkAndNotify());
  }
});

// ===== PUSH (fallback) =====
self.addEventListener('push', e => {
  const data = e.data ? e.data.json() : {};
  e.waitUntil(
    self.registration.showNotification('🌸 CamsNotify', {
      body: data.msg || 'Você tem um lembrete!',
      icon: './icons/icon-192.png',
      badge: './icons/icon-192.png',
      vibrate: [200, 100, 200, 100, 200],
      requireInteraction: true,
      data: data,
      actions: [
        { action: 'ok', title: '✅ Ok!' },
        { action: 'snooze', title: '⏰ +5 min' }
      ]
    })
  );
});

// ===== NOTIFICATION CLICK =====
self.addEventListener('notificationclick', e => {
  e.notification.close();
  if (e.action === 'snooze') {
    // Reagenda em 5 minutos
    const data = e.notification.data || {};
    setTimeout(() => {
      self.registration.showNotification('🌸 CamsNotify (soneca)', {
        body: data.msg || 'Lembrete adiado!',
        icon: './icons/icon-192.png',
        vibrate: [200, 100, 200],
        requireInteraction: true,
      });
    }, 5 * 60 * 1000);
    return;
  }
  // Abre o app
  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clients => {
      if (clients.length > 0) {
        clients[0].focus();
      } else {
        self.clients.openWindow('./index.html');
      }
    })
  );
});

// ===== CHECK FUNCTION =====
async function checkAndNotify() {
  // Lê lembretes do cache compartilhado
  const cache = await caches.open(CACHE_NAME);
  const resp  = await cache.match('reminders-data');
  if (!resp) return;

  const reminders = await resp.json();
  const now = new Date();
  const pad = n => String(n).padStart(2, '0');
  const nowTime = `${pad(now.getHours())}:${pad(now.getMinutes())}`;
  const nowDate = `${now.getFullYear()}-${pad(now.getMonth()+1)}-${pad(now.getDate())}`;
  const nowDay  = now.getDay();

  let changed = false;

  for (const r of reminders) {
    if (!r.active) continue;
    const timeMatch = r.time === nowTime;
    let should = false;

    if (r.repeat === 'once' && r.date === nowDate && timeMatch && !r.fired) {
      should = true; r.fired = true; r.active = false; changed = true;
    } else if (r.repeat === 'daily' && timeMatch && r.lastFired !== nowDate) {
      should = true; r.lastFired = nowDate; changed = true;
    } else if (r.repeat === 'weekdays' && nowDay >= 1 && nowDay <= 6 && timeMatch && r.lastFired !== nowDate) {
      should = true; r.lastFired = nowDate; changed = true;
    } else if (r.repeat === 'weekends' && (nowDay === 0 || nowDay === 6) && timeMatch && r.lastFired !== nowDate) {
      should = true; r.lastFired = nowDate; changed = true;
    }

    if (should) {
      await self.registration.showNotification('🌸 CamsNotify', {
        body: r.msg,
        icon: './icons/icon-192.png',
        badge: './icons/icon-192.png',
        vibrate: [200, 100, 200, 100, 200],
        requireInteraction: true,
        data: { msg: r.msg, id: r.id },
        actions: [
          { action: 'ok', title: '✅ Ok!' },
          { action: 'snooze', title: '⏰ +5 min' }
        ]
      });
    }
  }

  if (changed) {
    await cache.put('reminders-data', new Response(JSON.stringify(reminders)));
  }
}
