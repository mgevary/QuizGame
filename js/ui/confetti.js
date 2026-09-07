/**
 * confetti.js — a burst of coloured pieces over an element, drawn on a
 * temporary canvas. No library, no files; sixty rectangles and gravity.
 *
 * Used sparingly, because it is the biggest celebration the app has and a
 * celebration that happens every time is not a celebration. A right answer
 * gets a small one; a recovery, the finish and a personal best get the full
 * thing.
 */

var COLORS = ['#6E8BFF', '#4ED6A3', '#F5C542', '#E4694F', '#D9557E', '#3FBFAE', '#ffffff'];

/**
 * @param {Element} host   positioned ancestor to overlay
 * @param {object} [o]     {count, power, x, y}  x/y as 0..1 of host
 */
export function burst(host, o) {
  o = o || {};
  var rect = host.getBoundingClientRect();
  if (!rect.width) return;
  var canvas = document.createElement('canvas');
  canvas.className = 'confetti';
  var dpr = Math.min(2, window.devicePixelRatio || 1);
  canvas.width = rect.width * dpr;
  canvas.height = rect.height * dpr;
  canvas.style.width = rect.width + 'px';
  canvas.style.height = rect.height + 'px';
  host.appendChild(canvas);
  var ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  var n = o.count || 60;
  var power = o.power || 1;
  var ox = (o.x === undefined ? 0.5 : o.x) * rect.width;
  var oy = (o.y === undefined ? 0.45 : o.y) * rect.height;
  var parts = [];
  for (var i = 0; i < n; i++) {
    var ang = -Math.PI / 2 + (Math.random() - 0.5) * 1.6;
    var sp = (180 + Math.random() * 260) * power;
    parts.push({
      x: ox, y: oy,
      vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp,
      w: 5 + Math.random() * 6, h: 3 + Math.random() * 5,
      rot: Math.random() * 6.28, vr: (Math.random() - 0.5) * 12,
      color: COLORS[i % COLORS.length], life: 0
    });
  }

  var last = null, raf = null;
  function frame(now) {
    if (last === null) last = now;
    var dt = Math.min(0.04, (now - last) / 1000);
    last = now;
    ctx.clearRect(0, 0, rect.width, rect.height);
    var alive = 0;
    for (var i = 0; i < parts.length; i++) {
      var p = parts[i];
      p.life += dt;
      if (p.life > 1.5) continue;
      alive++;
      p.vy += 620 * dt;
      p.vx *= 0.985;
      p.x += p.vx * dt; p.y += p.vy * dt;
      p.rot += p.vr * dt;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.globalAlpha = p.life > 1.1 ? Math.max(0, 1 - (p.life - 1.1) / 0.4) : 1;
      ctx.fillStyle = p.color;
      ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
      ctx.restore();
    }
    if (alive) raf = requestAnimationFrame(frame);
    else if (canvas.parentNode) canvas.parentNode.removeChild(canvas);
  }
  raf = requestAnimationFrame(frame);
  return { stop: function () { if (raf) cancelAnimationFrame(raf); if (canvas.parentNode) canvas.parentNode.removeChild(canvas); } };
}
