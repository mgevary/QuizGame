// sw.js — offline support. Precaches the app and the starter content pack so
// the game runs with no network at all after the first visit.
//
// VERSION is rewritten by scripts/deploy.sh with the commit hash, so every
// deploy installs a fresh cache and retires the old one.
// ES2017-safe for the Safari 12 worker context.

var VERSION = '3454dcd';
var CACHE = 'quiz-' + VERSION;

// The starter pack is precached; everything else is cached as it is played.
// A first visit must be small — a child waiting on a download is a child who
// wanders off.
var ASSETS = [
  './',
  'index.html',
  'manifest.webmanifest',
  'css/app.css',
  'css/play.css',
  'js/content/bands.js',
  'js/content/registry.js',
  'js/content/rng.js',
  'js/content/skills.js',
  'js/content/templates.js',
  'js/content/validate.js',
  'js/items/assemble.js',
  'js/items/choice.js',
  'js/items/count.js',
  'js/items/index.js',
  'js/items/trace-score.js',
  'js/items/trace.js',
  'js/learn/ability.js',
  'js/learn/boosts.js',
  'js/learn/remediation.js',
  'js/learn/scheduler.js',
  'js/learn/session.js',
  'js/main.js',
  'js/mission/model.js',
  'js/net/coordinator.js',
  'js/net/discovery.js',
  'js/net/lan.js',
  'js/net/local.js',
  'js/net/mpscreen.js',
  'js/net/p2p.js',
  'js/screens/home.js',
  'js/screens/lobby.js',
  'js/screens/match.js',
  'js/screens/results.js',
  'js/settings/settings.js',
  'js/store.js',
  'js/sync/event.js',
  'js/sync/fold.js',
  'js/sync/hlc.js',
  'js/sync/log.js',
  'js/sync/merge.js',
  'js/track/model.js',
  'js/track/render.js',
  'js/ui/art.js',
  'js/ui/audio.js',
  'js/ui/dom.js',
  'js/ui/icons.js',
  'js/ui/pictures.js',
  'js/users/users.js',
  'content/index.json',
  'content/modules/core-firstwords.json',
  'content/modules/core-counting.json',
  'content/modules/core-letters.json',
  'content/modules/core-math-k.json',
  'content/modules/core-reading-k.json',
  'icons/favicon-32.png',
  'icons/apple-touch-icon.png',
  'icons/icon-512.png'
];

self.addEventListener('install', function (event) {
  event.waitUntil(
    caches.open(CACHE).then(function (cache) {
      // One missing file must not fail the whole install and leave a child
      // with no offline game at all.
      return Promise.all(ASSETS.map(function (a) {
        return cache.add(a).catch(function () { return null; });
      }));
    }).then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.map(function (key) {
        return (key === CACHE || key === AUDIO_CACHE) ? null : caches.delete(key);
      }));
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function (event) {
  if (event.request.method !== 'GET') return;
  var url = event.request.url;
  if (url.indexOf('lan/info') !== -1) return;   // the room-server probe must never be cached
  var isAudio = url.indexOf('/audio/') !== -1 && url.indexOf('.mp3') !== -1;

  // The page is network-first. Cache-first served the previous deploy's HTML
  // on the first load after an update, so a player who reloaded stayed a
  // version behind and simply did not see new features.
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request).then(function (res) {
        if (res && res.status === 200) {
          var copy = res.clone();
          caches.open(CACHE).then(function (c) { c.put(event.request, copy); });
        }
        return res;
      }).catch(function () {
        return caches.match(event.request, { ignoreSearch: true }).then(function (hit) {
          return hit || caches.match('./index.html') || caches.match('./');
        });
      })
    );
    return;
  }

  event.respondWith(
    caches.match(event.request, { ignoreSearch: true }).then(function (hit) {
      if (hit) return hit;
      return fetch(event.request).then(function (res) {
        if (res && res.status === 200 && res.type === 'basic') {
          var copy = res.clone();
          caches.open(isAudio ? AUDIO_CACHE : CACHE).then(function (c) { c.put(event.request, copy); });
        }
        return res;
      }).catch(function () {
        // Offline and uncached: music is the common case, and the game plays
        // fine in silence.
        return new Response('', { status: 504, statusText: 'offline' });
      });
    })
  );
});
