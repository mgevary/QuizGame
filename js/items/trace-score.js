/**
 * trace-score.js — how close is a child's drawing to the target shape? PURE.
 *
 * Two numbers, because either alone is gameable:
 *   COVERAGE  — how much of the target the child's ink reaches. On its own, a
 *               child could pass by scribbling over the whole box.
 *   PRECISION — how much of the child's ink is actually on the target. On its
 *               own, one careful short stroke would pass.
 *
 * The tolerance radius scales with age band, and that IS the fine-motor
 * accommodation: at pre-nursery the whole arm moves, so 30% of glyph height
 * is a fair margin; by grade 2 it is 9%. Stroke ORDER is checked only from
 * grade 1 — a three-year-old who draws a good-looking B from the bottom up
 * has done the thing we wanted.
 */

/** Glyph outlines on a 0..100 box. Enough for letters and digits. */
export var GLYPHS = {
  A: [[[10, 95], [50, 8], [90, 95]], [[25, 60], [75, 60]]],
  B: [[[22, 8], [22, 95]], [[22, 8], [62, 12], [70, 28], [62, 48], [22, 50]], [[22, 50], [68, 54], [78, 72], [66, 92], [22, 95]]],
  C: [[[78, 22], [50, 8], [24, 26], [20, 52], [26, 80], [52, 95], [78, 80]]],
  D: [[[24, 8], [24, 95]], [[24, 8], [62, 14], [78, 50], [62, 88], [24, 95]]],
  E: [[[76, 8], [24, 8], [24, 95], [76, 95]], [[24, 50], [64, 50]]],
  F: [[[76, 8], [24, 8], [24, 95]], [[24, 50], [64, 50]]],
  G: [[[78, 22], [50, 8], [24, 26], [20, 52], [26, 80], [52, 95], [78, 78], [78, 55], [56, 55]]],
  H: [[[22, 8], [22, 95]], [[78, 8], [78, 95]], [[22, 50], [78, 50]]],
  I: [[[50, 8], [50, 95]], [[30, 8], [70, 8]], [[30, 95], [70, 95]]],
  J: [[[70, 8], [70, 74], [50, 94], [28, 78]]],
  K: [[[24, 8], [24, 95]], [[76, 8], [24, 52]], [[42, 42], [78, 95]]],
  L: [[[26, 8], [26, 95], [76, 95]]],
  M: [[[18, 95], [18, 8], [50, 58], [82, 8], [82, 95]]],
  N: [[[22, 95], [22, 8], [78, 95], [78, 8]]],
  O: [[[50, 8], [22, 30], [18, 52], [24, 78], [50, 95], [76, 78], [82, 52], [78, 30], [50, 8]]],
  P: [[[24, 95], [24, 8], [64, 12], [76, 30], [64, 50], [24, 52]]],
  Q: [[[50, 8], [22, 30], [18, 52], [24, 78], [50, 95], [76, 78], [82, 52], [78, 30], [50, 8]], [[60, 72], [86, 98]]],
  R: [[[24, 95], [24, 8], [64, 12], [76, 30], [64, 50], [24, 52]], [[46, 52], [78, 95]]],
  S: [[[78, 22], [50, 8], [26, 20], [28, 42], [56, 52], [76, 64], [74, 84], [48, 95], [22, 82]]],
  T: [[[16, 10], [84, 10]], [[50, 10], [50, 95]]],
  U: [[[22, 8], [22, 66], [40, 92], [62, 92], [78, 66], [78, 8]]],
  V: [[[16, 8], [50, 95], [84, 8]]],
  W: [[[12, 8], [32, 95], [50, 42], [68, 95], [88, 8]]],
  X: [[[20, 8], [80, 95]], [[80, 8], [20, 95]]],
  Y: [[[20, 8], [50, 50], [80, 8]], [[50, 50], [50, 95]]],
  Z: [[[20, 10], [80, 10], [20, 94], [80, 94]]],
  0: [[[50, 8], [24, 30], [20, 52], [26, 78], [50, 95], [74, 78], [80, 52], [76, 30], [50, 8]]],
  1: [[[32, 24], [50, 8], [50, 95]], [[30, 95], [70, 95]]],
  2: [[[24, 26], [50, 8], [74, 24], [70, 46], [24, 94], [78, 94]]],
  3: [[[24, 20], [52, 8], [74, 24], [58, 48], [76, 68], [64, 92], [28, 90]]],
  4: [[[66, 95], [66, 8], [18, 68], [84, 68]]],
  5: [[[74, 10], [30, 10], [26, 46], [56, 42], [76, 60], [70, 86], [34, 94]]],
  6: [[[70, 12], [40, 26], [26, 56], [30, 82], [54, 95], [76, 80], [72, 58], [46, 50], [28, 62]]],
  7: [[[20, 10], [80, 10], [44, 95]]],
  8: [[[50, 8], [28, 22], [30, 42], [50, 50], [72, 42], [74, 22], [50, 8]], [[50, 50], [26, 64], [24, 84], [50, 95], [76, 84], [74, 64], [50, 50]]],
  9: [[[70, 44], [50, 54], [28, 44], [30, 22], [54, 8], [74, 22], [74, 56], [60, 92], [34, 95]]]
};

