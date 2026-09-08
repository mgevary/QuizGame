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
import { findGames, advertise, stopAdvertising } from '../net/discovery.js';
import { createRoomSession } from '../net/lan.js';
import * as Gossip from '../sync/gossip.js';
import { toast, diffRoster, announceArrivals, canOfferNotify, askNotify } from '../ui/presence.js';
import { burst as confetti } from '../ui/confetti.js';
import { topbar, section } from './home.js';
import { state as logState } from '../sync/log.js';
import { isMastered, isRecovered } from '../learn/scheduler.js';
import { loadSettings } from '../settings/settings.js';
import { readJSON, writeJSON } from '../store.js';

function avatarNode(id, size) {
  var w = el('span', 'avatar');
  w.style.width = w.style.height = (size || 44) + 'px';
  w.innerHTML = racerSvg(id || 'rocket');
  return w;
}

export function mountLobby(host, nav) {
  var user = Users.getActiveUser();
  var settings = loadSettings(user.id, user.band);
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

  /* ── The live panel ─────────────────────────────────────────────────────
     Opening the app IS opening a game. When a room server is on the WiFi the
     lobby quietly opens a room in your name the moment you arrive, shows its
     code, and fills with racers as people join — no tap needed. If someone
     else already has a game open, you are shown that instead, with one big
     Join. With no server about, it is the honest pass-the-device panel. */
  var last = readJSON('quiz/lastGame.v1', null);
  var mode = (last && last.mode && MP_MODES[last.mode]) ? last.mode : 'together';
  var live = el('div', 'live');
  root.appendChild(live);

  var room = null;            // the room this lobby is hosting, if any
  var roster = [];
  var newSeats = {};          // seats that just arrived, for the pop-in
  var handedOver = false;
  var liveState = 'probing';  // probing | opening | hosting | found | noserver
  var foundRoom = null;
  var hostTried = false;
  var showHow = false;
  var lastSig = null;
  var gossip = null;

  function playerChip(name, racer, cls) {
    var chip = el('div', 'live-player' + (cls ? ' ' + cls : ''));
    var av = el('span', 'live-avatar');
    av.innerHTML = racerSvg(racer || 'rocket');
    chip.appendChild(av);
    chip.appendChild(el('span', null, name));
    return chip;
  }

  function modeChips() {
    var wrap = el('div', 'live-modes');
    ['together', 'teams', 'race', 'relay'].forEach(function (key) {
      var cfg = MP_MODES[key];
      var c = el('button', 'chip' + (key === mode ? ' is-on' : ''));
      c.type = 'button';
      c.appendChild(icon(cfg.icon, 14));
      c.appendChild(el('span', null, cfg.label));
      c.addEventListener('click', function () { mode = key; lastSig = null; renderLive(); });
      wrap.appendChild(c);
    });
    return wrap;
  }

  function signature() {
    return [liveState, room && room.room, mode, showHow,
      roster.map(function (r) { return r.seat + ':' + r.name; }).join(','),
      foundRoom && (foundRoom.id + ':' + foundRoom.players + ':' + (foundRoom.who || []).length),
      canOfferNotify()].join('|');
  }

  function renderLive() {
    if (destroyed) return;
    var sig = signature();
    if (sig === lastSig) return;
    lastSig = sig;
    clear(live);
    live.className = 'live is-' + liveState;

    if (liveState === 'probing' || liveState === 'opening') {
      var top0 = el('div', 'live-top');
      top0.appendChild(el('span', 'live-dot is-quiet'));
      top0.appendChild(el('span', 'live-kind', liveState === 'opening' ? 'Opening a game for you…' : 'Looking for games…'));
      live.appendChild(top0);
      var r0 = el('div', 'live-roster');
      r0.appendChild(playerChip(user.name, user.avatar, 'is-me'));
      live.appendChild(r0);
      return;
    }

    if (liveState === 'hosting') {
      var top = el('div', 'live-top');
      top.appendChild(el('span', 'live-dot'));
      top.appendChild(el('span', 'live-kind', 'Your game is open'));
      var code = el('span', 'live-code', room.room);
      code.setAttribute('aria-label', 'Room code ' + room.room.split('').join(' '));
      top.appendChild(code);
      live.appendChild(top);

      var ro = el('div', 'live-roster');
      roster.forEach(function (r) {
        ro.appendChild(playerChip(r.name, r.racer, (r.seat === room.mySeat ? 'is-me' : '') + (newSeats[r.seat] ? ' is-new' : '')));
      });
      var empty = el('div', 'live-player is-empty');
      empty.appendChild(icon('plus', 16));
      empty.appendChild(el('span', null, roster.length > 1 ? 'room for more' : 'waiting for a friend…'));
      ro.appendChild(empty);
      live.appendChild(ro);
      newSeats = {};

      live.appendChild(el('p', 'live-line',
        'Anyone on the WiFi opens Quiz Quest and taps Join. Or they type ' + room.room + '.'));
      live.appendChild(modeChips());

      var n = roster.length;
      if (n > 1) {
        live.appendChild(button('Start with ' + n + ' players', 'btn btn-big btn-go', startNetworked));
      } else {
        var wait = el('button', 'btn btn-big btn-go is-waiting');
        wait.type = 'button';
        wait.disabled = true;
        wait.textContent = 'Waiting for players…';
        live.appendChild(wait);
        live.appendChild(button('Play on this device instead', 'link-btn', function () { nav.go('setup', { mode: mode }); }));
      }
      if (canOfferNotify()) {
        live.appendChild(button('Tell me when someone joins', 'link-btn live-foot', function () {
          askNotify().then(function () { lastSig = null; renderLive(); });
        }));
      }
      return;
    }

    if (liveState === 'found') {
      var g = foundRoom;
      var cfg = MP_MODES[g.mode] || MP_MODES.together;
      var topf = el('div', 'live-top');
      topf.appendChild(el('span', 'live-dot'));
      topf.appendChild(el('span', 'live-kind', (g.host || 'Someone') + '’s game is open'));
      topf.appendChild(el('span', 'live-tag', cfg.label));
      live.appendChild(topf);
      var rf = el('div', 'live-roster');
      (g.who || []).forEach(function (w) { rf.appendChild(playerChip(w.name, w.racer)); });
      if (!(g.who || []).length) rf.appendChild(playerChip(g.host || 'Someone', g.hostRacer));
      rf.appendChild(playerChip(user.name, user.avatar, 'is-me is-ghost'));
      live.appendChild(rf);
      live.appendChild(el('p', 'live-line', (g.players || 1) + (g.players === 1 ? ' player' : ' players') + ' waiting. Tap to jump in.'));
      live.appendChild(button('Join ' + (g.host || 'this') + '’s game', 'btn btn-big btn-go', function () {
        nav.go('joingame', g);
      }));
      live.appendChild(button('Start my own game instead', 'link-btn', function () { hostRoom(); }));
      return;
    }

    // No room server about: the honest panel. Still a game, one tap away.
    var topn = el('div', 'live-top');
    topn.appendChild(icon('together', 22, 'live-icon'));
    topn.appendChild(el('span', 'live-kind', 'Play together'));
    live.appendChild(topn);
    var rn = el('div', 'live-roster');
    rn.appendChild(playerChip(user.name, user.avatar, 'is-me'));
    var others = Users.listUsers().filter(function (u) { return u.id !== user.id; });
    others.slice(0, 3).forEach(function (u) { rn.appendChild(playerChip(u.name, u.avatar, 'is-ghost')); });
    var add = el('div', 'live-player is-empty');
    add.appendChild(icon('plus', 16));
    add.appendChild(el('span', null, others.length ? 'and more' : 'add a player'));
    rn.appendChild(add);
    live.appendChild(rn);
    live.appendChild(modeChips());
    live.appendChild(button('Pass this device around', 'btn btn-big btn-go', function () { nav.go('setup', { mode: mode }); }));
    var row = el('div', 'home-row');
    row.appendChild(button('Invite a phone', 'btn btn-quiet', function () { nav.go('p2phost', { mode: mode }); }));
    row.appendChild(button('Join with a code', 'btn btn-quiet', function () { nav.go('joinroom'); }));
    live.appendChild(row);
    var foot = el('p', 'live-foot');
    foot.appendChild(el('span', null, 'Games on the same WiFi find each other when the room server is on. '));
    foot.appendChild(button(showHow ? 'Hide' : 'How?', 'link-btn inline', function () { showHow = !showHow; renderLive(); }));
    live.appendChild(foot);
    if (showHow) {
      live.appendChild(el('p', 'live-foot', 'On a laptop on this WiFi, run “npm run lan” and open the address it prints on every device — every game then opens a room by itself and everyone sees it. Or put a room server address under Settings.'));
    }
  }

  function hostRoom() {
    if (room || destroyed) return;
    hostTried = true;
    liveState = 'opening';
    renderLive();
    var s = createRoomSession({ name: user.name, racer: user.avatar, band: user.band, userId: user.id, create: true });
    room = s;
    s.connect().then(function () {
      if (destroyed || room !== s) return;
      roster = s.roster();
      liveState = 'hosting';
      gossip = Gossip.attach(s, { onSynced: function (n) {
        toast('Caught up: ' + n + (n === 1 ? ' new answer' : ' new answers') + ' from another device.', { kind: 'info' });
      } });
      advertise({ id: s.room, host: user.name, mode: mode, players: roster.length });
      s.on('roster', function () {
        if (destroyed || room !== s) return;
        var next = s.roster();
        var diff = diffRoster(roster, next);
        roster = next;
        diff.joined.forEach(function (r) { newSeats[r.seat] = true; });
        var loud = announceArrivals(diff, s.mySeat, { gameName: 'your game' });
        if (gossip) gossip.again();
        advertise({ id: s.room, host: user.name, mode: mode, players: roster.length });
        lastSig = null;
        renderLive();
        if (loud && !settings.reducedMotion) {
          confetti(live, { count: 40, power: 0.8, y: 0.3 });
          live.className += ' is-flash';
        }
      });
      s.on('lost', function () {
        if (destroyed || room !== s) return;
        room = null; roster = []; liveState = 'noserver';
        stopAdvertising();
        renderLive();
      });
      renderLive();
    }).catch(function () {
      if (destroyed || room !== s) return;
      room = null; liveState = 'noserver';
      renderLive();
    });
  }

  function startNetworked() {
    if (!room || roster.length < 2) return;
    handedOver = true;
    var s = room;
    nav.go('match', { mode: mode, session: s, networked: true });
  }

  /* ── This week, and the path so far ─────────────────────────────────── */
  root.appendChild(weekStrip());
  root.appendChild(pathStrip(nav));

  /* ── Other games you can join ───────────────────────────────────────── */
  var nearby = section('Games nearby');
  var nearbyList = el('div', 'game-list');
  var nearbyNote = el('p', 'field-note', 'Looking…');
  nearby.appendChild(nearbyList);
  nearby.appendChild(nearbyNote);
  root.appendChild(nearby);

  function renderGames(games, found) {
    if (destroyed) return;
    clear(nearbyList);
    if (!games.length) {
      nearbyNote.textContent = found.hasServer
        ? (room ? 'Nobody else has a game open on ' + (found.serverName || 'this network') + '. Yours is the one to join.'
                : 'No other games open on ' + (found.serverName || 'this network') + '.')
        : 'No room server on this WiFi, so games cannot find each other here yet.';
      return;
    }
    nearbyNote.textContent = '';
    games.forEach(function (g) {
      var cfg = MP_MODES[g.mode] || MP_MODES.together;
      var card = el('button', 'game-card');
      card.type = 'button';
      var av = el('span', 'game-avatar');
      av.innerHTML = racerSvg(g.hostRacer || 'rocket');
      card.appendChild(av);
      var body = el('span', 'game-body');
      body.appendChild(el('span', 'game-title', (g.host || 'Someone') + '’s ' + cfg.label.toLowerCase()));
      var names = (g.who || []).map(function (w) { return w.name; }).join(', ');
      body.appendChild(el('span', 'game-meta',
        (g.players || 1) + (g.players === 1 ? ' player' : ' players') + ' · waiting' + (names ? ' · ' + names : '')));
      card.appendChild(body);
      card.appendChild(el('span', 'game-join', 'Join'));
      card.addEventListener('click', function () { nav.go('joingame', g); });
      nearbyList.appendChild(card);
    });
  }

  function refresh() {
    findGames().then(function (found) {
      if (destroyed) return;
      var mine = room ? room.room : null;
      var others = found.rooms.filter(function (r) { return r.id !== mine; });
      if (!found.hasServer) {
        if (!room && liveState !== 'opening') liveState = 'noserver';
      } else if (!room && liveState !== 'opening') {
        // First in opens the game; everyone after sees it and joins. Two
        // devices opening at the same instant both host, and each then sees
        // the other's room under Games nearby.
        if (others.length) { foundRoom = others[0]; liveState = 'found'; }
        else if (!hostTried) hostRoom();
        else liveState = 'noserver';
      } else if (liveState === 'found') {
        if (!others.length) { foundRoom = null; hostRoom(); }
        else foundRoom = others[0];
      }
      renderLive();
      renderGames(others.concat(found.tabs.filter(function (t) { return t.id !== mine; })), found);
    }).catch(function () {
      if (destroyed) return;
      if (liveState === 'probing') { liveState = 'noserver'; renderLive(); }
      nearbyNote.textContent = 'Could not look for games just now.';
    });
  }
  renderLive();
  refresh();
  var poll = setInterval(refresh, 4000);

  /* ── Play on this device ───────────────────────────────────────────── */
  var start = section('Play on this device');
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

  /* Playing across devices by hand. Both routes work on WiFi with no internet. */
  var across = section('Across devices');
  var pair = el('div', 'home-row');
  pair.appendChild(button('Join a game', 'btn btn-quiet', function () { nav.go('joinroom'); }));
  pair.appendChild(button('Invite a phone', 'btn btn-quiet', function () { nav.go('p2phost', { mode: mode }); }));
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
    destroy: function () {
      destroyed = true;
      clearInterval(poll);
      stopAdvertising();
      // The match owns the room from here; otherwise leaving the lobby
      // closes the game we opened, so nobody joins a room with no host.
      if (room && !handedOver) room.destroy();
    }
  };
}

