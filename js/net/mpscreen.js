/**
 * mpscreen.js — getting devices into the same game.
 *
 * Three routes, offered in the order that actually works for a family:
 *   1. A room server on the WiFi — a code to type, no scanning. Best when a
 *      laptop is on, and the only way a TV can host.
 *   2. Phone to phone by QR — no server at all, works with the internet off.
 *      The handshake is two-way, which is why it is second.
 *   3. Pass and play — always there, needs nothing.
 *
 * The QR handshake is genuinely fiddly, so every step of it also offers
 * copy-and-paste, and says plainly what is happening and what to do next.
 */

import { el, clear, button } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { racerSvg } from '../ui/art.js';
import { MP_MODES } from './coordinator.js';
import * as P2P from './p2p.js';
import { createRoomSession, probeRooms } from './lan.js';

function panel(title, subtitle) {
  var card = el('div', 'card card-connect');
  card.appendChild(el('h2', 'connect-head', title));
  if (subtitle) card.appendChild(el('p', 'field-note', subtitle));
  return card;
}

function rosterList(roster, mySeat) {
  var wrap = el('div', 'connect-roster');
  (roster || []).forEach(function (r) {
    var chip = el('div', 'connect-player' + (r.seat === mySeat ? ' is-me' : ''));
    var av = el('span', 'connect-avatar');
    av.innerHTML = racerSvg(r.racer || 'rocket');
    chip.appendChild(av);
    chip.appendChild(el('span', 'connect-name', r.name));
    wrap.appendChild(chip);
  });
  return wrap;
}

/**
 * Host a game over the room server.
 * @param {object} o {host, me, mode, onReady(session), onCancel}
 */
export function mountRoomHost(o) {
  var handedOver = false;
  var root = el('div', 'connect');
  var card = panel('Getting a room…', null);
  root.appendChild(card);
  o.host.appendChild(root);

  var session = createRoomSession({
    name: o.me.name, racer: o.me.avatar, band: o.me.band, userId: o.me.id, create: true
  });
  var live = true;

  session.connect().then(function () {
    if (!live) return;
    render();
    session.on('roster', function () { if (live) render(); });
  }).catch(function (e) {
    if (!live) return;
    clear(card);
    card.appendChild(el('h2', 'connect-head', 'No room server'));
    card.appendChild(el('p', 'field-note', e.message + ' You can still play on this device, or connect two phones with a QR code.'));
    card.appendChild(button('Back', 'btn btn-quiet', o.onCancel));
  });

  function render() {
    clear(card);
    card.appendChild(el('div', 'teach-kind', MP_MODES[o.mode] ? MP_MODES[o.mode].label : 'Game'));
    card.appendChild(el('h2', 'connect-head', 'Room ' + session.room));
    card.appendChild(el('p', 'field-note',
      'Everyone else opens this same address and taps Join, then types ' + session.room + '.'));
    card.appendChild(el('div', 'room-code', session.room));
    card.appendChild(rosterList(session.roster(), session.mySeat));
    var n = session.roster().length;
    var go = button(n > 1 ? 'Start with ' + n + ' players' : 'Waiting for players…', 'btn btn-big btn-go', function () {
      if (n < 1) return;
      live = false;
      handedOver = true;      // the match owns the connection from here
      o.onReady(session);
    });
    go.disabled = n < 1;
    card.appendChild(go);
    card.appendChild(button('Cancel', 'link-btn', function () { live = false; session.destroy(); o.onCancel(); }));
  }

  return { destroy: function () { live = false; if (!handedOver) session.destroy(); } };
}