export function glyphStrokes(ch) {
  return GLYPHS[String(ch).toUpperCase()] || null;
}

/** Resample a polyline into `n` roughly evenly spaced points. */
export function resample(points, n) {
  if (points.length < 2) return points.slice();
  var total = 0, i;
  for (i = 1; i < points.length; i++) total += dist(points[i - 1], points[i]);
  if (total === 0) return [points[0]];
  var step = total / (n - 1);
  var out = [points[0]];
  var acc = 0;
  var cur = points[0];
  var idx = 1;
  while (idx < points.length && out.length < n) {
    var d = dist(cur, points[idx]);
    if (acc + d >= step) {
      var t = (step - acc) / d;
      var p = [cur[0] + (points[idx][0] - cur[0]) * t, cur[1] + (points[idx][1] - cur[1]) * t];
      out.push(p);
      cur = p;
      acc = 0;
    } else {
      acc += d;
      cur = points[idx];
      idx++;
    }
  }
  while (out.length < n) out.push(points[points.length - 1]);
  return out;
}

function dist(a, b) { var dx = a[0] - b[0], dy = a[1] - b[1]; return Math.sqrt(dx * dx + dy * dy); }

/** Nearest distance from a point to any segment of a polyline set. */
export function distanceToStrokes(p, strokes) {
  var best = Infinity;
  for (var s = 0; s < strokes.length; s++) {
    var pts = strokes[s];
    for (var i = 1; i < pts.length; i++) {
      var d = pointSegment(p, pts[i - 1], pts[i]);
      if (d < best) best = d;
    }
    if (pts.length === 1) best = Math.min(best, dist(p, pts[0]));
  }
  return best;
}

function pointSegment(p, a, b) {
  var vx = b[0] - a[0], vy = b[1] - a[1];
  var wx = p[0] - a[0], wy = p[1] - a[1];
  var len2 = vx * vx + vy * vy;
  var t = len2 === 0 ? 0 : Math.max(0, Math.min(1, (wx * vx + wy * vy) / len2));
  var cx = a[0] + t * vx, cy = a[1] + t * vy;
  var dx = p[0] - cx, dy = p[1] - cy;
  return Math.sqrt(dx * dx + dy * dy);
}

/**
 * @param {Array<Array<[number,number]>>} drawn   the child's strokes, 0..100
 * @param {Array<Array<[number,number]>>} target  the glyph's strokes, 0..100
 * @param {object} opts {radius, passCoverage, passPrecision, checkOrder}
 */
export function score(drawn, target, opts) {
  var radius = opts.radius * 100;      // opts.radius is a fraction of glyph height
  var flatDrawn = [];
  for (var i = 0; i < drawn.length; i++) flatDrawn = flatDrawn.concat(resample(drawn[i], Math.max(2, Math.min(60, drawn[i].length))));
  if (!flatDrawn.length) return { coverage: 0, precision: 0, score: 0, pass: false, formation: false };

  var targetPoints = [];
  for (var t = 0; t < target.length; t++) targetPoints = targetPoints.concat(resample(target[t], 40));

  var covered = 0;
  for (var c = 0; c < targetPoints.length; c++) {
    if (distanceToStrokes(targetPoints[c], drawn) <= radius) covered++;
  }
  var onTarget = 0;
  for (var d = 0; d < flatDrawn.length; d++) {
    if (distanceToStrokes(flatDrawn[d], target) <= radius) onTarget++;
  }
  var coverage = covered / targetPoints.length;
  var precision = onTarget / flatDrawn.length;
  var value = 0.6 * coverage + 0.4 * precision;

  var formation = true;
  if (opts.checkOrder && drawn.length === target.length) {
    for (var s = 0; s < target.length; s++) {
      if (dist(drawn[s][0], target[s][0]) > radius * 2) { formation = false; break; }
    }
  } else if (opts.checkOrder) {
    formation = false;
  }

  return {
    coverage: coverage,
    precision: precision,
    score: value,
    formation: formation,
    pass: coverage >= opts.passCoverage && precision >= opts.passPrecision
  };
}
