/**
 * main.js — boot, and the screen router.
 *
 * No router library and no URL routing: one `current` handle, and screens are
 * functions that return a node (static) or a mount handle (stateful). The
 * hash is reserved for the multiplayer join deep link.
 */

import { el, clear } from './ui/dom.js';
import { unlock as unlockAudio } from './ui/audio.js';
import * as Users from './users/users.js';
import { loadSettings } from './settings/settings.js';
import * as Log from './sync/log.js';
import { loadIndex, loadModules, buildPool, chosenModuleIds } from './content/registry.js';
import { profilesScreen, newUserScreen, removeUserScreen, libraryScreen, settingsScreen, reportScreen } from './screens/home.js';
import { mountLobby, setupScreen } from './screens/lobby.js';
import { mountMatch } from './screens/match.js';
import { matchResultsScreen } from './screens/results.js';

var root = document.getElementById('app');
var current = null;
var lastSummary = null;

function show(node) {
  if (current && current.destroy) current.destroy();
  current = null;
  clear(root);
  root.appendChild(node);
  root.scrollTop = 0;
}

function showMounted(mounter) {
  if (current && current.destroy) current.destroy();
  clear(root);
  current = mounter(root);
}

function loading(message) {
  var d = el('div', 'screen screen-loading');
  d.appendChild(el('div', 'spinner'));
  d.appendChild(el('p', 'field-note', message || 'Getting things ready…'));
  return d;
}

function fail(message, retry) {
  var d = el('div', 'screen');
  d.appendChild(el('h2', 'hero-name', 'Something went wrong'));
  d.appendChild(el('p', 'field-note', message));
  if (retry) {
    var b = el('button', 'btn btn-go', 'Try again');
    b.type = 'button';
    b.addEventListener('click', retry);
    d.appendChild(b);
  }
  return d;
}

var nav = {
  go: go,
  wipe: function () { Log.wipe(); try { localStorage.clear(); } catch (e) {} location.reload(); }
};

function go(where, arg) {
  // Any tap is a user gesture, which is the only moment iOS will let us prime
  // speech. A pre-reader can never knowingly provide one, so take every one
  // we are given.
  unlockAudio();

  if (!Users.getActiveUser() && where !== 'newuser' && where !== 'profiles') {
    return show(Users.listUsers().length ? profilesScreen(nav) : newUserScreen(nav));
  }
  switch (where) {
    case 'profiles': return show(profilesScreen(nav));
    case 'newuser': return show(newUserScreen(nav, arg));
    case 'removeuser': return show(removeUserScreen(nav));
    case 'library': return show(libraryScreen(nav));
    case 'settings': return show(settingsScreen(nav));
    case 'report': return show(reportScreen(nav));
    case 'setup': return show(setupScreen(nav, arg));
    case 'results': return show(matchResultsScreen(nav, arg || lastSummary));
    case 'match': return startMatch(arg);
    case 'play': return startMatch({ mode: 'solo', userIds: [Users.getActiveUserId()] });
    case 'joingame': return show(fail(
      'Joining a game on another device needs the room server running. For now, start a game here and pass the device around.',
      function () { go('home'); }));
    default: return showMounted(function (h) { return mountLobby(h, nav); });
  }
}

/**
 * Load exactly the modules each player needs. Two children in one game are
 * usually at completely different places, so every player gets their own pool
 * built from their own settings and their own band.
 */
function startMatch(arg) {
  var ids = (arg && arg.userIds) || [Users.getActiveUserId()];
  var everyone = Users.listUsers();
  var players = [];
  for (var i = 0; i < ids.length; i++) {
    for (var j = 0; j < everyone.length; j++) {
      if (everyone[j].id === ids[i]) players.push(everyone[j]);
    }
  }
  if (!players.length) return go('home');

  show(loading('Getting the questions ready…'));

  var wanted = {};
  players.forEach(function (p) {
    p.settings = loadSettings(p.id, p.band);
    p.modules = chosenModuleIds(p.settings, p.band);
    p.modules.forEach(function (m) { wanted[m] = true; });
  });
  var allIds = Object.keys(wanted);
  if (!allIds.length) {
    return show(fail('No modules are switched on. Turn some on under Modules.', function () { go('library'); }));
  }

  loadModules(allIds).then(function (mods) {
    var byId = {};
    mods.forEach(function (m) { byId[m.id] = m; });
    if (!mods.length) {
      return show(fail('Could not load any questions. If you are offline, the starter pack should still work — try again once you have a connection.',
        function () { startMatch(arg); }));
    }
    var playable = [];
    var skipped = [];
    players.forEach(function (p) {
      var mine = p.modules.map(function (id) { return byId[id]; }).filter(Boolean);
      p.bundle = buildPool(mine, p.band);
      if (p.bundle.pool.length) playable.push(p);
      else skipped.push(p.name);
    });
    if (!playable.length) {
      return show(fail('Nothing suitable to ask yet. Check Modules.', function () { go('library'); }));
    }
    showMounted(function (h) {
      return mountMatch(h, {
        mode: (arg && arg.mode) || 'solo',
        players: playable,
        onDone: function (summary) {
          summary.skipped = skipped;
          lastSummary = summary;
          go('results', summary);
        }
      });
    });
  }).catch(function (e) {
    show(fail('Could not load the questions. ' + (e && e.message ? e.message : ''), function () { startMatch(arg); }));
  });
}

/* ── boot ────────────────────────────────────────────────────────────── */

show(loading());
Log.load();
loadIndex().then(function () {
  go(Users.getActiveUser() ? 'home' : (Users.listUsers().length ? 'profiles' : 'newuser'));
}).catch(function (e) {
  show(fail('Could not load the question library. ' + (e && e.message ? e.message : ''), function () { location.reload(); }));
});

// Exposed so scripts/smoke.mjs can drive a real session through real events.
window.__quiz = { nav: nav, log: Log, users: Users };
