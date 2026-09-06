/**
 * trace.js — the drawing surface for tracing letters, digits and shapes.
 *
 * Strokes are stored as arrays of points, never as a bitmap. A child's
 * drawing is one or two kilobytes that way, against a hundred or more as a
 * PNG — which matters because drawings go into the replicated event log and
 * into a 5MB storage budget, and because vectors redraw crisply at any size.
 */

import { el, clear, button } from '../ui/dom.js';
import { promptNode } from './index.js';
import { glyphStrokes, score } from './trace-score.js';
import { BAND_INFO } from '../content/bands.js';

export function createTrace(host, props) {
  var item = props.item;
  var band = BAND_INFO[props.band] || BAND_INFO.K;
  var target = item.path ? parsePath(item.path) : glyphStrokes(item.glyph);
  var node = el('div', 'q q-trace');
  node.appendChild(promptNode(props));

  var stage = el('div', 'q-trace-stage');
  var canvas = el('canvas', 'q-trace-canvas');
  stage.appendChild(canvas);
  node.appendChild(stage);

  var actions = el('div', 'q-trace-actions');
  var clearBtn = button('Start again', 'btn btn-quiet', function () { strokes = []; redraw(); });
  var doneBtn = button('Done', 'btn btn-go', function () { finish(); });
  actions.appendChild(clearBtn);
  actions.appendChild(doneBtn);
  node.appendChild(actions);
  host.appendChild(node);

  var ctx = canvas.getContext('2d');
  var strokes = [];
  var current = null;
  var size = 0;
  var done = false;

  function fit() {
    var box = stage.getBoundingClientRect();
    size = Math.max(180, Math.min(box.width, 420));
    var dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.floor(size * dpr);
    canvas.height = Math.floor(size * dpr);
    canvas.style.width = size + 'px';
    canvas.style.height = size + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    redraw();
  }

  function toLocal(e) {
    var r = canvas.getBoundingClientRect();
    var t = e.touches && e.touches.length ? e.touches[0] : e;
    return [((t.clientX - r.left) / r.width) * 100, ((t.clientY - r.top) / r.height) * 100];
  }

  function redraw() {
    ctx.clearRect(0, 0, size, size);
    var k = size / 100;
    // The guide: a wide, pale path the child follows. Wide on purpose — a
    // hairline would read as "be accurate", which is the wrong instruction
    // for a two-year-old.
    if (target) {
      ctx.strokeStyle = 'rgba(255,255,255,0.16)';
      ctx.lineWidth = band.traceTolerance * 2 * 100 * k * 0.5;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      drawStrokes(target, k);
      ctx.strokeStyle = 'rgba(255,255,255,0.5)';
      ctx.setLineDash([6, 8]);
      ctx.lineWidth = 2;
      drawStrokes(target, k);
      ctx.setLineDash([]);
      // Where each stroke starts, so a child knows where to put the pen.
      for (var s = 0; s < target.length; s++) {
        ctx.fillStyle = '#8ce36b';
        ctx.beginPath();
        ctx.arc(target[s][0][0] * k, target[s][0][1] * k, 7, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.strokeStyle = '#57c7ff';
    ctx.lineWidth = 9;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    drawStrokes(strokes, k);
  }

  function drawStrokes(list, k) {
    for (var i = 0; i < list.length; i++) {
      var st = list[i];
      if (st.length < 2) continue;
      ctx.beginPath();
      ctx.moveTo(st[0][0] * k, st[0][1] * k);
      for (var j = 1; j < st.length; j++) ctx.lineTo(st[j][0] * k, st[j][1] * k);
      ctx.stroke();
    }
  }

  function down(e) {
    if (done) return;
    e.preventDefault();
    current = [toLocal(e)];
    strokes.push(current);
  }
  function move(e) {
    if (done || !current) return;
    e.preventDefault();
    var p = toLocal(e);
    var last = current[current.length - 1];
    if (Math.abs(p[0] - last[0]) + Math.abs(p[1] - last[1]) < 0.8) return;
    current.push(p);
    redraw();
  }
  function up() { current = null; }

  canvas.addEventListener('mousedown', down);
  canvas.addEventListener('mousemove', move);
  window.addEventListener('mouseup', up);
  canvas.addEventListener('touchstart', down, { passive: false });
  canvas.addEventListener('touchmove', move, { passive: false });
  canvas.addEventListener('touchend', up);
  window.addEventListener('resize', fit);

  function finish() {
    if (done) return;
    if (!strokes.length) return;
    done = true;
    var result = target ? score(strokes, target, {
      radius: band.traceTolerance,
      passCoverage: band.tracePass[0],
      passPrecision: band.tracePass[1],
      // Stroke order is only assessed from grade 1. A three-year-old who
      // draws a good B from the bottom up has done the thing we wanted.
      checkOrder: ['G1', 'G2', 'G3', 'G4', 'G5', 'G6', 'A'].indexOf(props.band) !== -1
    }) : { pass: true, score: 1, coverage: 1, precision: 1, formation: true };
    node.className = 'q q-trace ' + (result.pass ? 'is-right' : 'is-wrong');
    props.onAnswer(result.pass, { strokes: flatten(strokes), score: result.score, formation: result.formation });
  }

  setTimeout(fit, 0);

  return {
    node: node,
    destroy: function () {
      done = true;
      window.removeEventListener('mouseup', up);
      window.removeEventListener('resize', fit);
    },
    focus: function () {}
  };
}

/** Round to whole units: a drawing is stored as small integers, not floats. */
function flatten(strokes) {
  var out = [];
  for (var i = 0; i < strokes.length; i++) {
    var st = [];
    for (var j = 0; j < strokes[i].length; j++) st.push(Math.round(strokes[i][j][0]), Math.round(strokes[i][j][1]));
    out.push(st);
  }
  return out;
}

/** A minimal SVG path reader: M and L only, which is all a glyph needs. */
function parsePath(d) {
  var strokes = [];
  var cur = null;
  var tokens = String(d).match(/[MLml][^MLml]*/g) || [];
  for (var i = 0; i < tokens.length; i++) {
    var cmd = tokens[i][0];
    var nums = (tokens[i].slice(1).match(/-?\d*\.?\d+/g) || []).map(Number);
    for (var j = 0; j + 1 < nums.length; j += 2) {
      var p = [nums[j], nums[j + 1]];
      if (cmd === 'M' || cmd === 'm') { cur = [p]; strokes.push(cur); }
      else if (cur) cur.push(p);
    }
  }
  return strokes.length ? strokes : null;
}
