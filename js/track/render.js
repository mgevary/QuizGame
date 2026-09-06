/**
 * track/render.js — the canvas painter. Owns no game rules: everything it
 * draws is read from a TrackModel, so a new metaphor is a new renderer and
 * never a change to the model.
 *
 * The rules it enforces visually are the ones from docs/LEARNING.md §10:
 * a racer never moves backwards, a wrong answer parks you in a PIT with a
 * workshop bubble rather than showing a failure, and no player is ever
 * scrolled off the screen — the viewport always frames everybody, so nobody
 * feels erased.
 */

import { RACERS, racerSvg, sceneryLayer, burstSvg } from '../ui/art.js';
import * as T from './model.js';

// Muted, low-contrast scenery on purpose: the track is a backdrop, and the
// question in front of it is the thing that should hold a child's eye.
var THEMES = {
  race:  { sky: '#0C1120', far: '#161D33', near: '#1C2440', ground: '#222B49', line: '#333D5E', kind: 'hills' },
  tug:   { sky: '#100D1E', far: '#1B172F', near: '#231E3C', ground: '#2A2447', line: '#3D3560', kind: 'trees' },
  night: { sky: '#080B14', far: '#111726', near: '#171E33', ground: '#1D2540', line: '#2C3552', kind: 'city' }
};

var cache = {};
function racerImage(id) {
  if (cache[id]) return cache[id];
  var img = new Image();
  img.src = 'data:image/svg+xml;utf8,' + encodeURIComponent(racerSvg(id));
  cache[id] = img;
  return img;
}

