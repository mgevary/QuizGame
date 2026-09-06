/**
 * p2p.js — device-to-device play over WebRTC, with no server anywhere.
 *
 * Signalling travels by QR code: the host shows an invite, the joiner's phone
 * camera opens it as a link, the joiner's screen shows an answer QR, and the
 * host scans that back. Copy-and-paste works as a fallback for both halves.
 *
 * `iceServers: []` is deliberate. With no STUN server this only connects
 * devices on the same network — home WiFi, or a phone's hotspot — which is
 * exactly the case this is for, and it means the game needs no infrastructure
 * at all and works with the internet switched off. Reaching across the
 * internet is what the room server in lan.js is for.
 *
 * The host is a COORDINATOR, not a simulator: it fixes the match, applies
 * distance and owns the finish order, while every device renders its own
 * screen. Seat 0 is the host, delivered locally, so the host plays through
 * exactly the same code path as everyone else.
 *
 * ES2018 / Safari 12 safe — WebRTC is Safari 11+.
 */

import { createCoordinator } from './coordinator.js';

/* ── lazy vendor loading ──────────────────────────────────────────────────
 * 360KB of QR and deflate code never loads unless someone opens multiplayer.
 */
var loaded = {};
export function loadScript(src) {
  if (loaded[src]) return loaded[src];
  loaded[src] = new Promise(function (resolve, reject) {
    var s = document.createElement('script');
    s.src = src;
    s.onload = function () { resolve(); };
    s.onerror = function () { delete loaded[src]; reject(new Error('failed to load ' + src)); };
    document.head.appendChild(s);
  });
  return loaded[src];
}

export function loadSignalling() {
  return Promise.all([loadScript('js/vendor/pako.js'), loadScript('js/vendor/qrcode.js')]);
}
export function loadScanner() {
  return loadScript('js/vendor/jsqr.js');
}

/* ── signal codes: deflate(JSON) → base64url ─────────────────────────── */

