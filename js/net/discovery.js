/**
 * discovery.js — what games can this device see right now?
 *
 * Three sources, and it is worth being honest about what each can actually
 * do, because "see local games" means different things depending on what is
 * running:
 *
 *   LAN ROOMS   Real cross-device discovery. Only when the page is served by
 *               `npm run lan` on a machine on the same WiFi. On GitHub Pages
 *               this probe 404s and costs one request.
 *   THIS DEVICE Games open in another tab of this same browser, over
 *               BroadcastChannel. Cheap, and how a parent can set a game up
 *               on the big screen and keep a tab open.
 *   PASS AND PLAY  Always available, needs nothing. Not really "discovery" —
 *               it is the game you can always start.
 *
 * Rather than pretend, the lobby shows what each source found and says
 * plainly when there is nothing on the network.
 */

var CHANNEL = 'quizquest-games';
var bc = null;
var advertised = null;
var seen = {};

function channel() {
  if (bc !== null) return bc;
  try { bc = window.BroadcastChannel ? new window.BroadcastChannel(CHANNEL) : false; }
  catch (e) { bc = false; }
  if (bc) {
    bc.onmessage = function (e) {
      var m = e.data;
      if (!m || !m.id) return;
      if (m.t === 'advert') { m.seenAt = Date.now(); seen[m.id] = m; }
      if (m.t === 'closed') delete seen[m.id];
      if (m.t === 'who' && advertised) bc.postMessage(advertised);
    };
  }
  return bc;
}

/** Tell other tabs on this device that a game is open here. */
export function advertise(game) {
  advertised = {
    t: 'advert', id: game.id, host: game.host, mode: game.mode,
    players: game.players, open: true
  };
  var c = channel();
  if (c) c.postMessage(advertised);
}

export function stopAdvertising() {
  var c = channel();
  if (c && advertised) c.postMessage({ t: 'closed', id: advertised.id });
  advertised = null;
}

/** Ask any other tabs to re-announce themselves. */
function poke() {
  var c = channel();
  if (c) c.postMessage({ t: 'who', id: 'poke' });
}

/**
 * Is a room server serving this page? On GitHub Pages this 404s, which is the
 * answer we want and costs one request. The service worker refuses to cache
 * it, so a cached page can never wrongly believe a server is there.
 */
var probed = null;
export function probeRooms() {
  // Probe ONCE per page load. A 404 here is the correct answer on GitHub
  // Pages, not a failure — but repeating it every few seconds would fill the
  // console with red for something that is working as intended.
  if (probed) return probed;
  probed = fetch('lan/info', { cache: 'no-store' })
    .then(function (r) { return r.ok ? r.json() : null; })
    .catch(function () { return null; });
  return probed;
}

/**
 * @returns {Promise<{rooms: object[], tabs: object[], hasServer: boolean}>}
 */
export function findGames() {
  poke();
  return probeRooms().then(function (info) {
    // Drop anything we have not heard from recently: a tab that was closed
    // without saying so should not haunt the lobby.
    var now = Date.now();
    var tabs = [];
    for (var id in seen) {
      if (now - seen[id].seenAt > 6000) { delete seen[id]; continue; }
      if (advertised && seen[id].id === advertised.id) continue;
      tabs.push(seen[id]);
    }
    return {
      hasServer: !!info,
      serverName: info && info.name ? info.name : null,
      rooms: (info && info.rooms) || [],
      tabs: tabs
    };
  });
}
