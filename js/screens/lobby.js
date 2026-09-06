/**
 * lobby.js — the front door. What a child sees the moment they are signed in
 * is a game to join or a game to start, not a menu.
 *
 * Team modes lead, and the co-op one leads them, because "one team, one
 * finish line, nobody loses" is the right default for a household that
 * contains both a four-year-old and a nine-year-old.
 */

import { el, clear, button } from '../ui/dom.js';
import { racerSvg } from '../ui/art.js';
import { icon } from '../ui/icons.js';
import { MP_MODES } from '../net/coordinator.js';
import { BAND_INFO } from '../content/bands.js';
import * as Users from '../users/users.js';
import { findGames } from '../net/discovery.js';
import { icon as navIcon } from '../ui/icons.js';
import { topbar, section } from './home.js';
import { state as logState } from '../sync/log.js';
import { isMastered, isRecovered } from '../learn/scheduler.js';

function avatarNode(id, size) {
  var w = el('span', 'avatar');
  w.style.width = w.style.height = (size || 44) + 'px';
  w.innerHTML = racerSvg(id || 'rocket');
  return w;
}

export function mountLobby(host, nav) {
  var user = Users.getActiveUser();
  var root = el('div', 'screen screen-lobby');
  var destroyed = false;

  var swap = button('', 'icon-btn', function () { nav.go('profiles'); });
  swap.appendChild(avatarNode(user.avatar, 30));
  swap.setAttribute('aria-label', 'Switch player');
  root.appendChild(topbar('Quiz Quest', null, swap));

  /* Greeting, and the one number that matters: things turned into knows. */
  var greet = el('div', 'lobby-greet');
  greet.appendChild(avatarNode(user.avatar, 52));
  var greetText = el('div', 'lobby-greet-text');
  greetText.appendChild(el('h2', 'lobby-hi', 'Hi ' + user.name));
  var st = logState().users[user.id];
  if (st && st.totals.answered) {
    var known = 0, recovered = 0;
    for (var id in st.items) {
      if (isMastered(st.items[id])) known++;
      if (isRecovered(st.items[id])) recovered++;
    }
    var line = el('p', 'lobby-stat');
    line.appendChild(el('strong', null, String(known)));
    line.appendChild(el('span', null, ' known'));
    if (recovered) {
      line.appendChild(el('span', 'hero-dot', ' · '));
      line.appendChild(el('strong', 'is-good', String(recovered)));
      line.appendChild(el('span', null, ' turned around'));
    }
    greetText.appendChild(line);
  } else {
    greetText.appendChild(el('p', 'lobby-stat', BAND_INFO[user.band].label));
  }
  greet.appendChild(greetText);
  root.appendChild(greet);

  /* ── Games you can join ─────────────────────────────────────────────── */
  var nearby = section('Games nearby');
  var nearbyList = el('div', 'game-list');
  var nearbyNote = el('p', 'field-note', 'Looking…');
  nearby.appendChild(nearbyList);
  nearby.appendChild(nearbyNote);
  root.appendChild(nearby);

  function renderGames(found) {
    if (destroyed) return;
    clear(nearbyList);
    var games = found.rooms.concat(found.tabs);
    if (!games.length) {
      nearbyNote.textContent = found.hasServer
        ? 'Nobody has opened a game on ' + (found.serverName || 'this network') + ' yet.'
        : 'No games on this network. Start one below — you can all play on this device.';
      return;
    }
    nearbyNote.textContent = '';
    games.forEach(function (g) {
      var cfg = MP_MODES[g.mode] || MP_MODES.together;
      var card = el('button', 'game-card');
      card.type = 'button';
      card.appendChild(icon(cfg.icon, 26, 'game-icon'));
      var body = el('span', 'game-body');
      body.appendChild(el('span', 'game-title', (g.host || 'Someone') + '’s ' + cfg.label.toLowerCase()));
      body.appendChild(el('span', 'game-meta',
        (g.players || 1) + (g.players === 1 ? ' player' : ' players') + ' · waiting'));
      card.appendChild(body);
      card.appendChild(el('span', 'game-join', 'Join'));
      card.addEventListener('click', function () { nav.go('joingame', g); });
      nearbyList.appendChild(card);
    });
  }

  function refresh() {
    findGames().then(renderGames).catch(function () {
      if (!destroyed) nearbyNote.textContent = 'Could not look for games just now.';
    });
  }
  refresh();
  var poll = setInterval(refresh, 4000);

  /* ── Start a game ───────────────────────────────────────────────────── */
  var start = section('Start a game');
  var grid = el('div', 'mode-grid');
  var order = ['together', 'teams', 'race', 'relay'];
  order.forEach(function (key) {
    var cfg = MP_MODES[key];
    var b = el('button', 'mode-card' + (key === 'together' ? ' is-lead' : ''));
    b.type = 'button';
    b.appendChild(icon(cfg.icon, 24, 'mode-icon'));
    b.appendChild(el('span', 'mode-label', cfg.label));
    b.appendChild(el('span', 'mode-blurb', cfg.blurb));
    b.addEventListener('click', function () { nav.go('setup', { mode: key }); });
    grid.appendChild(b);
  });
  start.appendChild(grid);
  root.appendChild(start);

  /* Playing across devices. Both routes work on WiFi with no internet. */
  var across = section('Across devices');
  var pair = el('div', 'home-row');
  pair.appendChild(button('Join a game', 'btn btn-quiet', function () { nav.go('joinroom'); }));
  pair.appendChild(button('Invite a phone', 'btn btn-quiet', function () { nav.go('p2phost', { mode: 'together' }); }));
  across.appendChild(pair);
  across.appendChild(el('p', 'field-note',
    'Everyone needs to be on the same WiFi. No internet required.'));
  root.appendChild(across);

  /* Solo is still here, just no longer the front door. */
  root.appendChild(button('Play on my own', 'btn btn-quiet', function () { nav.go('play'); }));

  var row = el('div', 'home-row');
  row.appendChild(button('Modules', 'btn btn-quiet', function () { nav.go('library'); }));
  row.appendChild(button('Settings', 'btn btn-quiet', function () { nav.go('settings'); }));
  root.appendChild(row);

  host.appendChild(root);
  return {
    destroy: function () { destroyed = true; clearInterval(poll); }
  };
}

