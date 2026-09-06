/**
 * Quiz Quest relay. NOT DEPLOYED YET — written so the client seam is real.
 *
 * Two Durable Objects:
 *   Room     — the same protocol as scripts/lan-server.mjs, so js/net/lan.js
 *              connects here with nothing but a different URL. The coordinator
 *              it drives is the very same js/net/coordinator.js.
 *   Mailbox  — an unordered bag of immutable events per family, so paired
 *              devices converge without ever meeting. It has no opinion about
 *              the events and cannot resolve a conflict because the design
 *              has none.
 *
 * Nothing here is a source of truth. A room dies in an hour; a mailbox entry
 * dies in thirty days.
 */
import { createCoordinator } from '../../js/net/coordinator.js';

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'content-type' };
    if (req.method === 'OPTIONS') return new Response(null, { headers: cors });

    // The same probe the lobby uses against a LAN server.
    if (url.pathname === '/info') {
      return new Response(JSON.stringify({ name: 'Quiz Quest relay', rooms: [] }),
        { headers: { 'content-type': 'application/json', ...cors } });
    }

    if (url.pathname === '/ws') {
      // One Durable Object per room code; a new room gets a fresh code.
      const code = url.searchParams.get('room') || newCode();
      const id = env.ROOMS.idFromName(code);
      return env.ROOMS.get(id).fetch(new Request(req.url + '&code=' + code, req));
    }

    const mb = url.pathname.match(/^\/mailbox\/([A-Za-z0-9_-]{4,40})$/);
    if (mb) {
      const id = env.MAILBOX.idFromName(mb[1]);
      const res = await env.MAILBOX.get(id).fetch(req);
      return new Response(res.body, { status: res.status, headers: { ...Object.fromEntries(res.headers), ...cors } });
    }
    return new Response('not found', { status: 404, headers: cors });
  }
};

function newCode() { return String(Math.floor(1000 + Math.random() * 9000)); }

/** A room. Mirrors scripts/lan-server.mjs message for message. */
export class Room {
  constructor(state) {
    this.state = state;
    this.seats = new Map();
    this.next = 0;
    this.hostSeat = 0;
    this.code = null;
    const io = {
      now: () => Date.now(),
      seats: () => [...this.seats.keys()].sort((a, b) => a - b),
      sendTo: (seat, msg) => this.send(seat, msg),
      broadcast: (msg, except) => { for (const seat of this.seats.keys()) if (seat !== except) this.send(seat, msg); }
    };
    this.co = createCoordinator(io);
  }

  send(seat, msg) {
    const ws = this.seats.get(seat);
    if (ws) { try { ws.send(JSON.stringify(msg)); } catch {} }
  }

  async fetch(req) {
    const url = new URL(req.url);
    this.code = this.code || url.searchParams.get('code');
    if (req.headers.get('upgrade') !== 'websocket') return new Response('expected websocket', { status: 426 });
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    server.accept();
    let seat = null;

    server.addEventListener('message', (e) => {
      let msg;
      try { msg = JSON.parse(e.data); } catch { return; }
      if (msg.t === 'hi') {
        if (this.seats.size >= 6) { server.send(JSON.stringify({ t: 'error', message: 'That game is full.' })); return; }
        seat = this.next++;
        this.seats.set(seat, server);
        this.co.addPlayer(seat, { name: msg.name, racer: msg.racer, band: msg.band, userId: msg.userId });
        server.send(JSON.stringify({ t: 'hi-ok', seat, room: this.code, roster: this.co.rosterList() }));
        if (this.co.state.match) server.send(JSON.stringify({ t: 'start', match: this.co.state.match, roster: this.co.rosterList(), track: this.co.snapshot() }));
        return;
      }
      if (seat === null) return;
      if (msg.t === 'start-match') { if (seat === this.hostSeat) this.co.startMatch(msg.mode, msg.opts || {}); return; }
      if (msg.t === 'step') { this.co.onStep(seat, { d: msg.d, skillHash: msg.skillHash }); return; }
      if (msg.t === 'pit') { this.co.onPit(seat, msg.on); return; }
      if (msg.t === 'cheer') { this.co.onCheer(seat, msg.to, msg.emoji); return; }
      if (msg.t === 'done') { this.co.onFinish(seat); return; }
      if (['sync-have', 'sync-events', 'pair-req', 'pair-ok', 'module'].includes(msg.t)) {
        for (const [s, peer] of this.seats) if (s !== seat) { try { peer.send(JSON.stringify({ ...msg, from: seat })); } catch {} }
      }
    });
    server.addEventListener('close', () => {
      if (seat === null) return;
      this.seats.delete(seat);
      this.co.removePlayer(seat);
    });
    // Ticks resolve an unanswered buzz round; alarms are how a DO keeps time.
    this.state.storage.setAlarm(Date.now() + 1000);
    return new Response(null, { status: 101, webSocket: client });
  }

  async alarm() {
    this.co.tick();
    if (this.seats.size) this.state.storage.setAlarm(Date.now() + 1000);
  }
}

/** A mailbox: push events, pull events. Dedup by id; nothing else. */
export class Mailbox {
  constructor(state) { this.state = state; }

  async fetch(req) {
    const TTL = 30 * 24 * 3600 * 1000;
    if (req.method === 'POST') {
      const incoming = await req.json().catch(() => null);
      if (!Array.isArray(incoming)) return new Response('bad', { status: 400 });
      const now = Date.now();
      // The only validation is shape and size; the client validates events.
      const puts = {};
      for (const e of incoming.slice(0, 500)) {
        if (e && typeof e.id === 'string' && e.id.length < 64) puts['e:' + e.id] = { e, at: now };
      }
      await this.state.storage.put(puts);
      return new Response(JSON.stringify({ stored: Object.keys(puts).length }), { headers: { 'content-type': 'application/json' } });
    }
    // GET ?since=<ms> returns everything stored after that moment.
    const since = Number(new URL(req.url).searchParams.get('since') || 0);
    const all = await this.state.storage.list({ prefix: 'e:' });
    const out = [];
    const dead = [];
    for (const [k, v] of all) {
      if (Date.now() - v.at > TTL) { dead.push(k); continue; }
      if (v.at > since) out.push(v.e);
    }
    if (dead.length) await this.state.storage.delete(dead);
    return new Response(JSON.stringify({ events: out, now: Date.now() }), { headers: { 'content-type': 'application/json' } });
  }
}
