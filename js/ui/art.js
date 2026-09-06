/**
 * art.js — every picture in the game, drawn as SVG in code.
 *
 * Nothing here is a file. Racers, scenery, badges and the map are generated
 * as vectors at render time, which means: the first visit downloads no art at
 * all, everything is crisp on any screen, a module shared between devices
 * never needs media transferred, and colours follow the theme rather than
 * being baked into pixels.
 *
 * Emoji carry the *content* pictures (see content/modules/core-firstwords) —
 * this file draws the *game*.
 */

/* ── Racers ──────────────────────────────────────────────────────────────
 * Eight characters, each a distinct silhouette AND a distinct colour, so
 * they are still tellable apart in greyscale or by a colourblind player.
 * Never signal anything by colour alone.
 */
export var RACERS = [
  { id: 'rocket',  name: 'Rocket',  color: '#57c7ff', accent: '#ffffff' },
  { id: 'fox',     name: 'Fox',     color: '#ff8a5c', accent: '#ffe6d5' },
  { id: 'frog',    name: 'Frog',    color: '#8ce36b', accent: '#f2ffe8' },
  { id: 'bee',     name: 'Bee',     color: '#ffd452', accent: '#3a2c00' },
  { id: 'squid',   name: 'Squid',   color: '#d18bff', accent: '#f7ebff' },
  { id: 'whale',   name: 'Whale',   color: '#4fd6c3', accent: '#eafffb' },
  { id: 'robot',   name: 'Robot',   color: '#b0b8d8', accent: '#2a2f45' },
  { id: 'dragon',  name: 'Dragon',  color: '#ff6f91', accent: '#fff0f4' }
];

/**
 * Where each racer's eyes and mouth sit, so a mood can be drawn over the base
 * art without redrawing eight characters three times. Idle is the base art
 * untouched; the two other moods replace the eyes and add a mouth.
 */
var FACES = {
  rocket: { eyes: [[32, 28]], r: 3, mouth: [32, 40], dark: '#0d1020' },
  fox:    { eyes: [[24, 34], [40, 34]], r: 4, mouth: [32, 46] },
  frog:   { eyes: [[21, 19], [45, 19]], r: 2.6, mouth: [32, 44] },
  bee:    { eyes: [[38, 30]], r: 5, mouth: [42, 40] },
  squid:  { eyes: [[25, 26], [39, 26]], r: 5, mouth: [32, 34] },
  whale:  { eyes: [[38, 30]], r: 5, mouth: [30, 42] },
  robot:  { eyes: [[27, 32], [37, 32]], r: 3, mouth: [32, 40], dark: '#7fe7ff' },
  dragon: { eyes: [[38, 30], [46, 30]], r: 5, mouth: [32, 46] }
};

function moodOverlay(id, mood) {
  var f = FACES[id] || FACES.dragon;
  var ink = '#12131c';
  var parts = [];
  if (mood === 'thinking') {
    // Eyes glance up and to the side; a small thought mark floats above.
    for (var i = 0; i < f.eyes.length; i++) {
      var e = f.eyes[i];
      parts.push('<circle cx="' + e[0] + '" cy="' + e[1] + '" r="' + f.r + '" fill="' + ink + '"/>');
      parts.push('<circle cx="' + (e[0] + f.r * 0.45) + '" cy="' + (e[1] - f.r * 0.5) + '" r="' + (f.r * 0.42) + '" fill="#fff"/>');
    }
    parts.push('<circle cx="52" cy="10" r="2" fill="#fff" opacity=".8"/><circle cx="57" cy="5" r="1.4" fill="#fff" opacity=".6"/>');
    parts.push('<path d="M' + (f.mouth[0] - 4) + ' ' + f.mouth[1] + 'h8" stroke="' + ink + '" stroke-width="1.8" stroke-linecap="round"/>');
  } else if (mood === 'delighted') {
    // Happy closed eyes and an open smile.
    for (var j = 0; j < f.eyes.length; j++) {
      var d = f.eyes[j];
      parts.push('<path d="M' + (d[0] - f.r) + ' ' + (d[1] + 1) + 'q' + f.r + ' -' + (f.r * 1.4) + ' ' + (f.r * 2) + ' 0" stroke="' + ink + '" stroke-width="2.2" fill="none" stroke-linecap="round"/>');
    }
    parts.push('<path d="M' + (f.mouth[0] - 6) + ' ' + (f.mouth[1] - 1) + 'q6 8 12 0z" fill="' + ink + '"/>');
    parts.push('<path d="M' + (f.mouth[0] - 3) + ' ' + (f.mouth[1] + 3) + 'q3 2 6 0" fill="#ff8a8a"/>');
  }
  return parts.join('');
}

