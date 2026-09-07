/**
 * track/render.js — the canvas painter. Owns no game rules: everything it
 * draws is read from a view model, so a new metaphor is a new renderer and
 * never a change to the model.
 *
 * The world is ALIVE even when nobody is answering. Stars drift, the scenery
 * scrolls slowly on its own and faster when the leader moves, the racers bob,
 * the rocket's exhaust flickers, the flag waves. A static painting reads as
 * a worksheet; a world that keeps moving reads as a place.
 *
 * The rules it enforces visually: a racer never moves backwards, a wrong
 * answer parks you in a PIT with a repair badge rather than a failure, and
 * the viewport always frames everybody so nobody feels erased.
 */

import { RACERS, racerSvg } from '../ui/art.js';

/* ── colour helpers ─────────────────────────────────────────────────── */
function rgb(hex) {
  var m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex || '');
  return m ? [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)] : [110, 139, 255];
}
function mix(a, b, t) {
  return [Math.round(a[0] + (b[0] - a[0]) * t), Math.round(a[1] + (b[1] - a[1]) * t), Math.round(a[2] + (b[2] - a[2]) * t)];
}
function css(c, a) { return 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + (a === undefined ? 1 : a) + ')'; }

var INK = [10, 13, 22];

/**
 * A palette from one hue. The Expedition's regions each carry a hue, so the
 * whole game warms, cools and shifts as the crew travels — which is what
 * makes the twentieth session look different from the first.
 */
function paletteFor(hue) {
  var h = rgb(hue || '#6E8BFF');
  return {
    skyTop: mix(INK, h, 0.22),
    skyMid: mix(INK, h, 0.40),
    horizon: mix(INK, h, 0.62),
    far: mix(INK, h, 0.30),
    near: mix(INK, h, 0.42),
    ground: mix(INK, h, 0.36),
    line: mix(INK, h, 0.55),
    glow: h
  };
}

var cache = {};
function racerImage(id) {
  if (cache[id]) return cache[id];
  var img = new Image();
  img.src = 'data:image/svg+xml;utf8,' + encodeURIComponent(racerSvg(id));
  cache[id] = img;
  return img;
}

/** Seeded, so the same race shows the same sky on every device. */
function makeRng(seed) {
  var s = (Math.abs(seed | 0) % 2147483646) + 1;
  return function () { s = (s * 48271) % 2147483647; return (s - 1) / 2147483646; };
}

