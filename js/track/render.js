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

var THEMES = {
  race:  { sky: '#0d1428', far: '#1b2547', near: '#243055', ground: '#2e2a4a', line: '#3d4880', kind: 'hills' },
  tug:   { sky: '#160f28', far: '#2a1c44', near: '#3a2757', ground: '#3b2a52', line: '#584080', kind: 'trees' },
  night: { sky: '#080b18', far: '#141a33', near: '#1d2444', ground: '#232a4a', line: '#38416e', kind: 'city' }
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
  var eased = {};                 // seat -> smoothed position, so movement glides
  var bursts = [];

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

  function celebrate(seat) { bursts.push({ seat: seat, t: 0 }); }

  function draw(track, roster, dt) {
    if (!w) fit();
    ctx.clearRect(0, 0, w, h);

    ctx.fillStyle = theme.sky;
    ctx.fillRect(0, 0, w, h);

    // Parallax scenery, deterministic from the seed so the same race looks
    // the same on every device.
    drawSvgLayer(sceneryLayer(seed, w, h, { kind: theme.kind, color: theme.far, count: 7, scale: 1, baseline: 0.78 }));
    drawSvgLayer(sceneryLayer(seed + 7, w, h, { kind: theme.kind, color: theme.near, count: 11, scale: 0.6, baseline: 0.86 }));

    var groundY = h * 0.86;
    ctx.fillStyle = theme.ground;
    ctx.fillRect(0, groundY, w, h - groundY);

    var pad = 34;
    var span = w - pad * 2;
    var xFor = function (pos) { return pad + (Math.min(pos, track.length) / track.length) * span; };

    // Checkpoints: the pack regroups here, so they read as gates, not hazards.
    for (var c = 0; c < track.checkpoints.length; c++) {
      var cx = xFor(track.checkpoints[c]);
      ctx.strokeStyle = c < track.leg ? '#8ce36b' : theme.line;
      ctx.lineWidth = 2;
      ctx.setLineDash([4, 6]);
      ctx.beginPath(); ctx.moveTo(cx, h * 0.34); ctx.lineTo(cx, groundY); ctx.stroke();
      ctx.setLineDash([]);
    }
    // The finish.
    var fx = xFor(track.length);
    ctx.fillStyle = '#ffffff';
    for (var r = 0; r < 8; r++) {
      for (var q = 0; q < 2; q++) {
        if ((r + q) % 2) continue;
        ctx.fillRect(fx + q * 6, h * 0.34 + r * ((groundY - h * 0.34) / 8), 6, (groundY - h * 0.34) / 8);
      }
    }

    var seats = Object.keys(track.positions);
    var lane = (groundY - h * 0.36) / Math.max(1, seats.length);
    for (var i = 0; i < seats.length; i++) {
      var seat = seats[i];
      var info = roster[seat] || { name: 'Player', racer: RACERS[i % RACERS.length].id };
      var targetPos = track.positions[seat];
      if (eased[seat] === undefined) eased[seat] = targetPos;
      // Framerate-independent smoothing: the racer glides to its new spot
      // rather than teleporting, which is what makes progress feel earned.
      var k = 1 - Math.pow(0.001, Math.max(0.001, dt || 0.016));
      eased[seat] += (targetPos - eased[seat]) * k;

      var x = xFor(eased[seat]);
      var y = h * 0.34 + lane * i + lane * 0.5;
      var size = Math.max(26, Math.min(40, lane * 0.9));

      // A trail behind, so you can see how far you have come.
      ctx.strokeStyle = 'rgba(255,255,255,0.09)';
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(pad, y + size * 0.4); ctx.lineTo(x, y + size * 0.4); ctx.stroke();

      var img = racerImage(info.racer || RACERS[i % RACERS.length].id);
      if (img.complete && img.naturalWidth) ctx.drawImage(img, x - size / 2, y - size / 2, size, size);

      // In the pit: a workshop bubble, never a cross or a sad face. A wrong
      // answer is a repair job, and it is the most valuable thing that can
      // happen in the session.
      if (track.pits[seat]) {
        ctx.fillStyle = 'rgba(255,212,82,0.16)';
        ctx.beginPath(); ctx.arc(x, y, size * 0.85, 0, Math.PI * 2); ctx.fill();
        ctx.font = Math.round(size * 0.5) + 'px system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('🔧', x, y - size * 0.6);
      }

      ctx.font = '600 11px system-ui, -apple-system, sans-serif';
      ctx.fillStyle = 'rgba(255,255,255,0.82)';
      ctx.textAlign = 'center';
      ctx.fillText(info.name, x, y + size * 0.75 + 10);
    }

    for (var b = bursts.length - 1; b >= 0; b--) {
      bursts[b].t += dt || 0.016;
      if (bursts[b].t > 0.9) { bursts.splice(b, 1); continue; }
    }
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
    celebrate: celebrate,
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