/** Join a room by code. */
export function mountRoomJoin(o) {
  var handedOver = false;
  var root = el('div', 'connect');
  var card = panel('Join a game', 'Type the four numbers showing on the other screen.');
  root.appendChild(card);

  var input = el('input', 'field room-input');
  input.type = 'tel';
  input.setAttribute('inputmode', 'numeric');
  input.maxLength = 4;
  input.placeholder = '0000';
  card.appendChild(input);

  var note = el('p', 'field-note', '');
  card.appendChild(note);

  var session = null;
  card.appendChild(button('Join', 'btn btn-big btn-go', function () {
    var code = input.value.replace(/\D/g, '');
    if (code.length !== 4) { note.textContent = 'Four numbers, please.'; return; }
    note.textContent = 'Connecting…';
    session = createRoomSession({
      name: o.me.name, racer: o.me.avatar, band: o.me.band, userId: o.me.id, room: code
    });
    session.connect().then(function () {
      clear(card);
      card.appendChild(el('h2', 'connect-head', 'You are in'));
      card.appendChild(el('p', 'field-note', 'Waiting for the game to start…'));
      card.appendChild(rosterList(session.roster(), session.mySeat));
      session.on('roster', function () {
        var r = card.querySelector('.connect-roster');
        if (r) r.parentNode.replaceChild(rosterList(session.roster(), session.mySeat), r);
      });
      session.on('start', function (m) { handedOver = true; o.onStart(session, m); });
    }).catch(function (e) { note.textContent = e.message; });
  }));
  card.appendChild(button('Back', 'link-btn', o.onCancel));

  o.host.appendChild(root);
  return { destroy: function () { if (session && !handedOver) session.destroy(); } };
}

/**
 * Phone-to-phone hosting: show an invite QR, then scan the joiner's answer.
 * Fiddly by nature — every step also offers copy-and-paste.
 */
export function mountP2PHost(o) {
  var root = el('div', 'connect');
  var card = panel('Invite a player', 'Point the other phone’s camera at this code.');
  root.appendChild(card);
  o.host.appendChild(root);

  var session = P2P.createHost({ name: o.me.name, racer: o.me.avatar, band: o.me.band, userId: o.me.id });
  var scanner = null;
  var live = true;
  var handedOver = false;

  session.on('roster', function () { if (live) renderLobby(); });

  function fail(e) {
    clear(card);
    card.appendChild(el('h2', 'connect-head', 'Could not start'));
    card.appendChild(el('p', 'field-note', e.message || String(e)));
    card.appendChild(button('Back', 'btn btn-quiet', function () { cleanup(); o.onCancel(); }));
  }

  function invite() {
    clear(card);
    card.appendChild(el('p', 'field-note', 'Making an invite…'));
    session.makeInvite().then(function (code) {
      if (!live) return;
      clear(card);
      card.appendChild(el('div', 'teach-kind', 'Step 1 of 2'));
      card.appendChild(el('h2', 'connect-head', 'Scan this with the other phone'));
      card.appendChild(P2P.qrNode(P2P.inviteUrl(code)));
      card.appendChild(el('p', 'field-note',
        'Open the camera on the other phone and point it here. Both phones must be on the same WiFi.'));
      card.appendChild(copyRow(P2P.inviteUrl(code)));
      card.appendChild(button('They have scanned it', 'btn btn-go', readAnswer));
      card.appendChild(button('Cancel', 'link-btn', function () { cleanup(); o.onCancel(); }));
    }).catch(fail);
  }

  function readAnswer() {
    clear(card);
    card.appendChild(el('div', 'teach-kind', 'Step 2 of 2'));
    card.appendChild(el('h2', 'connect-head', 'Now scan their code'));
    card.appendChild(el('p', 'field-note', 'Their screen is showing a code. Point this camera at it.'));

    var video = el('video', 'scan-video');
    video.muted = true;
    var canvas = el('canvas', 'scan-canvas');
    canvas.style.display = 'none';
    card.appendChild(video);
    card.appendChild(canvas);

    var paste = el('textarea', 'field paste-box');
    paste.placeholder = '…or paste their code here';
    paste.rows = 3;
    card.appendChild(paste);
    card.appendChild(button('Use pasted code', 'btn btn-quiet', function () { accept(paste.value.trim()); }));
    card.appendChild(button('Cancel', 'link-btn', function () { cleanup(); o.onCancel(); }));

    scanner = P2P.scanQR(video, canvas, function (code) { accept(code); }, function () {
      card.insertBefore(el('p', 'field-note', 'No camera here — paste their code instead.'), paste);
    });
  }

  function accept(code) {
    if (!code) return;
    if (scanner) { scanner.stop(); scanner = null; }
    clear(card);
    card.appendChild(el('p', 'field-note', 'Connecting…'));
    session.acceptAnswer(code).then(function () { if (live) renderLobby(); }).catch(fail);
  }

  function renderLobby() {
    clear(card);
    card.appendChild(el('h2', 'connect-head', 'Ready'));
    card.appendChild(rosterList(session.roster(), 0));
    card.appendChild(button('Invite another player', 'btn btn-quiet', invite));
    var n = session.playerCount();
    card.appendChild(button('Start with ' + n + ' players', 'btn btn-big btn-go', function () {
      live = false;
      handedOver = true;      // the match owns the connection from here
      if (scanner) scanner.stop();
      o.onReady(session);
    }));
    card.appendChild(button('Cancel', 'link-btn', function () { cleanup(); o.onCancel(); }));
  }

  function cleanup() {
    live = false;
    if (scanner) scanner.stop();
    if (!handedOver) session.destroy();
  }

  P2P.loadSignalling().then(invite).catch(fail);
  return { destroy: cleanup };
}

