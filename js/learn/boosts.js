/**
 * boosts.js — the reward economy. PURE.
 *
 * The problem this solves is pacing, not motivation. Twenty-five questions in
 * a row with nothing between them is boring however good the questions are,
 * and a bored child stops. Boosts break the session into stretches of about
 * five, each ending in something to choose.
 *
 * THE ONE DESIGN DECISION THAT MATTERS: the meter fills from ANSWERING, not
 * from being right — and turning a mistake around fills it FASTER than a
 * correct answer does.
 *
 * That inversion is deliberate. The evidence against reward systems in
 * learning (Deci, Koestner & Ryan 1999) is specifically about rewards that are
 * expected, tangible and contingent on PERFORMANCE: they teach a child to
 * chase the reward instead of the work, and they pay the child who already
 * knew the answer while the one who struggled gets nothing. A meter that
 * fills on effort avoids both. The child having a hard night earns boosts
 * faster than the one breezing through, which is the right way round and is
 * also, not incidentally, the more fun way round.
 *
 * Boosts also only ever touch the RACE. None of them make a question easier
 * to be judged on, none of them change the ability estimate, and none of them
 * alter what comes back tomorrow. They are a game layer over a learning
 * layer, and the two never mix.
 */

export var METER_MAX = 5;

/** What one resolved question adds to the meter. */
export var METER_GAIN = {
  first: 1,        // right first time
  review: 1,       // right on a review
  recovery: 2,     // turned a mistake around — the thing we want most
  remediated: 2,   // got there after being taught — that took real work
  assisted: 1,     // needed the answer shown, still finished
  wrong: 1         // answered at all
};

/**
 * `kind` says when a boost can be used:
 *   instant   — spends immediately, moves you now
 *   run       — arms for the next N questions
 *   question  — changes the question in front of you
 *   team      — moves everyone on your team
 */
export var BOOSTS = {
  leap:  { id: 'leap',  label: 'Leap',      blurb: 'Jump two spaces, right now.',            icon: 'strong', kind: 'instant', distance: 2 },
  turbo: { id: 'turbo', label: 'Turbo',     blurb: 'Your next answer counts double.',        icon: 'spark',  kind: 'run', runs: 1, multiplier: 2 },
  surge: { id: 'surge', label: 'Surge',     blurb: 'The next three answers count double.',   icon: 'star',   kind: 'run', runs: 3, multiplier: 2 },
  hint:  { id: 'hint',  label: 'Narrow it', blurb: 'Take away one wrong answer.',            icon: 'lightbulb', kind: 'question' },
  swap:  { id: 'swap',  label: 'Swap',      blurb: 'A different question. This one comes back later.', icon: 'relay', kind: 'question' },
  team:  { id: 'team',  label: 'Team pull', blurb: 'Everyone on your team moves one.',       icon: 'together', kind: 'team', distance: 1 }
};

/** Solo play has nobody to pull for, so the team boost is not offered. */
export function offerFor(hasTeam) {
  var ids = ['leap', 'turbo', 'surge', 'hint', 'swap'];
  if (hasTeam) ids.push('team');
  return ids;
}

export function emptyMeter() {
  return { fill: 0, earned: 0, spent: 0, run: null };
}

/**
 * Add a resolved question to the meter.
 * @returns {boolean} true if a boost was just earned
 */
export function addResolved(meter, outcome, wasRecovery) {
  var gain = wasRecovery ? METER_GAIN.recovery : (METER_GAIN[outcome] === undefined ? 1 : METER_GAIN[outcome]);
  meter.fill += gain;
  if (meter.fill < METER_MAX) return false;
  meter.fill -= METER_MAX;
  meter.earned += 1;
  return true;
}

/** 0..1, for drawing the meter. */
export function meterProgress(meter) {
  return Math.max(0, Math.min(1, meter.fill / METER_MAX));
}

/**
 * Pick three of the offered boosts to show. Seeded, so the same point in the
 * same game offers the same choice on every device — and so a test can drive
 * it. Deliberately three and not all six: a choice of three is a decision, a
 * choice of six is a menu.
 */
export function chooseOffer(ids, rng) {
  var pool = ids.slice();
  var out = [];
  while (out.length < 3 && pool.length) {
    var i = Math.floor(rng() * pool.length);
    out.push(pool[i]);
    pool.splice(i, 1);
  }
  return out;
}

/** Arm a boost that lasts for the next few questions. */
export function arm(meter, id) {
  var b = BOOSTS[id];
  if (!b || b.kind !== 'run') return meter;
  meter.run = { id: id, left: b.runs, multiplier: b.multiplier };
  return meter;
}

/** The multiplier in force right now. */
export function multiplierFor(meter) {
  return meter.run ? meter.run.multiplier : 1;
}

/**
 * Consume one question's worth of an armed boost. Called after every resolved
 * question, so an armed Turbo cannot be saved up across a whole session.
 */
export function tickRun(meter) {
  if (!meter.run) return meter;
  meter.run.left -= 1;
  if (meter.run.left <= 0) meter.run = null;
  return meter;
}

export function spend(meter) { meter.spent += 1; return meter; }

/**
 * Remove one wrong option, keeping the right one. Returns a NEW item; the
 * original is untouched, because it stays in the schedule and will be asked
 * again in full later.
 */
export function narrowOptions(item, rng) {
  if (!item.options || item.options.length < 3) return item;
  var wrong = [];
  for (var i = 0; i < item.options.length; i++) if (!item.options[i].correct) wrong.push(i);
  if (!wrong.length) return item;
  var drop = wrong[Math.floor(rng() * wrong.length)];
  var copy = {};
  for (var k in item) copy[k] = item[k];
  copy.options = item.options.filter(function (o, idx) { return idx !== drop; });
  copy.narrowed = true;
  return copy;
}
