/**
 * pictures.js — the illustration set the questions are made of.
 *
 * These replace the emoji the app used to lean on. Emoji were free but they
 * are not ours: they render differently on every device, they carry a
 * cartoon register that undercuts the app, and a child sees the same glyph
 * in their parent's messages. These are flat vector illustrations drawn on
 * one 64x64 grid with one palette, so a screen of them reads as a single
 * designed thing rather than a ransom note.
 *
 * Still no files: they are drawn in code, so the first visit downloads no
 * art, they stay crisp at any size, and a shared module needs no media.
 */

/* One palette for everything, so nothing clashes. */
export var P = {
  amber: '#E8A33D', coral: '#E4694F', rose: '#D9557E', plum: '#8B5FBF',
  sky: '#4FA3E3', teal: '#3FBFAE', leaf: '#6FAF57', moss: '#4A8C46',
  cream: '#F3E7D5', stone: '#B9B2A6', slate: '#4A5568', ink: '#2B3140',
  snow: '#FFFFFF', shadow: 'rgba(0,0,0,.14)'
};

/**
 * Each entry is the inside of a 0 0 64 64 SVG. Kept flat and geometric on
 * purpose: shapes a two-year-old can name at a glance, with no outline noise
 * at small sizes.
 */
var ART = {
  /* ── animals ─────────────────────────────────────────────────────── */
  cat: '<ellipse cx="32" cy="42" rx="19" ry="15" fill="' + P.stone + '"/>' +
       '<path d="M15 30 17 14l12 8zM49 30 47 14l-12 8z" fill="' + P.stone + '"/>' +
       '<path d="M18 27 19 19l7 5zM46 27 45 19l-7 5z" fill="' + P.rose + '" opacity=".5"/>' +
       '<circle cx="25" cy="39" r="3.4" fill="' + P.ink + '"/><circle cx="39" cy="39" r="3.4" fill="' + P.ink + '"/>' +
       '<path d="M32 45l-3-2h6z" fill="' + P.rose + '"/>' +
       '<path d="M32 47v3M32 49c-3 0-5-1-6-2M32 49c3 0 5-1 6-2" stroke="' + P.ink + '" stroke-width="1.6" fill="none" stroke-linecap="round"/>',
  dog: '<ellipse cx="32" cy="40" rx="18" ry="16" fill="' + P.amber + '"/>' +
       '<ellipse cx="14" cy="34" rx="7" ry="12" fill="' + P.coral + '"/><ellipse cx="50" cy="34" rx="7" ry="12" fill="' + P.coral + '"/>' +
       '<ellipse cx="32" cy="47" rx="11" ry="9" fill="' + P.cream + '"/>' +
       '<circle cx="26" cy="37" r="3.2" fill="' + P.ink + '"/><circle cx="38" cy="37" r="3.2" fill="' + P.ink + '"/>' +
       '<ellipse cx="32" cy="45" rx="4" ry="3" fill="' + P.ink + '"/>' +
       '<path d="M32 48v4" stroke="' + P.ink + '" stroke-width="1.8" stroke-linecap="round"/>',
  cow: '<ellipse cx="14" cy="30" rx="6" ry="8" fill="#D8CFC2"/><ellipse cx="50" cy="30" rx="6" ry="8" fill="#D8CFC2"/>' +
       '<ellipse cx="32" cy="36" rx="19" ry="17" fill="' + P.snow + '"/>' +
       '<path d="M22 20a9 9 0 0 1 9 3l-8 7-6-3z" fill="' + P.ink + '"/>' +
       '<path d="M46 40a8 8 0 0 1-9 3l3-8 6 1z" fill="' + P.ink + '"/>' +
       '<ellipse cx="32" cy="46" rx="12" ry="8" fill="#F2B8C6"/>' +
       '<circle cx="26" cy="34" r="3" fill="' + P.ink + '"/><circle cx="39" cy="34" r="3" fill="' + P.ink + '"/>' +
       '<ellipse cx="28" cy="46" rx="2" ry="2.6" fill="#C97F92"/><ellipse cx="36" cy="46" rx="2" ry="2.6" fill="#C97F92"/>',
  pig: '<ellipse cx="32" cy="40" rx="19" ry="15" fill="#EFA0B5"/>' +
       '<path d="M17 27l3-9 8 6zM47 27l-3-9-8 6z" fill="#EFA0B5"/>' +
       '<ellipse cx="32" cy="45" rx="9" ry="7" fill="#E07E9A"/>' +
       '<circle cx="29" cy="45" r="1.9" fill="' + P.ink + '"/><circle cx="35" cy="45" r="1.9" fill="' + P.ink + '"/>' +
       '<circle cx="25" cy="36" r="2.8" fill="' + P.ink + '"/><circle cx="39" cy="36" r="2.8" fill="' + P.ink + '"/>',
  duck: '<ellipse cx="30" cy="42" rx="18" ry="13" fill="#F5D34B"/>' +
        '<circle cx="45" cy="27" r="11" fill="#F5D34B"/>' +
        '<path d="M54 27h9l-4 5-5-1z" fill="' + P.amber + '"/>' +
        '<circle cx="47" cy="24" r="2.6" fill="' + P.ink + '"/>' +
        '<path d="M14 44q10 8 22 4" stroke="#E0BC38" stroke-width="2.4" fill="none" stroke-linecap="round"/>',
  fish: '<path d="M8 32c8-11 22-15 34-9s14 20 2 22S16 43 8 32z" fill="' + P.teal + '"/>' +
        '<path d="M44 30l12-9v22z" fill="' + P.sky + '"/>' +
        '<circle cx="22" cy="29" r="3" fill="' + P.snow + '"/><circle cx="22.8" cy="29" r="1.6" fill="' + P.ink + '"/>' +
        '<path d="M28 40q7 4 14 1" stroke="' + P.sky + '" stroke-width="2" fill="none" stroke-linecap="round"/>',
  bee: '<ellipse cx="34" cy="38" rx="17" ry="13" fill="#F5C542"/>' +
       '<path d="M28 27v22M38 26v24" stroke="' + P.ink + '" stroke-width="5"/>' +
       '<ellipse cx="24" cy="20" rx="11" ry="7" fill="' + P.snow + '" opacity=".7" transform="rotate(-24 24 20)"/>' +
       '<ellipse cx="44" cy="19" rx="10" ry="6" fill="' + P.snow + '" opacity=".7" transform="rotate(22 44 19)"/>' +
       '<circle cx="49" cy="35" r="3" fill="' + P.ink + '"/>',
  frog: '<circle cx="21" cy="20" r="10" fill="' + P.leaf + '"/><circle cx="43" cy="20" r="10" fill="' + P.leaf + '"/>' +
        '<circle cx="21" cy="20" r="5" fill="' + P.snow + '"/><circle cx="43" cy="20" r="5" fill="' + P.snow + '"/>' +
        '<circle cx="22" cy="21" r="2.6" fill="' + P.ink + '"/><circle cx="44" cy="21" r="2.6" fill="' + P.ink + '"/>' +
        '<ellipse cx="32" cy="41" rx="23" ry="16" fill="' + P.leaf + '"/>' +
        '<path d="M19 44q13 9 26 0" stroke="' + P.moss + '" stroke-width="2.6" fill="none" stroke-linecap="round"/>',

  /* ── food ────────────────────────────────────────────────────────── */
  apple: '<path d="M32 18c6-6 16-5 18 2 3 10-4 26-11 30-3 2-5 2-7 0-7-4-14-20-11-30 2-7 12-8 11-2z" fill="' + P.coral + '"/>' +
         '<path d="M32 18V9" stroke="#7A5230" stroke-width="3.2" stroke-linecap="round"/>' +
         '<path d="M33 12c4-5 10-5 12-3-2 5-8 6-12 3z" fill="' + P.leaf + '"/>' +
         '<path d="M24 26c-2 4-2 9 0 13" stroke="' + P.snow + '" stroke-width="2.4" opacity=".45" fill="none" stroke-linecap="round"/>',
  banana: '<path d="M14 20c2 20 14 32 34 30 4 0 5-4 2-6-14-2-24-11-27-25-1-4-9-3-9 1z" fill="#F2CE45"/>' +
          '<path d="M17 22c3 17 13 27 30 27" stroke="#DDB633" stroke-width="2.4" fill="none"/>' +
          '<path d="M46 49l5 2-2 3z" fill="#7A5230"/>',
  bread: '<path d="M10 34c0-11 10-16 22-16s22 5 22 16v10a4 4 0 0 1-4 4H14a4 4 0 0 1-4-4z" fill="' + P.amber + '"/>' +
         '<path d="M14 33c0-7 8-11 18-11s18 4 18 11z" fill="#F0C98A"/>' +
         '<path d="M22 40h20M22 45h14" stroke="#C9812F" stroke-width="2" stroke-linecap="round"/>',
  cheese: '<path d="M8 42 34 20l22 8v16a2 2 0 0 1-2 2H10a2 2 0 0 1-2-2z" fill="#F5CC4D"/>' +
          '<path d="M8 42 34 20l22 8z" fill="#F7DB7E"/>' +
          '<circle cx="22" cy="40" r="4" fill="#E0B033"/><circle cx="38" cy="43" r="3" fill="#E0B033"/><circle cx="48" cy="36" r="2.4" fill="#E0B033"/>',

  /* ── things ──────────────────────────────────────────────────────── */
  car: '<path d="M8 42V33c0-2 1-3 3-4l6-2 5-8c1-2 2-2 4-2h16c2 0 3 1 4 2l5 8 6 2c2 1 3 2 3 4v9a2 2 0 0 1-2 2H10a2 2 0 0 1-2-2z" fill="' + P.coral + '"/>' +
       '<path d="M23 20h18l4 7H19z" fill="#BFE3F5"/>' +
       '<circle cx="19" cy="45" r="6" fill="' + P.ink + '"/><circle cx="45" cy="45" r="6" fill="' + P.ink + '"/>' +
       '<circle cx="19" cy="45" r="2.4" fill="' + P.stone + '"/><circle cx="45" cy="45" r="2.4" fill="' + P.stone + '"/>',
  bus: '<rect x="8" y="14" width="48" height="30" rx="5" fill="' + P.amber + '"/>' +
       '<rect x="13" y="20" width="12" height="10" rx="2" fill="#BFE3F5"/><rect x="28" y="20" width="12" height="10" rx="2" fill="#BFE3F5"/><rect x="43" y="20" width="8" height="10" rx="2" fill="#BFE3F5"/>' +
       '<rect x="8" y="36" width="48" height="4" fill="#C9812F"/>' +
       '<circle cx="19" cy="46" r="6" fill="' + P.ink + '"/><circle cx="45" cy="46" r="6" fill="' + P.ink + '"/>',
  boat: '<path d="M8 42h48l-6 10a3 3 0 0 1-3 2H17a3 3 0 0 1-3-2z" fill="' + P.coral + '"/>' +
        '<path d="M31 38V10l-18 28z" fill="' + P.snow + '"/><path d="M35 38V16l16 22z" fill="#E6EDF5"/>' +
        '<path d="M4 50q6-4 12 0t12 0 12 0 12 0" stroke="' + P.sky + '" stroke-width="2.4" fill="none" stroke-linecap="round"/>',
  ball: '<circle cx="32" cy="32" r="22" fill="' + P.snow + '"/>' +
        '<path d="M32 20l9.5 6.9-3.6 11.2H26.1L22.5 26.9z" fill="' + P.ink + '"/>' +
        '<g stroke="' + P.ink + '" stroke-width="2.6" stroke-linecap="round">' +
        '<path d="M32 20v-9M41.5 26.9l8.5-3M37.9 38.1l5.3 7.3M26.1 38.1l-5.3 7.3M22.5 26.9l-8.5-3"/></g>' +
        '<circle cx="32" cy="32" r="22" fill="none" stroke="' + P.stone + '" stroke-width="1.6"/>',
  hat: '<path d="M20 40V18a8 8 0 0 1 8-8h8a8 8 0 0 1 8 8v22z" fill="' + P.plum + '"/>' +
       '<rect x="18" y="32" width="28" height="6" rx="3" fill="' + P.rose + '"/>' +
       '<ellipse cx="32" cy="42" rx="26" ry="8" fill="' + P.plum + '"/>',
  shoe: '<path d="M8 44c0-6 3-9 8-11l10-5 6 6 10 2c8 2 14 4 14 8v4a2 2 0 0 1-2 2H10a2 2 0 0 1-2-2z" fill="' + P.sky + '"/>' +
        '<path d="M8 46h48v4a2 2 0 0 1-2 2H10a2 2 0 0 1-2-2z" fill="' + P.ink + '"/>' +
        '<path d="M26 34l6 5M32 31l6 5" stroke="' + P.snow + '" stroke-width="2.4" stroke-linecap="round"/>',
  cup: '<path d="M16 16h28l-3 34a4 4 0 0 1-4 4H23a4 4 0 0 1-4-4z" fill="' + P.snow + '"/>' +
       '<path d="M17 26h26l-2 24a4 4 0 0 1-4 4H23a4 4 0 0 1-4-4z" fill="' + P.coral + '"/>' +
       '<rect x="14" y="12" width="32" height="6" rx="3" fill="' + P.stone + '"/>' +
       '<path d="M30 8v4M38 6v6" stroke="' + P.stone + '" stroke-width="2.4" stroke-linecap="round"/>',
  book: '<path d="M10 14h18a6 6 0 0 1 4 2 6 6 0 0 1 4-2h18v34H36a6 6 0 0 0-4 2 6 6 0 0 0-4-2H10z" fill="' + P.plum + '"/>' +
        '<path d="M12 17h16a4 4 0 0 1 3 2v27a6 6 0 0 0-3-1H12z" fill="' + P.snow + '"/>' +
        '<path d="M52 17H36a4 4 0 0 0-3 2v27a6 6 0 0 1 3-1h16z" fill="#EDF1F7"/>' +
        '<path d="M16 24h11M16 29h11M37 24h11M37 29h11" stroke="' + P.stone + '" stroke-width="1.8" stroke-linecap="round"/>',

  /* ── world ───────────────────────────────────────────────────────── */
  sun: '<circle cx="32" cy="32" r="13" fill="#F5C542"/>' +
       '<g stroke="#F5C542" stroke-width="3.6" stroke-linecap="round">' +
       '<path d="M32 6v7M32 51v7M6 32h7M51 32h7M14 14l5 5M45 45l5 5M50 14l-5 5M19 45l-5 5"/></g>',
  moon: '<path d="M40 8a24 24 0 1 0 14 42A26 26 0 0 1 40 8z" fill="#F0E6C8"/>' +
        '<circle cx="26" cy="26" r="4" fill="#DCCFA8"/><circle cx="20" cy="40" r="3" fill="#DCCFA8"/><circle cx="32" cy="44" r="2.4" fill="#DCCFA8"/>',
  star: '<path d="M32 6l7.6 15.8L57 24.2 44.5 36.4 47.6 54 32 45.6 16.4 54l3.1-17.6L7 24.2l17.4-2.4z" fill="#F5C542"/>',
  tree: '<rect x="28" y="38" width="8" height="18" rx="2" fill="#7A5230"/>' +
        '<circle cx="32" cy="24" r="15" fill="' + P.leaf + '"/>' +
        '<circle cx="20" cy="32" r="10" fill="' + P.moss + '"/><circle cx="44" cy="32" r="10" fill="' + P.moss + '"/>' +
        '<circle cx="32" cy="20" r="10" fill="#8CC46C"/>',

  /* ── counting tokens: neutral shapes, so counting is about number ── */
  dot: '<circle cx="32" cy="32" r="20" fill="' + P.sky + '"/>',
  square: '<rect x="12" y="12" width="40" height="40" rx="8" fill="' + P.teal + '"/>',
  triangle: '<path d="M32 10l22 42H10z" fill="' + P.amber + '"/>',
  diamond: '<path d="M32 8l24 24-24 24L8 32z" fill="' + P.plum + '"/>',
  heart: '<path d="M32 54S8 39 8 25a13 13 0 0 1 24-7 13 13 0 0 1 24 7c0 14-24 29-24 29z" fill="' + P.rose + '"/>',
  flower: '<circle cx="32" cy="18" r="9" fill="' + P.rose + '"/><circle cx="46" cy="30" r="9" fill="' + P.plum + '"/>' +
          '<circle cx="40" cy="46" r="9" fill="' + P.coral + '"/><circle cx="24" cy="46" r="9" fill="' + P.amber + '"/>' +
          '<circle cx="18" cy="30" r="9" fill="' + P.sky + '"/><circle cx="32" cy="32" r="8" fill="#F5DE7A"/>'
};

export var PICTURE_NAMES = Object.keys(ART);

export function hasPicture(name) { return ART.hasOwnProperty(name); }

export function pictureSvg(name) {
  var body = ART[name];
  if (!body) return null;
  return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="100%" height="100%" ' +
    'role="img" focusable="false">' + body + '</svg>';
}

/** Neutral tokens for counting: shape should not distract from the number. */
export var COUNT_TOKENS = ['dot', 'square', 'triangle', 'diamond', 'heart', 'flower', 'star', 'apple'];