/** The joiner half of the QR handshake, reached by opening a #p2p= link. */
export function mountP2PJoin(o) {
  var root = el('div', 'connect');
  var card = panel('Joining…', null);
  root.appendChild(card);
  o.host.appendChild(root);

  var session = P2P.createJoiner(o.code, {
    name: o.me.name, racer: o.me.avatar, band: o.me.band, userId: o.me.id
  });
  var live = true;
  var handedOver = false;

  session.on('start', function (m) {
    if (!live) return;
    live = false;
    handedOver = true;
    o.onStart(session, m);
  });

  P2P.loadSignalling().then(function () {
    return session.connect();
  }).then(function (answer) {
    if (!live) return;
    clear(card);
    card.appendChild(el('div', 'teach-kind', 'Almost there'));
    card.appendChild(el('h2', 'connect-head', 'Show this to the host'));
    card.appendChild(P2P.qrNode(answer));
    card.appendChild(el('p', 'field-note', 'They need to scan this code back. Then the game starts.'));
    card.appendChild(copyRow(answer));
    return session.waitForHost();
  }).then(function () {
    if (!live) return;
    clear(card);
    card.appendChild(el('h2', 'connect-head', 'You are in'));
    card.appendChild(el('p', 'field-note', 'Waiting for the host to start…'));
    card.appendChild(rosterList(session.roster(), session.mySeat));
  }).catch(function (e) {
    if (!live) return;
    clear(card);
    card.appendChild(el('h2', 'connect-head', 'Could not join'));
    card.appendChild(el('p', 'field-note', e.message || String(e)));
    card.appendChild(button('Back', 'btn btn-quiet', function () { live = false; session.destroy(); o.onCancel(); }));
  });

  return { destroy: function () { live = false; if (!handedOver) session.destroy(); } };
}

/** A read-only box plus a copy button — the fallback for every QR step. */
function copyRow(text) {
  var wrap = el('div', 'copy-row');
  var box = el('input', 'field copy-box');
  box.type = 'text';
  box.readOnly = true;
  box.value = text;
  wrap.appendChild(box);
  wrap.appendChild(button('Copy', 'btn btn-quiet', function () {
    box.select();
    try { document.execCommand('copy'); } catch (e) {}
    if (navigator.clipboard) navigator.clipboard.writeText(text).catch(function () {});
  }));
  return wrap;
}

export { probeRooms };
