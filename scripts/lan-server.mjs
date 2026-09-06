/**
 * lan-server.mjs — serve the site and host rooms, on one machine on the WiFi.
 *
 * This is the family setup that works best: a laptop runs this, everyone opens
 * the address it prints, and joins with a four-digit code. No QR scanning, and
 * a TV can host because nothing needs a camera.
 *
 * The server is a COORDINATOR, not a simulator. It imports the very same
 * js/net/coordinator.js the browser does, so the rules cannot drift between a
 * room game and a pass-and-play one. It fixes the match, applies distance and
 * owns the finish order; each device renders its own screen.
 *
 *   npm run lan
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';
import { createCoordinator } from '../js/net/coordinator.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.PORT || 8330);

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.png': 'image/png', '.svg': 'image/svg+xml', '.mp3': 'audio/mpeg',
  '.webmanifest': 'application/manifest+json'
};

/* ── rooms ────────────────────────────────────────────────────────────── */

const rooms = new Map();   // code -> {code, co, seats: Map<seat, ws>, next, mode, createdAt}

function code4() {
  let c;
  do { c = String(Math.floor(1000 + Math.random() * 9000)); } while (rooms.has(c));
  return c;
}

function makeRoom() {
  const room = { code: code4(), seats: new Map(), next: 0, mode: null, createdAt: Date.now(), hostSeat: 0 };
  const io = {
    now: () => Date.now(),
    seats: () => [...room.seats.keys()].sort((a, b) => a - b),
    sendTo: (seat, msg) => sendTo(room, seat, msg),
    broadcast: (msg, except) => {
      for (const [seat, ws] of room.seats) if (seat !== except) sendTo(room, seat, msg);
    }
  };
  room.co = createCoordinator(io);
  room.tick = setInterval(() => room.co.tick(), 1000);
  rooms.set(room.code, room);
  return room;
}

function sendTo(room, seat, msg) {
  const ws = room.seats.get(seat);
  if (ws && ws.readyState === 1) { try { ws.send(JSON.stringify(msg)); } catch {} }
}

function closeRoom(room) {
  clearInterval(room.tick);
  rooms.delete(room.code);
}

/** An empty room is rubbish; a very old one is a leak. */
setInterval(() => {
  const now = Date.now();
  for (const room of [...rooms.values()]) {
    if (room.seats.size === 0 && now - room.createdAt > 60_000) closeRoom(room);
    if (now - room.createdAt > 6 * 3600_000) closeRoom(room);
  }
}, 30_000);

/* ── static site + room info ─────────────────────────────────────────── */

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  let pathname = decodeURIComponent(url.pathname);

  // The probe the lobby uses to find out whether a room server exists.
  if (pathname === '/lan/info') {
    res.writeHead(200, { 'content-type': TYPES['.json'], 'cache-control': 'no-store' });
    res.end(JSON.stringify({
      name: os.hostname().replace(/\.local$/, ''),
      rooms: [...rooms.values()]
        .filter(r => r.seats.size > 0 && !r.co.state.match)
        .map(r => ({
          id: r.code, host: r.co.rosterList()[0] ? r.co.rosterList()[0].name : 'Someone',
          mode: r.mode || 'together', players: r.seats.size, kind: 'room'
        }))
    }));
    return;
  }

  if (pathname === '/') pathname = '/index.html';
  const file = path.join(ROOT, pathname);
  if (!file.startsWith(ROOT)) { res.writeHead(403); res.end('no'); return; }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); res.end('not found'); return; }
    res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream' });
    res.end(data);
  });
});

/* ── the room protocol ───────────────────────────────────────────────── */

const wss = new WebSocketServer({ server, path: '/ws' });

wss.on('connection', (ws) => {
  let room = null;
  let seat = null;

  ws.on('message', (raw) => {
    let msg;
    try { msg = JSON.parse(raw.toString()); } catch { return; }

    if (msg.t === 'hi') {
      if (msg.create) room = makeRoom();
      else {
        room = rooms.get(String(msg.room || ''));
        if (!room) { ws.send(JSON.stringify({ t: 'error', message: 'No game with that code.' })); return; }
        if (room.seats.size >= 6) { ws.send(JSON.stringify({ t: 'error', message: 'That game is full.' })); return; }
      }
      seat = room.next++;
      room.seats.set(seat, ws);
      room.co.addPlayer(seat, { name: msg.name, racer: msg.racer, band: msg.band, userId: msg.userId });
      ws.send(JSON.stringify({ t: 'hi-ok', seat, room: room.code, roster: room.co.rosterList() }));
      // Someone arriving mid-match is dropped straight into it.
      if (room.co.state.match) {
        ws.send(JSON.stringify({ t: 'start', match: room.co.state.match, roster: room.co.rosterList(), track: room.co.snapshot() }));
      }
      return;
    }

    if (!room || seat === null) return;

    // Only the seat that opened the room may start it, so a joiner cannot
    // restart the game under everyone else.
    if (msg.t === 'start-match') {
      if (seat !== room.hostSeat) return;
      room.mode = msg.mode;
      room.co.startMatch(msg.mode, msg.opts || {});
      return;
    }
    if (msg.t === 'step') { room.co.onStep(seat, { d: msg.d, skillHash: msg.skillHash }); return; }
    if (msg.t === 'pit') { room.co.onPit(seat, msg.on); return; }
    if (msg.t === 'cheer') { room.co.onCheer(seat, msg.to, msg.emoji); return; }
    if (msg.t === 'done') { room.co.onFinish(seat); return; }

    // Everything else — pairing, gossip, module transfer — is relayed
    // verbatim. The server has no opinion about a family's own data.
    if (msg.t === 'sync-have' || msg.t === 'sync-events' || msg.t === 'pair-req' ||
        msg.t === 'pair-ok' || msg.t === 'module') {
      for (const [s, peer] of room.seats) {
        if (s !== seat && peer.readyState === 1) {
          try { peer.send(JSON.stringify({ ...msg, from: seat })); } catch {}
        }
      }
    }
  });

  ws.on('close', () => {
    if (!room || seat === null) return;
    room.seats.delete(seat);
    room.co.removePlayer(seat);
    if (room.seats.size === 0) closeRoom(room);
  });
});

server.listen(PORT, () => {
  const nets = os.networkInterfaces();
  const addrs = [];
  for (const name of Object.keys(nets)) {
    for (const n of nets[name] || []) {
      if (n.family === 'IPv4' && !n.internal) addrs.push(n.address);
    }
  }
  console.log('Quiz Quest room server\n');
  console.log('  On this machine:  http://localhost:' + PORT + '/');
  for (const a of addrs) console.log('  On the WiFi:      http://' + a + ':' + PORT + '/');
  console.log('\nOpen one of those on every device. One person starts a game,');
  console.log('everyone else joins with the four-digit code.\n');
});
