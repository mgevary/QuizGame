/**
 * results.js — the end-of-game card.
 *
 * This screen is the actual reward of the whole product, and its shape is a
 * deliberate reading of the motivation research: it is INFORMATIONAL (it
 * tells you something true about what you learned), and it is CONTINGENT ON
 * PLAYING rather than on winning. Those are the two forms of reward that do
 * not undermine the wish to play again.
 *
 * So the biggest thing on it is never the winner. It is the list of things a
 * child got wrong earlier and has now got right.
 */

import { el, button } from '../ui/dom.js';
import { racerSvg, badgeSvg } from '../ui/art.js';
import { icon, placeIcon } from '../ui/icons.js';
import { MP_MODES } from '../net/coordinator.js';
import { topbar, section } from './home.js';
import { createRenderer } from '../track/render.js';
import { state as logState } from '../sync/log.js';
import { burst as confetti } from '../ui/confetti.js';

export function matchResultsScreen(nav, summary) {
  summary = summary || { players: [], board: null, mode: 'solo' };
  var root = el('div', 'screen screen-results');
  root.appendChild(topbar('Well played', function () { nav.go('home'); }));

  var recoveredAll = [];
  summary.players.forEach(function (p) {
    p.recovered.forEach(function (r) { if (r) recoveredAll.push({ who: p.name, what: r }); });
  });

  /**
   * The replay. Peloton ends a class with your output curve; this ends a game
   * with the race itself, run again in five seconds — pit stops and all. It
   * tells the true story of the game without a single number, and a child
   * will watch it every time.
   */
  if (summary.replay && summary.replay.history && summary.replay.history.length > 1) {
    var wrap = el('div', 'replay');
    var canvas = el('canvas', 'track-canvas');
    wrap.appendChild(canvas);
    root.appendChild(wrap);
    var rp = summary.replay;
    var renderer = null;
    var hist = rp.history;
    var total = hist[hist.length - 1].at || 1;
    var DURATION = 5000;
    var t0 = null, raf = null, lastFrame = 0;

    function entitiesAt(ms) {
      // Find the latest snapshot at or before this moment.
      var i = 0;
      while (i + 1 < hist.length && hist[i + 1].at <= ms) i++;
      var snap = hist[i];
      var seats = Object.keys(snap.positions);
      if (rp.teams) {
        return Object.keys(rp.teams).map(function (t) {
          var members = rp.teams[t] || [];
          var sum = 0, pit = false;
          members.forEach(function (m) { sum += snap.positions[m] || 0; if (snap.pits.indexOf(String(m)) !== -1) pit = true; });
          var who = rp.roster[members[0]] || { name: 'Team ' + t, racer: 'rocket' };
          var teams = Object.keys(rp.teams).length;
          return { key: 'team' + t, position: members.length ? sum / members.length : 0,
            label: teams > 1 ? who.name + ' · ' + t : who.name, racer: who.racer, pit: pit,
            tint: teams > 1 ? (t === 'A' ? '#5DB2FF' : '#FF9A5C') : null };
        });
      }
      return seats.map(function (k) {
        var who = rp.roster[k] || { name: 'Player', racer: 'rocket' };
        return { key: 'p' + k, position: snap.positions[k] || 0, label: who.name, racer: who.racer, pit: snap.pits.indexOf(String(k)) !== -1 };
      });
    }

    function frame(now) {
      if (!renderer) return;
      if (t0 === null) t0 = now;
      var dt = Math.min(0.05, (now - lastFrame) / 1000);
      lastFrame = now;
      var ms = Math.min(total, ((now - t0) / DURATION) * total);
      renderer.draw({ length: rp.length, checkpoints: rp.checkpoints, leg: 99 }, entitiesAt(ms), dt);
      if (ms < total) raf = requestAnimationFrame(frame);
    }
    setTimeout(function () {
      renderer = createRenderer(canvas, { theme: rp.theme, seed: rp.seed });
      raf = requestAnimationFrame(frame);
    }, 30);
    var again = button('Watch again', 'link-btn', function () { t0 = null; lastFrame = 0; if (raf) cancelAnimationFrame(raf); raf = requestAnimationFrame(frame); });
    root.appendChild(again);
  }

  /* The headline: what the group turned around, never who won. */
  var card = el('div', 'card card-result');
  var badge = el('div', 'result-badge');
  badge.innerHTML = badgeSvg(recoveredAll.length ? 'recovery' : 'mastery');
  card.appendChild(badge);

  if (recoveredAll.length) {
    card.appendChild(el('h2', 'result-head',
      recoveredAll.length + (recoveredAll.length === 1 ? ' thing' : ' things') + ' turned around'));
    card.appendChild(el('p', 'result-lead', 'Got wrong before. Got right today.'));
    var ul = el('ul', 'result-list');
    recoveredAll.slice(0, 4).forEach(function (r) {
      var li = el('li');
      li.appendChild(el('strong', null, r.who + ': '));
      li.appendChild(el('span', null, r.what));
      ul.appendChild(li);
    });
    card.appendChild(ul);
  } else {
    var total = 0;
    summary.players.forEach(function (p) { total += p.answered; });
    card.appendChild(el('h2', 'result-head', total + ' questions'));
    card.appendChild(el('p', 'result-lead',
      'Come back tomorrow — the ones worth remembering come round again then.'));
  }
  root.appendChild(card);
  // Arriving here is worth a burst whatever happened: you played.
  setTimeout(function () { confetti(card, { count: recoveredAll.length ? 110 : 60, power: recoveredAll.length ? 1.3 : 1 }); }, 350);

  /* Personal records — against your own past only. The comparison a child
     can always win, and the one Peloton got right. */
  var prs = [];
  var st = logState();
  summary.players.forEach(function (p) {
    var u = st.users[p.id];
    if (!u || u.sessions.length < 2) return;
    var last = u.sessions[u.sessions.length - 1];
    var prevTurns = 0, prevRec = 0;
    for (var i = 0; i < u.sessions.length - 1; i++) {
      prevTurns = Math.max(prevTurns, u.sessions[i].turns || 0);
      prevRec = Math.max(prevRec, (u.sessions[i].recovered || []).length);
    }
    if ((last.turns || 0) > prevTurns && last.turns >= 8) prs.push(p.name + ': most questions in one game — ' + last.turns);
    if ((last.recovered || []).length > prevRec && last.recovered.length >= 2) prs.push(p.name + ': most turned around in one game — ' + last.recovered.length);
  });
  if (prs.length) {
    var pr = section('Personal best');
    prs.forEach(function (line) { pr.appendChild(el('div', 'pr-line', line)); });
    root.appendChild(pr);
  }

  /* How the game itself went, framed by mode. */
  var board = summary.board;
  if (board && board.kind === 'together') {
    var s = section('Together');
    var bar = el('div', 'together-bar');
    var fill = el('div', 'together-fill');
    fill.style.width = Math.min(100, Math.round((board.distance / board.length) * 100)) + '%';
    bar.appendChild(fill);
    s.appendChild(bar);
    s.appendChild(el('p', 'field-note', board.distance + ' of ' + board.length + ' — everyone pulled.'));
    board.members.forEach(function (m) { s.appendChild(playerRow(m, summary)); });
    root.appendChild(s);
  } else if (board && board.kind === 'teams') {
    var t = section(board.rows[0].distance === board.rows[1].distance ? 'A draw' : 'Team ' + board.rows[0].team + ' pulled hardest');
    board.rows.forEach(function (row) {
      var head = el('div', 'team-result');
      head.appendChild(el('span', 'team-badge is-' + row.team.toLowerCase(), row.team));
      head.appendChild(el('span', 'team-distance', String(row.distance)));
      t.appendChild(head);
      // Members are listed, never ranked against each other: a four-year-old
      // should not be able to read themselves as the reason a team lost.
      row.members.forEach(function (m) { t.appendChild(playerRow(m, summary)); });
    });
    root.appendChild(t);
  } else if (board && board.kind === 'race') {
    var r = section('Finish');
    board.rows.forEach(function (row) { r.appendChild(playerRow(row, summary, row.place)); });
    root.appendChild(r);
  }

  if (summary.skipped && summary.skipped.length) {
    root.appendChild(el('p', 'field-note',
      summary.skipped.join(' and ') + ' had no modules switched on, so they sat this one out.'));
  }

  var cfg = MP_MODES[summary.mode];
  root.appendChild(button('Play again', 'btn btn-big btn-go', function () {
    nav.go(summary.mode === 'solo' ? 'play' : 'setup', { mode: summary.mode });
  }));
  root.appendChild(button('Done', 'btn btn-quiet', function () { nav.go('home'); }));
  return root;
}

function playerRow(member, summary, place) {
  var full = null;
  for (var i = 0; i < summary.players.length; i++) {
    if (summary.players[i].name === member.name) full = summary.players[i];
  }
  var row = el('div', 'result-row');
  var av = el('span', 'result-avatar');
  av.innerHTML = racerSvg(full && full.avatar ? full.avatar : 'rocket');
  row.appendChild(av);
  var body = el('div', 'result-body');
  body.appendChild(el('span', 'result-name', member.name));
  var meta = [];
  if (full) meta.push(full.answered + ' answered');
  if (full && full.recovered.length) meta.push(full.recovered.length + ' turned around');
  body.appendChild(el('span', 'result-meta', meta.join(' · ')));
  row.appendChild(body);
  if (place) {
    var mark = placeIcon(place);
    row.appendChild(mark ? icon(mark, 26, 'result-place') : el('span', 'result-place', '#' + place));
  }
  return row;
}