function svg(w, h, body) {
  return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + w + ' ' + h + '" width="100%" height="100%">' + body + '</svg>';
}

/** An <svg> string for a racer. `lean` 0..1 tilts it forward when moving. */
export function racerSvg(id, opts) {
  opts = opts || {};
  var r = null;
  for (var i = 0; i < RACERS.length; i++) if (RACERS[i].id === id) r = RACERS[i];
  if (!r) r = RACERS[0];
  var c = opts.color || r.color, a = r.accent;
  var eye = '<circle cx="38" cy="30" r="5" fill="#12131c"/><circle cx="39.6" cy="28.4" r="1.8" fill="#fff"/>';
  var body;
  switch (r.id) {
    case 'rocket':
      body = '<path d="M32 6c11 8 16 20 16 32 0 8-3 14-8 18H24c-5-4-8-10-8-18C16 26 21 14 32 6z" fill="' + c + '"/>' +
             '<path d="M16 40 4 54l14-3zM48 40l12 14-14-3z" fill="' + a + '" opacity=".85"/>' +
             '<circle cx="32" cy="28" r="8" fill="#0d1020"/><circle cx="34" cy="26" r="3" fill="#7fe7ff"/>' +
             '<path d="M26 56h12l-6 8z" fill="#ff8a5c"/>';
      break;
    case 'fox':
      body = '<path d="M14 20 20 6l10 8h4l10-8 6 14z" fill="' + c + '"/>' +
             '<ellipse cx="32" cy="38" rx="22" ry="18" fill="' + c + '"/>' +
             '<path d="M32 44c-6 0-10-3-10-3s4 8 10 8 10-8 10-8-4 3-10 3z" fill="' + a + '"/>' +
             '<circle cx="24" cy="34" r="4" fill="#12131c"/><circle cx="40" cy="34" r="4" fill="#12131c"/>' +
             '<circle cx="32" cy="43" r="3" fill="#12131c"/>';
      break;
    case 'frog':
      body = '<circle cx="20" cy="18" r="10" fill="' + c + '"/><circle cx="44" cy="18" r="10" fill="' + c + '"/>' +
             '<circle cx="20" cy="18" r="5" fill="#fff"/><circle cx="44" cy="18" r="5" fill="#fff"/>' +
             '<circle cx="21" cy="19" r="2.6" fill="#12131c"/><circle cx="45" cy="19" r="2.6" fill="#12131c"/>' +
             '<ellipse cx="32" cy="40" rx="24" ry="18" fill="' + c + '"/>' +
             '<path d="M18 44q14 10 28 0" stroke="#2b6b1f" stroke-width="3" fill="none" stroke-linecap="round"/>';
      break;
    case 'bee':
      body = '<ellipse cx="32" cy="38" rx="20" ry="16" fill="' + c + '"/>' +
             '<path d="M24 24v28M34 22v32" stroke="' + a + '" stroke-width="6"/>' +
             '<ellipse cx="20" cy="20" rx="12" ry="8" fill="#fff" opacity=".55" transform="rotate(-25 20 20)"/>' +
             '<ellipse cx="46" cy="20" rx="12" ry="8" fill="#fff" opacity=".55" transform="rotate(25 46 20)"/>' + eye;
      break;
    case 'squid':
      body = '<path d="M32 6c12 0 20 9 20 20v10H12V26C12 15 20 6 32 6z" fill="' + c + '"/>' +
             '<path d="M12 36c0 12 4 18 4 22M22 36c0 12-2 18-2 24M32 36v26M42 36c0 12 2 18 2 24M52 36c0 12-4 18-4 22" stroke="' + c + '" stroke-width="5" fill="none" stroke-linecap="round"/>' +
             '<circle cx="25" cy="26" r="5" fill="#12131c"/><circle cx="39" cy="26" r="5" fill="#12131c"/>' +
             '<circle cx="26.5" cy="24.5" r="1.8" fill="#fff"/><circle cx="40.5" cy="24.5" r="1.8" fill="#fff"/>';
      break;
    case 'whale':
      body = '<path d="M6 38c0-12 12-20 28-20s24 8 24 18-10 18-26 18C16 54 6 48 6 38z" fill="' + c + '"/>' +
             '<path d="M58 36l6-10v22z" fill="' + c + '"/>' +
             '<path d="M10 44q12 8 26 6" stroke="' + a + '" stroke-width="3" fill="none"/>' + eye +
             '<path d="M34 14c0-6 6-6 6-12" stroke="#bfe9ff" stroke-width="3" fill="none" stroke-linecap="round"/>';
      break;
    case 'robot':
      body = '<rect x="14" y="18" width="36" height="30" rx="7" fill="' + c + '"/>' +
             '<rect x="20" y="26" width="24" height="12" rx="4" fill="' + a + '"/>' +
             '<circle cx="27" cy="32" r="3" fill="#7fe7ff"/><circle cx="37" cy="32" r="3" fill="#7fe7ff"/>' +
             '<path d="M32 18v-8M32 10h-4" stroke="' + c + '" stroke-width="3" stroke-linecap="round"/>' +
             '<circle cx="28" cy="8" r="3" fill="#ff8a5c"/>' +
             '<rect x="20" y="50" width="10" height="8" rx="3" fill="' + c + '"/><rect x="34" y="50" width="10" height="8" rx="3" fill="' + c + '"/>';
      break;
    default:
      body = '<path d="M10 40c0-14 10-24 22-24s22 10 22 24c0 8-6 14-14 14H24c-8 0-14-6-14-14z" fill="' + c + '"/>' +
             '<path d="M20 16l-8-8 4 14zM44 16l8-8-4 14z" fill="' + c + '"/>' +
             '<path d="M22 46h20l-4 10h-12z" fill="' + a + '"/>' + eye +
             '<circle cx="46" cy="30" r="5" fill="#12131c"/><circle cx="47.6" cy="28.4" r="1.8" fill="#fff"/>';
  }
  var tilt = opts.lean ? ' transform="rotate(' + (opts.lean * 8) + ' 32 32)"' : '';
  var face = opts.mood && opts.mood !== 'idle' ? moodOverlay(r.id, opts.mood) : '';
  return svg(64, 64, '<g' + tilt + '>' + body + face + '</g>');
}