/* ── Setting a game up: who is playing? ──────────────────────────────── */

export function setupScreen(nav, opts) {
  var mode = (opts && opts.mode) || 'together';
  var cfg = MP_MODES[mode];
  var me = Users.getActiveUser();
  var root = el('div', 'screen');
  root.appendChild(topbar(cfg.label, function () { nav.go('home'); }));
  root.appendChild(el('p', 'field-note', cfg.blurb));

  var chosen = [me.id];
  var everyone = Users.listUsers();

  var s = section('Who is playing?');
  s.appendChild(el('p', 'field-note',
    'Everyone plays on this device — take turns and pass it along. ' +
    'Each player gets questions at their own level, so it stays fair.'));

  var list = el('div', 'player-pick');
  everyone.forEach(function (u) {
    var b = el('button', 'pick-card' + (chosen.indexOf(u.id) !== -1 ? ' is-on' : ''));
    b.type = 'button';
    b.appendChild(avatarNode(u.avatar, 46));
    b.appendChild(el('span', 'pick-name', u.name));
    b.appendChild(el('span', 'pick-band', BAND_INFO[u.band].label));
    b.addEventListener('click', function () {
      var at = chosen.indexOf(u.id);
      // The signed-in player is always in: leaving yourself out of your own
      // game is never what anyone meant to do.
      if (at !== -1 && u.id !== me.id) chosen.splice(at, 1);
      else if (at === -1) chosen.push(u.id);
      b.className = 'pick-card' + (chosen.indexOf(u.id) !== -1 ? ' is-on' : '');
      update();
    });
    list.appendChild(b);
  });
  s.appendChild(list);
  s.appendChild(button('+ Add another player', 'link-btn', function () { nav.go('newuser', { back: 'setup', mode: mode }); }));
  root.appendChild(s);

  var note = el('p', 'field-note', '');
  root.appendChild(note);
  var go = button('Start on this device', 'btn btn-big btn-go', function () {
    nav.go('match', { mode: mode, userIds: chosen.slice() });
  });
  root.appendChild(go);

  var across = section('Or play across devices');
  across.appendChild(el('p', 'field-note',
    'Each player uses their own phone or tablet, on the same WiFi. Their questions stay private to their screen.'));
  var row = el('div', 'home-row');
  row.appendChild(button('Host a room', 'btn btn-quiet', function () { nav.go('roomhost', { mode: mode }); }));
  row.appendChild(button('Invite by QR', 'btn btn-quiet', function () { nav.go('p2phost', { mode: mode }); }));
  across.appendChild(row);
  root.appendChild(across);

  function update() {
    var n = chosen.length;
    var needTwo = cfg.teams === 'split';
    go.disabled = needTwo ? n < 2 : n < 1;
    note.textContent = needTwo && n < 2
      ? 'Team modes need at least two players. Tap another name, or add someone.'
      : n === 1 ? 'Just you for now — that is fine, it is still a race against the track.'
      : n + ' players';
  }
  update();
  return root;
}