function b64urlFromBytes(bytes) {
  var bin = '';
  for (var i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function bytesFromB64url(str) {
  var b64 = String(str).replace(/-/g, '+').replace(/_/g, '/');
  while (b64.length % 4) b64 += '=';
  var bin = atob(b64);
  var out = new Uint8Array(bin.length);
  for (var i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export function encodeSignal(obj) {
  return b64urlFromBytes(window.pako.deflateRaw(JSON.stringify(obj), { level: 9 }));
}

export function decodeSignal(code) {
  return JSON.parse(window.pako.inflateRaw(bytesFromB64url(code), { to: 'string' }));
}

/** The link a joiner's camera opens. */
export function inviteUrl(code) {
  return location.origin + location.pathname + '#p2p=' + code;
}

export function readJoinCode(hash) {
  var m = String(hash || '').match(/[#&]p2p=([A-Za-z0-9_-]+)/);
  return m ? m[1] : null;
}

/* ── WebRTC plumbing ─────────────────────────────────────────────────── */

function makePc() {
  var RTC = window.RTCPeerConnection || window.webkitRTCPeerConnection;
  if (!RTC) throw new Error('This browser cannot do device-to-device play.');
  return new RTC({ iceServers: [] });   // same-network only, and no server anywhere
}

/**
 * Non-trickle ICE: wait for candidate gathering to finish, or time out, so
 * the whole description fits in ONE QR code. Trickling would mean a
 * conversation, and there is no channel to have it on yet.
 */
function waitIce(pc) {
  return new Promise(function (resolve) {
    if (pc.iceGatheringState === 'complete') { resolve(); return; }
    var done = false;
    function finish() { if (!done) { done = true; resolve(); } }
    pc.addEventListener('icegatheringstatechange', function () {
      if (pc.iceGatheringState === 'complete') finish();
    });
    setTimeout(finish, 3500);
  });
}

function openChannel(pc, onMessage, onOpen, onClose) {
  // Ordered and reliable: this is a turn-based game, and a dropped step means
  // a child's answer vanishing. The latency cost is irrelevant here.
  var channel = pc.createDataChannel('quiz', { ordered: true });
  wireChannel(channel, onMessage, onOpen, onClose);
  return channel;
}

function wireChannel(channel, onMessage, onOpen, onClose) {
  channel.onmessage = function (e) {
    var msg;
    try { msg = JSON.parse(e.data); } catch (err) { return; }
    onMessage(msg);
  };
  channel.onopen = function () { if (onOpen) onOpen(); };
  channel.onclose = function () { if (onClose) onClose(); };
}

function send(channel, msg) {
  if (channel && channel.readyState === 'open') {
    try { channel.send(JSON.stringify(msg)); } catch (e) { /* dropped */ }
  }
}

/* ── host ────────────────────────────────────────────────────────────── */

/**
 * @param {object} cfg {name, racer, band, userId}
 * @returns a session with the same shape local.js returns, so the game screen
 *          cannot tell which transport it is on.
 */
export function createHost(cfg) {
  var handlers = {};
  var peers = [];          // {pc, channel, seat, info, open}
  var pending = null;
  var destroyed = false;

  function seatsOpen() {
    var out = [0];
    for (var i = 0; i < peers.length; i++) if (peers[i].open) out.push(peers[i].seat);
    return out;
  }

  function peerAt(seat) {
    for (var i = 0; i < peers.length; i++) if (peers[i].seat === seat) return peers[i];
    return null;
  }

  function deliverLocal(msg) {
    var fn = handlers[msg.t];
    if (fn) fn(msg);
  }

  var io = {
    now: function () { return Date.now(); },
    seats: seatsOpen,
    sendTo: function (seat, msg) {
      if (seat === 0) { deliverLocal(msg); return; }
      send((peerAt(seat) || {}).channel, msg);
    },
    broadcast: function (msg, exceptSeat) {
      if (exceptSeat !== 0) deliverLocal(msg);
      for (var i = 0; i < peers.length; i++) {
        if (peers[i].open && peers[i].seat !== exceptSeat) send(peers[i].channel, msg);
      }
    }
  };

  var co = createCoordinator(io);
  co.addPlayer(0, cfg);
  var timer = setInterval(function () { co.tick(); }, 1000);

  function handleFromPeer(peer, msg) {
    if (msg.t === 'hi') {
      peer.info = { name: String(msg.name || 'Guest').slice(0, 16), racer: msg.racer, band: msg.band, userId: msg.userId };
      peer.open = true;
      co.addPlayer(peer.seat, peer.info);
      send(peer.channel, { t: 'hi-ok', seat: peer.seat, roster: co.rosterList() });
      // A late joiner is dropped straight into a match already running.
      if (co.state.match) send(peer.channel, { t: 'start', match: co.state.match, roster: co.rosterList(), track: co.snapshot() });
      if (handlers.roster) handlers.roster({ t: 'roster', roster: co.rosterList() });
      return;
    }
    if (msg.t === 'step') { co.onStep(peer.seat, { d: msg.d, skillHash: msg.skillHash }); return; }
    if (msg.t === 'pit') { co.onPit(peer.seat, msg.on); return; }
    if (msg.t === 'cheer') { co.onCheer(peer.seat, msg.to, msg.emoji); return; }
    if (msg.t === 'done') { co.onFinish(peer.seat); return; }
    // Anything else — pairing, gossip — is handed to whoever registered it.
    if (handlers[msg.t]) handlers[msg.t](msg, peer.seat);
  }

  var session = {
    kind: 'p2p-host',
    mySeat: 0,
    co: co,
    peers: peers,

    on: function (type, fn) { handlers[type] = fn; return session; },

    /** Build the invite for the NEXT player. One connection per joiner. */
    makeInvite: function () {
      return loadSignalling().then(function () {
        var pc = makePc();
        var seat = peers.length + 1;
        var peer = { pc: pc, seat: seat, info: null, open: false, channel: null };
        peer.channel = openChannel(pc,
          function (msg) { handleFromPeer(peer, msg); },
          null,
          function () {
            peer.open = false;
            co.removePlayer(peer.seat);
            if (handlers.peerlost) handlers.peerlost({ seat: peer.seat, name: peer.info ? peer.info.name : 'A player' });
          });
        pending = peer;
        return pc.createOffer()
          .then(function (offer) { return pc.setLocalDescription(offer); })
          .then(function () { return waitIce(pc); })
          .then(function () { return encodeSignal({ v: 1, t: 'o', sdp: pc.localDescription.sdp }); });
      });
    },

    /** Take the joiner's answer code and finish the handshake. */
    acceptAnswer: function (code) {
      var msg;
      try { msg = decodeSignal(code); } catch (e) { return Promise.reject(new Error('That code could not be read.')); }
      if (!msg || msg.t !== 'a' || !msg.sdp) return Promise.reject(new Error('That is not a player code.'));
      var peer = pending;
      if (!peer) return Promise.reject(new Error('Make an invite first.'));
      peers.push(peer);
      pending = null;
      return peer.pc.setRemoteDescription({ type: 'answer', sdp: msg.sdp }).then(function () {
        return new Promise(function (resolve, reject) {
          var t = setTimeout(function () {
            reject(new Error('Could not connect. Are both devices on the same WiFi?'));
          }, 15000);
          var iv = setInterval(function () {
            if (destroyed) { clearTimeout(t); clearInterval(iv); return; }
            if (peer.open) { clearTimeout(t); clearInterval(iv); resolve(peer.seat); }
          }, 150);
        });
      });
    },

    start: function (mode, opts) { return co.startMatch(mode, opts); },
    step: function (seat, delta, skillHash) { co.onStep(seat, { d: delta, skillHash: skillHash }); },
    pit: function (seat, on) { co.onPit(seat, on); },
    cheer: function (from, to, emoji) { co.onCheer(from, to, emoji); },
    finishSeat: function (seat) { co.onFinish(seat); },
    sendRaw: function (msg) { io.broadcast(msg, 0); },
    roster: function () { return co.rosterList(); },
    snapshot: function () { return co.snapshot(); },
    scoreboard: function () { return co.scoreboard(); },
    playerCount: function () { return seatsOpen().length; },

    destroy: function () {
      destroyed = true;
      clearInterval(timer);
      for (var i = 0; i < peers.length; i++) { try { peers[i].pc.close(); } catch (e) {} }
      if (pending) { try { pending.pc.close(); } catch (e) {} }
      handlers = {};
    }
  };
  return session;
}

/* ── joiner ──────────────────────────────────────────────────────────── */

export function createJoiner(code, cfg) {
  var handlers = {};
  var mySeat = null;
  var roster = [];
  var track = null;
  var board = null;
  var channel = null;
  var pc = null;
  var destroyed = false;

  function deliver(msg) {
    if (msg.t === 'hi-ok') { mySeat = msg.seat; roster = msg.roster || []; }
    if (msg.t === 'roster') roster = msg.roster || [];
    if (msg.t === 'start') { roster = msg.roster || roster; track = msg.track; }
    if (msg.t === 'state' || msg.t === 'checkpoint' || msg.t === 'finished') track = msg.track || track;
    if (msg.t === 'results') { board = msg.results; track = msg.track || track; }
    var fn = handlers[msg.t];
    if (fn) fn(msg);
  }

  var session = {
    kind: 'p2p-join',
    get mySeat() { return mySeat; },

    on: function (type, fn) { handlers[type] = fn; return session; },

    /** Connect, and produce the answer code the host must scan back. */
    connect: function () {
      return loadSignalling().then(function () {
        var offer;
        try { offer = decodeSignal(code); } catch (e) { throw new Error('That invite could not be read.'); }
        if (!offer || offer.t !== 'o' || !offer.sdp) throw new Error('That is not a game invite.');
        pc = makePc();
        pc.ondatachannel = function (e) {
          channel = e.channel;
          wireChannel(channel, deliver,
            function () { send(channel, { t: 'hi', name: cfg.name, racer: cfg.racer, band: cfg.band, userId: cfg.userId }); },
            function () { if (handlers.lost) handlers.lost({}); });
        };
        return pc.setRemoteDescription({ type: 'offer', sdp: offer.sdp })
          .then(function () { return pc.createAnswer(); })
          .then(function (answer) { return pc.setLocalDescription(answer); })
          .then(function () { return waitIce(pc); })
          .then(function () { return encodeSignal({ v: 1, t: 'a', sdp: pc.localDescription.sdp }); });
      });
    },

    /** Resolves once the host has scanned the answer and the channel opens. */
    waitForHost: function () {
      return new Promise(function (resolve, reject) {
        var t = setTimeout(function () {
          reject(new Error('The host did not scan your code in time.'));
        }, 120000);
        var iv = setInterval(function () {
          if (destroyed) { clearTimeout(t); clearInterval(iv); return; }
          if (mySeat !== null) { clearTimeout(t); clearInterval(iv); resolve(mySeat); }
        }, 150);
      });
    },

    // A joiner never applies its own distance: it reports, the host decides.
    start: function () { return null; },
    step: function (seat, delta, skillHash) { send(channel, { t: 'step', d: delta, skillHash: skillHash }); },
    pit: function (seat, on) { send(channel, { t: 'pit', on: on }); },
    cheer: function (from, to, emoji) { send(channel, { t: 'cheer', to: to, emoji: emoji }); },
    finishSeat: function () { send(channel, { t: 'done' }); },
    sendRaw: function (msg) { send(channel, msg); },
    roster: function () { return roster; },
    snapshot: function () { return track; },
    scoreboard: function () { return board; },
    playerCount: function () { return roster.length; },

    destroy: function () {
      destroyed = true;
      try { if (pc) pc.close(); } catch (e) {}
      handlers = {};
    }
  };
  return session;
}

/* ── QR helpers ──────────────────────────────────────────────────────── */

/** An <img> holding a QR of `text`, sized to its container. */
export function qrNode(text) {
  var qr = window.qrcode(0, 'L');       // auto-size, low EC: SDP payloads are long
  qr.addData(text);
  qr.make();
  var wrap = document.createElement('div');
  wrap.className = 'qr';
  wrap.innerHTML = qr.createImgTag(4, 8);
  var img = wrap.querySelector('img');
  if (img) { img.style.width = '100%'; img.style.height = 'auto'; img.style.imageRendering = 'pixelated'; }
  return wrap;
}

/**
 * Scan a QR from the camera. Returns {stop} and calls onCode once.
 * The host uses this to read the joiner's answer without leaving the app.
 */
export function scanQR(videoEl, canvasEl, onCode, onError) {
  var stopped = false;
  var stream = null;
  var raf = null;

  loadScanner().then(function () {
    return navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
  }).then(function (s) {
    if (stopped) { s.getTracks().forEach(function (t) { t.stop(); }); return; }
    stream = s;
    videoEl.srcObject = s;
    videoEl.setAttribute('playsinline', '');
    videoEl.play();
    var ctx = canvasEl.getContext('2d');
    function tick() {
      if (stopped) return;
      raf = requestAnimationFrame(tick);
      if (videoEl.readyState !== videoEl.HAVE_ENOUGH_DATA) return;
      canvasEl.width = videoEl.videoWidth;
      canvasEl.height = videoEl.videoHeight;
      ctx.drawImage(videoEl, 0, 0, canvasEl.width, canvasEl.height);
      var data = ctx.getImageData(0, 0, canvasEl.width, canvasEl.height);
      var found = window.jsQR(data.data, data.width, data.height, { inversionAttempts: 'dontInvert' });
      if (found && found.data) {
        stopped = true;
        onCode(readJoinCode(found.data) || found.data);
      }
    }
    tick();
  }).catch(function (e) { if (onError) onError(e); });

  return {
    stop: function () {
      stopped = true;
      if (raf) cancelAnimationFrame(raf);
      if (stream) stream.getTracks().forEach(function (t) { t.stop(); });
    }
  };
}