export var MOODS = ['idle', 'thinking', 'delighted'];

export function racerDataUri(id, opts) {
  return 'data:image/svg+xml;utf8,' + encodeURIComponent(racerSvg(id, opts));
}

/* ── Scenery ─────────────────────────────────────────────────────────────
 * A parallax strip behind the track. Deterministic from a seed so the same
 * race looks the same on every device, and so a screenshot is reproducible.
 */
export function sceneryLayer(seed, width, height, opts) {
  opts = opts || {};
  var s = seed >>> 0;
  function rnd() { s = (s * 48271) % 2147483647; return (s - 1) / 2147483646; }
  var parts = [];
  var baseline = height * (opts.baseline || 0.82);
  var count = opts.count || 9;
  for (var i = 0; i < count; i++) {
    var x = (i + rnd() * 0.6) * (width / count);
    var h = height * (0.18 + rnd() * 0.34) * (opts.scale || 1);
    if (opts.kind === 'city') {
      var w = width / count * (0.4 + rnd() * 0.4);
      parts.push('<rect x="' + x + '" y="' + (baseline - h) + '" width="' + w + '" height="' + h + '" rx="3" fill="' + opts.color + '"/>');
    } else if (opts.kind === 'trees') {
      parts.push('<path d="M' + x + ' ' + baseline + ' l' + (h * 0.34) + ' -' + h + ' l' + (h * 0.34) + ' ' + h + ' z" fill="' + opts.color + '"/>');
    } else {
      parts.push('<path d="M' + (x - h) + ' ' + baseline + ' Q' + x + ' ' + (baseline - h) + ' ' + (x + h) + ' ' + baseline + ' z" fill="' + opts.color + '"/>');
    }
  }
  return parts.join('');
}