/**
 * Seven dots for this week, filled on days anyone in the house played, and
 * the best week ever. Accumulation only — a missed day leaves a gap and takes
 * nothing away. This is the deliberate opposite of a streak.
 */
function weekStrip() {
  var st = logState();
  var days = {};
  for (var id in st.users) {
    (st.users[id].sessions || []).forEach(function (s) {
      if (s.start) days[dayKey(s.start)] = true;
    });
  }
  var now = new Date();
  var monday = new Date(now); monday.setHours(0, 0, 0, 0);
  monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
  var wrap = el('div', 'week');
  var count = 0;
  for (var i = 0; i < 7; i++) {
    var d = new Date(monday); d.setDate(monday.getDate() + i);
    var on = !!days[dayKey(d.getTime())];
    if (on) count++;
    var dot = el('span', 'week-dot' + (on ? ' is-on' : '') + (d.toDateString() === now.toDateString() ? ' is-today' : ''));
    dot.setAttribute('aria-label', ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'][i] + (on ? ' played' : ''));
    wrap.appendChild(dot);
  }
  // Best week ever, from the whole history.
  var weeks = {};
  for (var k in days) { var dt = new Date(k); var wk = weekKey(dt); weeks[wk] = (weeks[wk] || 0) + 1; }
  var best = 0; for (var w in weeks) best = Math.max(best, weeks[w]);
  var label = el('span', 'week-label', count + (count === 1 ? ' day' : ' days') + ' this week' + (best > count ? ' · best ' + best : ''));
  wrap.appendChild(label);
  return wrap;
}

function dayKey(ms) { var d = new Date(ms); return d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate(); }
function weekKey(d) { var m = new Date(d); m.setHours(0,0,0,0); m.setDate(m.getDate() - ((m.getDay() + 6) % 7)); return m.getTime(); }

/**
 * The path: the last few sessions as nodes and the next one lit, with the
 * Expedition behind it. Even before the map, this says "you are somewhere".
 */
function pathStrip(nav) {
  var st = logState();
  var user = Users.getActiveUser();
  var u = st.users[user.id];
  var wrap = el('button', 'path');
  wrap.type = 'button';
  wrap.setAttribute('aria-label', 'The Expedition map');
  var nodes = el('span', 'path-nodes');
  var recent = u ? u.sessions.slice(-5) : [];
  for (var i = 0; i < 5; i++) {
    var s = recent[i];
    var n = el('span', 'path-node' + (s ? ' is-done' : '') + (i === recent.length ? ' is-next' : ''));
    if (s && s.recovered && s.recovered.length) n.className += ' is-turned';
    nodes.appendChild(n);
  }
  wrap.appendChild(nodes);
  wrap.appendChild(el('span', 'path-label', u && u.sessions.length ? 'The Expedition · ' + u.sessions.length + (u.sessions.length === 1 ? ' leg' : ' legs') : 'The Expedition'));
  wrap.appendChild(el('span', 'game-join', 'Map'));
  wrap.addEventListener('click', function () { nav.go('map'); });
  return wrap;
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
