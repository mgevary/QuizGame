/**
 * bands.js — the age-band capability table. PURE.
 *
 * A band encodes what a child can DO — read, hold attention, hit a target —
 * not what year they are in. It gates modality and item type. Difficulty is
 * gated separately by the ability estimate (learn/ability.js), so a precocious
 * three-year-old gets harder TAPS, never typed answers.
 *
 * The numbers: pre-readers cannot read any instruction, so PN/N prompts must
 * carry full meaning in audio + image alone (maxWords 0). Focused attention
 * runs 2–5 minutes at age three, so sessions are short and each item must be
 * under ~20 seconds. Fine motor at 2–3 is whole-arm, so trace tolerance is
 * enormous. Typing is not viable before ~7, so every "produce the answer"
 * step below G2 is tap/drag/tile.
 */

export var BANDS = ['PN', 'N', 'R', 'K', 'G1', 'G2', 'G3', 'G4', 'G5', 'G6', 'A'];

export var BAND_INFO = {
  PN: { label: 'Pre-nursery', ages: [2, 3],  audio: 'required', maxWords: 0,   sessionMin: 5,  items: [8, 12],
        types: ['tap-image', 'listen', 'count', 'trace'],
        traceTolerance: 0.30, tracePass: [0.50, 0.35], touchPx: 96,
        thetaStart: 1.0, thetaRange: [1, 3] },
  N:  { label: 'Nursery',     ages: [3, 4],  audio: 'required', maxWords: 3,   sessionMin: 8,  items: [12, 20],
        types: ['tap-image', 'listen', 'count', 'trace', 'mcq'],
        traceTolerance: 0.22, tracePass: [0.60, 0.50], touchPx: 80,
        thetaStart: 1.5, thetaRange: [1, 4] },
  R:  { label: 'Reception',   ages: [4, 5],  audio: 'required', maxWords: 6,   sessionMin: 10, items: [18, 28],
        types: ['tap-image', 'listen', 'count', 'trace', 'mcq', 'assemble', 'template'],
        traceTolerance: 0.16, tracePass: [0.72, 0.62], touchPx: 72,
        thetaStart: 2.5, thetaRange: [1, 5] },
  K:  { label: 'Kindergarten',ages: [5, 6],  audio: 'default',  maxWords: 15,  sessionMin: 12, items: [25, 35],
        types: ['tap-image', 'listen', 'count', 'trace', 'mcq', 'assemble', 'template'],
        traceTolerance: 0.12, tracePass: [0.82, 0.72], touchPx: 64,
        thetaStart: 3.5, thetaRange: [1, 6] },
  G1: { label: 'Grade 1',     ages: [6, 7],  audio: 'optional', maxWords: 30,  sessionMin: 12, items: [30, 40],
        types: ['tap-image', 'listen', 'count', 'trace', 'mcq', 'assemble', 'template'],
        traceTolerance: 0.12, tracePass: [0.82, 0.72], touchPx: 56,
        thetaStart: 4.0, thetaRange: [2, 7] },
  G2: { label: 'Grade 2',     ages: [7, 8],  audio: 'optional', maxWords: 60,  sessionMin: 15, items: [35, 45],
        types: ['tap-image', 'listen', 'count', 'trace', 'mcq', 'assemble', 'template'],
        traceTolerance: 0.09, tracePass: [0.88, 0.80], touchPx: 48,
        thetaStart: 5.0, thetaRange: [2, 8] },
  G3: { label: 'Grade 3',     ages: [8, 9],  audio: 'off',      maxWords: 80,  sessionMin: 15, items: [35, 50],
        types: ['tap-image', 'listen', 'count', 'trace', 'mcq', 'assemble', 'template'],
        traceTolerance: 0.09, tracePass: [0.88, 0.80], touchPx: 48,
        thetaStart: 5.5, thetaRange: [3, 9] },
  G4: { label: 'Grade 4',     ages: [9, 10], audio: 'off',      maxWords: 120, sessionMin: 18, items: [40, 55],
        types: null, traceTolerance: 0.09, tracePass: [0.88, 0.80], touchPx: 48,
        thetaStart: 6.5, thetaRange: [3, 10] },
  G5: { label: 'Grade 5',     ages: [10, 11],audio: 'off',      maxWords: 150, sessionMin: 20, items: [40, 60],
        types: null, traceTolerance: 0.09, tracePass: [0.88, 0.80], touchPx: 44,
        thetaStart: 7.0, thetaRange: [3, 10] },
  G6: { label: 'Grades 6–8',  ages: [11, 14],audio: 'off',      maxWords: 200, sessionMin: 20, items: [40, 60],
        types: null, traceTolerance: 0.09, tracePass: [0.88, 0.80], touchPx: 44,
        thetaStart: 8.0, thetaRange: [4, 10] },
  A:  { label: 'Adult',       ages: [15, 99],audio: 'off',      maxWords: 400, sessionMin: 20, items: [40, 60],
        types: null, traceTolerance: 0.09, tracePass: [0.88, 0.80], touchPx: 44,
        thetaStart: 6.0, thetaRange: [1, 10] }
};

export function isBand(b) { return BANDS.indexOf(b) !== -1; }

export function bandIndex(b) { return BANDS.indexOf(b); }

/** True if band `b` is at or above band `min`. */
export function bandAtLeast(b, min) {
  return bandIndex(b) >= bandIndex(min);
}

/** null `types` means "everything the engine has". */
export function bandAllowsType(b, type) {
  var info = BAND_INFO[b];
  if (!info) return false;
  return info.types === null || info.types.indexOf(type) !== -1;
}

/** A sensible band from an age in years. */
export function bandForAge(age) {
  for (var i = 0; i < BANDS.length; i++) {
    var r = BAND_INFO[BANDS[i]].ages;
    if (age >= r[0] && age < r[1] + (i === BANDS.length - 1 ? 1000 : 0) && age < r[1] + 1) {
      if (age < r[1]) return BANDS[i];
      // Ages sit on boundaries (e.g. 5 is in both R and K); prefer the older band.
      if (i + 1 < BANDS.length && BAND_INFO[BANDS[i + 1]].ages[0] === age) return BANDS[i + 1];
      return BANDS[i];
    }
  }
  return 'A';
}

export function clampTheta(b, theta) {
  var r = (BAND_INFO[b] || BAND_INFO.A).thetaRange;
  return Math.max(r[0], Math.min(r[1], theta));
}

export function wordCount(text) {
  var t = String(text || '').trim();
  return t ? t.split(/\s+/).length : 0;
}