/* ── Map ──────────────────────────────────────────────────────────────── */

/**
 * A landmark on the Expedition map. Gold means the crew has mastered the
 * skill it stands for; a shimmer means a review is due there — an invitation,
 * never a warning, and never more than three at once.
 */
export function landmarkSvg(kind, state) {
  var fill = state === 'gold' ? '#ffd452' : state === 'claimed' ? '#8ce36b' : '#4a5273';
  var glow = state === 'shimmer'
    ? '<circle cx="24" cy="24" r="21" fill="none" stroke="#ffd452" stroke-width="2" opacity=".9"><animate attributeName="r" values="17;22;17" dur="2.4s" repeatCount="indefinite"/><animate attributeName="opacity" values=".9;.2;.9" dur="2.4s" repeatCount="indefinite"/></circle>'
    : '';
  var glyph;
  if (kind === 'island') glyph = '<path d="M8 32q6-10 16-10t16 10z" fill="' + fill + '"/><path d="M24 22V10M18 14h12" stroke="' + fill + '" stroke-width="3" stroke-linecap="round"/>';
  else if (kind === 'peak') glyph = '<path d="M6 36 24 8l18 28z" fill="' + fill + '"/><path d="M17 22h14l-7-11z" fill="#fff" opacity=".7"/>';
  else if (kind === 'grove') glyph = '<circle cx="24" cy="20" r="12" fill="' + fill + '"/><rect x="21" y="28" width="6" height="12" rx="2" fill="' + fill + '" opacity=".7"/>';
  else glyph = '<circle cx="24" cy="24" r="12" fill="' + fill + '"/>';
  return svg(48, 48, glow + glyph);
}

export var LANDMARK_KINDS = ['island', 'peak', 'grove', 'dot'];

/* ── Badges and celebration ──────────────────────────────────────────── */

/**
 * The recovery badge — awarded the first time an item you once got wrong
 * comes back and you get it. This is the biggest celebration in the game,
 * bigger than winning a race, because it is the thing the app actually
 * values. See docs/LEARNING.md §11.
 */
export function badgeSvg(kind) {
  if (kind === 'recovery') {
    return svg(64, 64,
      '<circle cx="32" cy="32" r="28" fill="#1b2140" stroke="#8ce36b" stroke-width="3"/>' +
      '<path d="M20 33l9 9 16-18" stroke="#8ce36b" stroke-width="6" fill="none" stroke-linecap="round" stroke-linejoin="round"/>' +
      '<path d="M32 4v6M32 54v6M4 32h6M54 32h6" stroke="#8ce36b" stroke-width="3" stroke-linecap="round" opacity=".7"/>');
  }
  if (kind === 'mastery') {
    return svg(64, 64,
      '<circle cx="32" cy="32" r="26" fill="#2a2145" stroke="#ffd452" stroke-width="3"/>' +
      '<path d="M32 14l5.4 11 12.6 1.8-9 8.8 2.1 12.4L32 42.2 20.9 48l2.1-12.4-9-8.8L26.6 25z" fill="#ffd452"/>');
  }
  return svg(64, 64, '<circle cx="32" cy="32" r="26" fill="#2a3050" stroke="#57c7ff" stroke-width="3"/>');
}

/** A small burst for checkpoints; CSS animates the wrapper. */
export function burstSvg(color) {
  var rays = [];
  for (var i = 0; i < 12; i++) {
    var ang = (i / 12) * Math.PI * 2;
    rays.push('<line x1="' + (32 + Math.cos(ang) * 10) + '" y1="' + (32 + Math.sin(ang) * 10) +
      '" x2="' + (32 + Math.cos(ang) * 26) + '" y2="' + (32 + Math.sin(ang) * 26) +
      '" stroke="' + (color || '#ffd452') + '" stroke-width="3" stroke-linecap="round"/>');
  }
  return svg(64, 64, rays.join(''));
}
