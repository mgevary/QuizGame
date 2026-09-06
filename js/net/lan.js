/**
 * lan.js — the room-server client. One WebSocket, a four-digit room code, no
 * QR scanning.
 *
 * This is the good family setup: a laptop on the WiFi runs `npm run lan`,
 * everyone opens the address it prints, and joins by typing a code. It is
 * also the only way a TV can host, because a TV has no camera to scan a
 * joiner's answer with.
 *
 * The SERVER runs the coordinator here, not the host device — which is why
 * every client in this file is a joiner and none of them apply their own
 * distance. That is the same guarantee p2p.js gives by making the host
 * authoritative; only the location of the referee changes.
 *
 * The server URL is resolved in one place so this exact file also speaks to a
 * Cloudflare Durable Object, which is functionally the same thing at the edge.
 */

import { readRaw } from '../store.js';

export var ROOM_SERVER_KEY = 'quiz/roomServer.v1';

export function roomServerUrl() {
  var override = readRaw(ROOM_SERVER_KEY);
  if (override) return String(override).replace(/\/$/, '') + '/ws';
  return (location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '/ws';
}

export function hasRoomServerOverride() { return !!readRaw(ROOM_SERVER_KEY); }

/**
 * Is a room server reachable? On GitHub Pages with no override this 404s,
 * which is the answer we want and costs one request. The service worker
 * refuses to cache it, so a cached page can never wrongly believe a server is
 * there.
 */
export function probeRooms() {
  var base = readRaw(ROOM_SERVER_KEY);
  var url = base ? String(base).replace(/\/$/, '') + '/info' : 'lan/info';
  return fetch(url, { cache: 'no-store' })
    .then(function (r) { return r.ok ? r.json() : null; })
    .catch(function () { return null; });
}

/**
 * @param {object} cfg {name, racer, band, userId, room, create, mode}
 * @returns a session with the same shape local.js and p2p.js return.
 */
export function createRoomSession(cfg) {
  var handlers = {};
  var ws = null;
  var mySeat = null;
  var roomCode = cfg.room || null;
  var roster = [];
  var track = null;
  var board = null;
  var destroyed = false;
  var queue = [];

  function deliver(msg) {
    if (msg.t === 'hi-ok') { mySeat = msg.seat; roomCode = msg.room; roster = msg.roster || []; }
    if (msg.t === 'roster') roster = msg.roster || [];
    if (msg.t === 'start') { roster = msg.roster || roster; track = msg.track; }
    if (msg.t === 'state' || msg.t === 'checkpoint' || msg.t === 'finished') track = msg.track || track;
    if (msg.t === 'results') { board = msg.results; track = msg.track || track; }
    var fn = handlers[msg.t];
    if (fn) fn(msg);
  }

  function send(msg) {
    if (ws && ws.readyState === 1) { try { ws.send(JSON.stringify(msg)); } catch (e) {} }
    else queue.push(msg);
  }

  var session = {
    kind: 'room',
    get mySeat() { return mySeat; },
    get room() { return roomCode; },

    on: function (type, fn) { handlers[type] = fn; return session; },

    connect: function () {
      return new Promise(function (resolve, reject) {
        try { ws = new WebSocket(roomServerUrl()); }
        catch (e) { reject(new Error('Could not reach the room server.')); return; }

        var settled = false;
        var giveUp = setTimeout(function () {
          if (!settled) { settled = true; reject(new Error('The room server did not answer.')); }
        }, 12000);

        ws.onopen = function () {
          send({
            t: 'hi', name: cfg.name, racer: cfg.racer, band: cfg.band, userId: cfg.userId,
            room: cfg.room || null, create: !!cfg.create
          });
          var q = queue; queue = [];
          for (var i = 0; i < q.length; i++) send(q[i]);
        };
        ws.onmessage = function (e) {
          var msg;
          try { msg = JSON.parse(e.data); } catch (err) { return; }
          if (msg.t === 'error' && !settled) {
            settled = true; clearTimeout(giveUp);
            reject(new Error(msg.message || 'The room server refused.'));
            return;
          }
          deliver(msg);
          if (msg.t === 'hi-ok' && !settled) { settled = true; clearTimeout(giveUp); resolve(msg); }
        };
        ws.onclose = function () {
          if (!settled) { settled = true; clearTimeout(giveUp); reject(new Error('The room server closed the connection.')); }
          else if (!destroyed && handlers.lost) handlers.lost({});
        };
        ws.onerror = function () { /* onclose reports it */ };
      });
    },

    // Only the room's host may start; the server ignores it from anyone else.
    start: function (mode, opts) { send({ t: 'start-match', mode: mode, opts: opts || {} }); return null; },
    step: function (seat, delta, skillHash) { send({ t: 'step', d: delta, skillHash: skillHash }); },
    pit: function (seat, on) { send({ t: 'pit', on: on }); },
    cheer: function (from, to, emoji) { send({ t: 'cheer', to: to, emoji: emoji }); },
    finishSeat: function () { send({ t: 'done' }); },
    sendRaw: function (msg) { send(msg); },
    roster: function () { return roster; },
    snapshot: function () { return track; },
    scoreboard: function () { return board; },
    playerCount: function () { return roster.length; },

    destroy: function () {
      destroyed = true;
      handlers = {};
      try { if (ws) ws.close(); } catch (e) {}
    }
  };
  return session;
}