export function createRenderer(canvas, opts) {
  var ctx = canvas.getContext('2d');
  var w = 0, h = 0;
  var theme = THEMES[(opts && opts.theme) || 'race'] || THEMES.race;
  var seed = (opts && opts.seed) || 1;
  var eased = {};                 // entity key -> smoothed position, so movement glides

  function fit() {
    var box = canvas.parentNode.getBoundingClientRect();
    w = Math.max(240, box.width);
    h = Math.max(110, Math.min(200, box.height || 150));
    var dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.floor(w * dpr);
    canvas.height = Math.floor(h * dpr);
    canvas.style.width = w + 'px';
    canvas.style.height = h + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }


  /**
   * Draw a list of ENTITIES, not a list of seats.
   *
   * In a race an entity is a player, so two children on one screen get two
   * racers. In a team mode an entity is a TEAM: the team moves as one thing,
   * so drawing a lane per child would be a lie about what the distance means,
   * and the youngest would sit visibly last on their own lane in a game that
   * is supposed to be shared. Instead the team has one racer, and the name and
   * avatar under it are whoever's turn it is.
   *
   * @param {object} meta     {length, checkpoints, leg, finishedCount}
   * @param {object[]} ents   [{key, position, label, racer, pit, tint}]
   */
  function draw(meta, ents, dt) {
    if (!w) fit();
    ctx.clearRect(0, 0, w, h);

    ctx.fillStyle = theme.sky;
    ctx.fillRect(0, 0, w, h);

    drawSvgLayer(sceneryLayer(seed, w, h, { kind: theme.kind, color: theme.far, count: 7, scale: 1, baseline: 0.78 }));
    drawSvgLayer(sceneryLayer(seed + 7, w, h, { kind: theme.kind, color: theme.near, count: 11, scale: 0.6, baseline: 0.86 }));

    var groundY = h * 0.86;
    ctx.fillStyle = theme.ground;
    ctx.fillRect(0, groundY, w, h - groundY);

    var pad = 34;
    var span = w - pad * 2;
    var xFor = function (pos) { return pad + (Math.min(pos, meta.length) / meta.length) * span; };

    var cps = meta.checkpoints || [];
    for (var c = 0; c < cps.length; c++) {
      var cx = xFor(cps[c]);
      ctx.strokeStyle = c < meta.leg ? '#4ED6A3' : theme.line;
      ctx.lineWidth = 2;
      ctx.setLineDash([4, 6]);
      ctx.beginPath(); ctx.moveTo(cx, h * 0.34); ctx.lineTo(cx, groundY); ctx.stroke();
      ctx.setLineDash([]);
    }

    var fx = xFor(meta.length);
    ctx.fillStyle = '#ffffff';
    for (var r = 0; r < 8; r++) {
      for (var q = 0; q < 2; q++) {
        if ((r + q) % 2) continue;
        ctx.fillRect(fx + q * 6, h * 0.34 + r * ((groundY - h * 0.34) / 8), 6, (groundY - h * 0.34) / 8);
      }
    }

    var top = h * 0.34;
    var lane = (groundY - top) / Math.max(1, ents.length);
    // The racer AND its name have to fit inside one lane, or a five-player
    // game writes each name across the player below it.
    var size = Math.max(20, Math.min(42, lane - 14));

    for (var i = 0; i < ents.length; i++) {
      var e = ents[i];
      if (eased[e.key] === undefined) eased[e.key] = e.position;
      // Framerate-independent smoothing: the racer glides to its new spot
      // rather than teleporting, which is what makes progress feel earned.
      var k = 1 - Math.pow(0.001, Math.max(0.001, dt || 0.016));
      eased[e.key] += (e.position - eased[e.key]) * k;

      var x = xFor(eased[e.key]);
      var y = top + lane * i + size * 0.5 + 3;

      ctx.strokeStyle = e.tint ? hexToRgba(e.tint, 0.22) : 'rgba(255,255,255,0.09)';
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(pad, y + size * 0.4); ctx.lineTo(x, y + size * 0.4); ctx.stroke();

      var img = racerImage(e.racer || RACERS[i % RACERS.length].id);
      if (img.complete && img.naturalWidth) ctx.drawImage(img, x - size / 2, y - size / 2, size, size);

      // In the pit: a small amber ring with a spanner drawn as strokes. Never
      // a cross and never a sad face — a wrong answer is a repair job, and it
      // is the most valuable thing that can happen in the session.
      if (e.pit) {
        var by = y - size * 0.66;
        var pr = size * 0.28;
        ctx.fillStyle = 'rgba(232,163,61,0.95)';
        ctx.beginPath(); ctx.arc(x, by, pr, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = '#1b2033';
        ctx.lineWidth = Math.max(1.4, pr * 0.22);
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(x - pr * 0.42, by + pr * 0.42);
        ctx.lineTo(x + pr * 0.26, by - pr * 0.26);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(x + pr * 0.38, by - pr * 0.38, pr * 0.3, Math.PI * 0.65, Math.PI * 2.1);
        ctx.stroke();
      }

      ctx.font = '600 10px system-ui, -apple-system, sans-serif';
      ctx.fillStyle = e.tint || 'rgba(255,255,255,0.82)';
      ctx.textAlign = 'center';
      ctx.fillText(e.label, x, y + size * 0.5 + 10);
    }
  }

  function hexToRgba(hex, a) {
    var m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
    if (!m) return 'rgba(255,255,255,' + a + ')';
    return 'rgba(' + parseInt(m[1], 16) + ',' + parseInt(m[2], 16) + ',' + parseInt(m[3], 16) + ',' + a + ')';
  }

  var layerCache = {};
  function drawSvgLayer(body) {
    var key = body.length + ':' + body.slice(0, 40);
    var img = layerCache[key];
    if (!img) {
      img = new Image();
      img.src = 'data:image/svg+xml;utf8,' + encodeURIComponent(
        '<svg xmlns="http://www.w3.org/2000/svg" width="' + Math.round(w) + '" height="' + Math.round(h) + '" viewBox="0 0 ' + Math.round(w) + ' ' + Math.round(h) + '">' + body + '</svg>');
      layerCache[key] = img;
    }
    if (img.complete && img.naturalWidth) ctx.drawImage(img, 0, 0, w, h);
  }

  fit();
  window.addEventListener('resize', fit);
  return {
    draw: draw,
    fit: fit,
    destroy: function () { window.removeEventListener('resize', fit); }
  };
}

/** A compact progress strip for the question screen: your racer, and theirs. */
export function progressStrip(track, roster, mySeat) {
  var wrap = document.createElement('div');
  wrap.className = 'strip';
  var seats = Object.keys(track.positions);
  for (var i = 0; i < seats.length; i++) {
    var seat = seats[i];
    var info = roster[seat] || { name: '?', racer: RACERS[i % RACERS.length].id };
    var row = document.createElement('div');
    row.className = 'strip-row' + (String(seat) === String(mySeat) ? ' is-me' : '');
    var bar = document.createElement('div');
    bar.className = 'strip-bar';
    var fill = document.createElement('div');
    fill.className = 'strip-fill';
    fill.style.width = Math.round((track.positions[seat] / track.length) * 100) + '%';
    var pip = document.createElement('span');
    pip.className = 'strip-pip';
    pip.innerHTML = racerSvg(info.racer || RACERS[i % RACERS.length].id);
    bar.appendChild(fill);
    bar.appendChild(pip);
    pip.style.left = Math.round((track.positions[seat] / track.length) * 100) + '%';
    row.appendChild(bar);
    wrap.appendChild(row);
  }
  return wrap;
}
