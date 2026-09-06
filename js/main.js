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
import { loadIndex, loadModules, chosenModuleIds, buildPool } from './content/registry.js';
import { generate as generateTemplate } from './content/templates.js';
import { homeScreen, profilesScreen, newUserScreen, removeUserScreen, libraryScreen, settingsScreen, resultsScreen, reportScreen } from './screens/home.js';
import { mountPlay } from './screens/play.js';

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
  // Any tap is a user gesture, which is the only moment iOS will let us
  // prime speech. A pre-reader can never provide that gesture knowingly, so
  // we take every one we are given.
  unlockAudio();

  if (!Users.getActiveUser() && where !== 'newuser' && where !== 'profiles') {
    return show(Users.listUsers().length ? profilesScreen(nav) : newUserScreen(nav));
  }
  switch (where) {
    case 'profiles': return show(profilesScreen(nav));
    case 'newuser': return show(newUserScreen(nav));
    case 'removeuser': return show(removeUserScreen(nav));
    case 'library': return show(libraryScreen(nav));
    case 'settings': return show(settingsScreen(nav));
    case 'report': return show(reportScreen(nav));
    case 'results': return show(resultsScreen(nav, arg || lastSummary || { answered: 0, recovered: [] }));
    case 'play': return startPlay();
    default: return show(homeScreen(nav));
  }
}

function startPlay() {
  var user = Users.getActiveUser();
  var settings = loadSettings(user.id);
  show(loading('Loading questions…'));
  var ids = chosenModuleIds(settings, user.band);
  if (!ids.length) {
    return show(fail('No modules are switched on for ' + user.name + '. Turn some on under Modules.',
      function () { go('library'); }));
  }
  loadModules(ids).then(function (mods) {
    var bundle = buildPool(mods, user.band);
    bundle.generate = generateTemplate;
    if (!bundle.pool.length) {
      return show(fail('Those modules have nothing suitable for ' + user.name + ' yet.', function () { go('library'); }));
    }
    showMounted(function (host) {
      return mountPlay(host, {
        user: user, settings: settings, bundle: bundle,
        onDone: function (summary) { lastSummary = summary; go('results', summary); }
      });
    });
  }).catch(function (e) {
    show(fail('Could not load the questions. ' + (e && e.message ? e.message : ''), startPlay));
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
