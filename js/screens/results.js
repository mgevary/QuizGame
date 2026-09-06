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

export function matchResultsScreen(nav, summary) {
  summary = summary || { players: [], board: null, mode: 'solo' };
  var root = el('div', 'screen screen-results');
  root.appendChild(topbar('Well played', function () { nav.go('home'); }));

  var recoveredAll = [];
  summary.players.forEach(function (p) {
    p.recovered.forEach(function (r) { if (r) recoveredAll.push({ who: p.name, what: r }); });
  });

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