export function createRenderer(canvas, opts) {
  var ctx = canvas.getContext('2d');
  var w = 0, h = 0;
  var seed = (opts && opts.seed) || 1;
  var pal = paletteFor(opts && opts.hue);
  var kind = (opts && opts.theme) === 'tug' ? 'trees' : 'hills';
  var eased = {};           // entity key -> smoothed position
  var lastPos = {};         // entity key -> last drawn position, to detect motion
  var floats = [];          // {key, text, t, color}
  var scroll = 0;           // world scroll, in px
  var time = 0;
  var countdownValue = null;

  // The sky is seeded once: star field and hill shapes never jitter.
  var rng = makeRng(seed);
  var stars = [];
  for (var i = 0; i < 46; i++) stars.push({ x: rng(), y: rng() * 0.62, r: 0.6 + rng() * 1.5, p: rng() * 6.28, s: 0.6 + rng() * 1.4 });
  var hillsFar = [], hillsNear = [];
  for (var j = 0; j < 9; j++) hillsFar.push({ x: j / 8, hgt: 0.22 + rng() * 0.26, wd: 0.16 + rng() * 0.12 });
  for (var k = 0; k < 13; k++) hillsNear.push({ x: k / 12, hgt: 0.10 + rng() * 0.16, wd: 0.10 + rng() * 0.08 });

  function fit() {
    var box = canvas.parentNode.getBoundingClientRect();
    w = Math.max(240, box.width);
    h = Math.max(120, Math.min(220, box.height || 168));
    var dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.floor(w * dpr);
    canvas.height = Math.floor(h * dpr);
    canvas.style.width = w + 'px';
    canvas.style.height = h + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function setHue(hue) { pal = paletteFor(hue); }

  /** A little rising label from an entity: "+1", "+2 ×2", "Turned around". */
  function float(key, text, color) {
    floats.push({ key: key, text: text, t: 0, color: color || '#4ED6A3' });
  }

  function setCountdown(v) { countdownValue = v; }

  function drawSky() {
    var g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, css(pal.skyTop));
    g.addColorStop(0.55, css(pal.skyMid));
    g.addColorStop(1, css(pal.horizon));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);

    // A soft glow on the horizon in the region's own colour.
    var glow = ctx.createRadialGradient(w * 0.5, h * 0.9, 10, w * 0.5, h * 0.9, w * 0.7);
    glow.addColorStop(0, css(pal.glow, 0.22));
    glow.addColorStop(1, css(pal.glow, 0));
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, w, h);

    for (var i = 0; i < stars.length; i++) {
      var s = stars[i];
      var tw = 0.45 + 0.55 * (0.5 + 0.5 * Math.sin(time * s.s + s.p));
      var x = ((s.x * w - scroll * 0.04) % w + w) % w;
      ctx.fillStyle = 'rgba(255,255,255,' + (tw * 0.85).toFixed(2) + ')';
      ctx.beginPath(); ctx.arc(x, s.y * h, s.r, 0, Math.PI * 2); ctx.fill();
    }
  }

  function drawHills(list, color, speed, base) {
    ctx.fillStyle = css(color);
    var off = (scroll * speed) % w;
    for (var pass = -1; pass <= 1; pass++) {
      for (var i = 0; i < list.length; i++) {
        var hl = list[i];
        var cx = hl.x * w - off + pass * w;
        var hh = hl.hgt * h, ww = hl.wd * w;
        if (kind === 'trees') {
          ctx.beginPath();
          ctx.moveTo(cx - ww * 0.5, base); ctx.lineTo(cx, base - hh); ctx.lineTo(cx + ww * 0.5, base); ctx.closePath();
          ctx.fill();
        } else {
          ctx.beginPath();
          ctx.moveTo(cx - ww, base);
          ctx.quadraticCurveTo(cx, base - hh * 2, cx + ww, base);
          ctx.closePath();
          ctx.fill();
        }
      }
    }
  }

  function drawFlag(x, top, bottom) {
    // The flag waves: the checks ripple with time.
    var cols = 2, rows = 8;
    var cellH = (bottom - top) / rows;
    for (var r = 0; r < rows; r++) {
      var wave = Math.sin(time * 5 + r * 0.7) * 2.2;
      for (var c = 0; c < cols; c++) {
        ctx.fillStyle = (r + c) % 2 ? '#ffffff' : '#12131c';
        ctx.fillRect(x + c * 6 + wave, top + r * cellH, 6, cellH + 0.5);
      }
    }
    ctx.strokeStyle = 'rgba(255,255,255,.55)';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(x - 1, top); ctx.lineTo(x - 1, bottom + 6); ctx.stroke();
  }

  function drawExhaust(x, y, size, strength) {
    // Only the rocket has an exhaust; everyone else gets a little speed line.
    var len = size * (0.25 + 0.35 * strength) * (0.8 + 0.2 * Math.sin(time * 40));
    var g = ctx.createLinearGradient(x, y + size * 0.45, x, y + size * 0.45 + len);
    g.addColorStop(0, 'rgba(255,170,80,.95)');
    g.addColorStop(1, 'rgba(255,90,60,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(x - size * 0.11, y + size * 0.44);
    ctx.lineTo(x + size * 0.11, y + size * 0.44);
    ctx.lineTo(x, y + size * 0.44 + len);
    ctx.closePath();
    ctx.fill();
  }

  /**
   * @param {object} meta  {length, checkpoints, leg, hue?}
   * @param {object[]} ents [{key, position, label, racer, pit, tint}]
   */
  function draw(meta, ents, dt) {
    if (!w) fit();
    dt = Math.min(0.05, dt || 0.016);
    time += dt;
    if (meta.hue && meta.hue !== pal._hue) { pal = paletteFor(meta.hue); pal._hue = meta.hue; }

    // The world always drifts a little; it drifts more when the leader moves.
    var leaderMotion = 0;
    for (var e0 = 0; e0 < ents.length; e0++) {
      var key0 = ents[e0].key;
      if (eased[key0] === undefined) eased[key0] = ents[e0].position;
      var k0 = 1 - Math.pow(0.001, Math.max(0.001, dt));
      eased[key0] += (ents[e0].position - eased[key0]) * k0;
      var moved = eased[key0] - (lastPos[key0] === undefined ? eased[key0] : lastPos[key0]);
      lastPos[key0] = eased[key0];
      if (moved > leaderMotion) leaderMotion = moved;
    }
    scroll += dt * 7 + leaderMotion * (w / Math.max(1, meta.length)) * 0.6;

    ctx.clearRect(0, 0, w, h);
    drawSky();

    var groundY = h * 0.86;
    drawHills(hillsFar, pal.far, 0.25, h * 0.80);
    drawHills(hillsNear, pal.near, 0.55, groundY + 2);
    ctx.fillStyle = css(pal.ground);
    ctx.fillRect(0, groundY, w, h - groundY);
    // A road line on the ground, scrolling.
    ctx.strokeStyle = 'rgba(255,255,255,.18)';
    ctx.lineWidth = 2;
    ctx.setLineDash([10, 12]);
    ctx.lineDashOffset = -(scroll * 0.9) % 22;
    ctx.beginPath(); ctx.moveTo(0, groundY + (h - groundY) * 0.5); ctx.lineTo(w, groundY + (h - groundY) * 0.5); ctx.stroke();
    ctx.setLineDash([]);

    var pad = 36;
    var span = w - pad * 2;
    var xFor = function (pos) { return pad + (Math.min(pos, meta.length) / meta.length) * span; };

    var cps = meta.checkpoints || [];
    for (var c = 0; c < cps.length; c++) {
      var cx = xFor(cps[c]);
      var done = c < meta.leg;
      ctx.strokeStyle = done ? 'rgba(78,214,163,.85)' : css(pal.line, 0.9);
      ctx.lineWidth = 2;
      ctx.setLineDash([4, 6]);
      ctx.beginPath(); ctx.moveTo(cx, h * 0.30); ctx.lineTo(cx, groundY); ctx.stroke();
      ctx.setLineDash([]);
      // A small pennant on each gate.
      ctx.fillStyle = done ? '#4ED6A3' : css(pal.glow, 0.9);
      ctx.beginPath(); ctx.moveTo(cx, h * 0.30); ctx.lineTo(cx + 9, h * 0.30 + 4); ctx.lineTo(cx, h * 0.30 + 8); ctx.closePath(); ctx.fill();
    }
    drawFlag(xFor(meta.length), h * 0.30, groundY);

    var top = h * 0.30;
    var lane = (groundY - top) / Math.max(1, ents.length);
    var size = Math.max(22, Math.min(44, lane - 12));

    for (var i = 0; i < ents.length; i++) {
      var e = ents[i];
      var x = xFor(eased[e.key]);
      var bob = Math.sin(time * 2.6 + i * 1.7) * 2.2;
      var y = top + lane * i + size * 0.5 + 2 + bob;
      var moving = Math.abs(e.position - eased[e.key]) > 0.02;

      // Trail behind, tinted for a team.
      ctx.strokeStyle = e.tint ? css(rgb(e.tint), 0.35) : 'rgba(255,255,255,0.14)';
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(pad, y + size * 0.42); ctx.lineTo(x, y + size * 0.42); ctx.stroke();

      var img = racerImage(e.racer || RACERS[i % RACERS.length].id);
      if (moving || e.racer === 'rocket') {
        if (e.racer === 'rocket') drawExhaust(x, y, size, moving ? 1 : 0.4);
      }
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(moving ? 0.12 : 0);
      if (img.complete && img.naturalWidth) ctx.drawImage(img, -size / 2, -size / 2, size, size);
      ctx.restore();

      if (e.pit) {
        var by = y - size * 0.66;
        var pr = size * 0.28;
        ctx.fillStyle = 'rgba(232,163,61,0.95)';
        ctx.beginPath(); ctx.arc(x, by, pr, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = '#1b2033';
        ctx.lineWidth = Math.max(1.4, pr * 0.22);
        ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(x - pr * 0.42, by + pr * 0.42); ctx.lineTo(x + pr * 0.26, by - pr * 0.26); ctx.stroke();
        ctx.beginPath(); ctx.arc(x + pr * 0.38, by - pr * 0.38, pr * 0.3, Math.PI * 0.65, Math.PI * 2.1); ctx.stroke();
      }

      ctx.font = '600 10.5px system-ui, -apple-system, sans-serif';
      ctx.fillStyle = e.tint || 'rgba(255,255,255,0.88)';
      ctx.textAlign = 'center';
      ctx.fillText(e.label, x, y + size * 0.5 + 11);

      // Floats rise from the racer they belong to.
      for (var f = floats.length - 1; f >= 0; f--) {
        var fl = floats[f];
        if (fl.key !== e.key) continue;
        fl.t += dt;
        if (fl.t > 1.1) { floats.splice(f, 1); continue; }
        var a = fl.t < 0.15 ? fl.t / 0.15 : 1 - Math.max(0, (fl.t - 0.6) / 0.5);
        ctx.font = '800 15px system-ui, -apple-system, sans-serif';
        ctx.fillStyle = fl.color;
        ctx.globalAlpha = Math.max(0, a);
        ctx.fillText(fl.text, x + size * 0.55, y - size * 0.4 - fl.t * 34);
        ctx.globalAlpha = 1;
      }
    }

    // The countdown lives ON the track, with the racers at the line.
    if (countdownValue !== null) {
      ctx.fillStyle = 'rgba(10,13,22,.45)';
      ctx.fillRect(0, 0, w, h);
      ctx.font = '800 ' + Math.round(h * 0.62) + 'px system-ui, -apple-system, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = countdownValue === 'Go' ? '#4ED6A3' : '#ffffff';
      ctx.shadowColor = 'rgba(0,0,0,.5)';
      ctx.shadowBlur = 18;
      ctx.fillText(String(countdownValue), w / 2, h * 0.5);
      ctx.shadowBlur = 0;
      ctx.textBaseline = 'alphabetic';
    }
  }

  fit();
  window.addEventListener('resize', fit);
  return {
    draw: draw,
    fit: fit,
    float: float,
    setHue: setHue,
    setCountdown: setCountdown,
    destroy: function () { window.removeEventListener('resize', fit); }
  };
}

/** A compact progress strip for a small question screen. */
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
