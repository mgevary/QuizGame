/**
 * boosts.js — the reward economy. PURE.
 *
 * The problem this solves is pacing, not motivation. Twenty-five questions in
 * a row with nothing between them is boring however good the questions are,
 * and a bored child stops. Boosts break the session into stretches of about
 * five, each ending in something happening.
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
 * THE GAME PICKS THE BOOST. There is no menu and nothing to hold on to. A
 * menu of three was a decision a six-year-old could not make and a
 * ten-year-old agonised over, and a tray of held boosts was a second decision
 * ("when?") that mostly ended with the boost never being spent. Now the meter
 * fills, a boost arrives, it takes effect at once, and the card says in one
 * big sentence exactly what just happened. A surprise is more fun than a
 * choice, and it is one less thing between the child and the next question.
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
 * `kind` says how a boost takes effect the moment it is earned:
 *   instant   — moves you now
 *   run       — arms for the next N answers
 *   question  — changes the next question that can take it
 *   team      — moves everyone on your team now
 *
 * Every boost carries three pieces of copy, because the card that announces
 * it is the whole explanation a child gets: `label` is its name, `what` is
 * the one big sentence saying what just happened, and `explain` is the
 * plain-words follow-up for a reader who wants to know more.
 */
export var BOOSTS = {
  leap:  { id: 'leap',  label: 'Leap',      icon: 'strong',    kind: 'instant', distance: 2,
           what: 'You jump 2 spaces — right now.',
           explain: 'Your racer moved ahead two spaces, no question needed. Look at the track!' },
  turbo: { id: 'turbo', label: 'Turbo',     icon: 'spark',     kind: 'run', runs: 1, multiplier: 2,
           what: 'Your next answer counts double.',
           explain: 'Get the next question right and you move twice as far as usual.' },
  surge: { id: 'surge', label: 'Surge',     icon: 'star',      kind: 'run', runs: 3, multiplier: 2,
           what: 'Your next 3 answers count double.',
           explain: 'For the next three questions, every right answer moves you twice as far.' },
  hint:  { id: 'hint',  label: 'Narrow it', icon: 'lightbulb', kind: 'question',
           what: 'One wrong answer disappears.',
           explain: 'On your next question, one of the wrong answers is taken away, so there is less to choose from.' },
  team:  { id: 'team',  label: 'Team pull', icon: 'together',  kind: 'team', distance: 1,
           what: 'Everyone on your team moves 1 — because of you.',
           explain: 'Your whole team just moved one space ahead. Look at the track!' }
};

/** Solo play has nobody to pull for, so the team boost is not offered. */
export function offerFor(hasTeam) {
  var ids = ['leap', 'turbo', 'surge', 'hint'];
  if (hasTeam) ids.push('team');
  return ids;
}

export function emptyMeter() {
  return { fill: 0, earned: 0, spent: 0, run: null, narrow: false };
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
 * The game's pick. Seeded, so the same point in the same game produces the
 * same boost on every device — and so a test can drive it. A boost the
 * player is already running is skipped when anything else is on offer, so
 * two Surges in a row cannot quietly stack into six doubled answers.
 */
export function pickBoost(ids, rng, meter) {
  var pool = ids.slice();
  if (meter) {
    var trimmed = pool.filter(function (id) {
      var b = BOOSTS[id];
      if (!b) return false;
      if (b.kind === 'run' && meter.run) return false;
      if (b.kind === 'question' && meter.narrow) return false;
      return true;
    });
    if (trimmed.length) pool = trimmed;
  }
  if (!pool.length) return null;
  return pool[Math.floor(rng() * pool.length)];
}

/**
 * Take a boost's effect on the meter. Instant and team boosts move the track,
 * which is the caller's business; this records what is armed.
 */
export function arm(meter, id) {
  var b = BOOSTS[id];
  if (!b) return meter;
  if (b.kind === 'run') meter.run = { id: id, left: b.runs, multiplier: b.multiplier };
  if (b.kind === 'question') meter.narrow = true;
  meter.spent += 1;
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

/** Is a Narrow-it waiting for a question it can apply to? */
export function narrowPending(meter) { return !!meter.narrow; }

/**
 * Apply a pending Narrow-it to an item, if the item can take it. A question
 * with two options, or none, is left alone and the boost stays armed for the
 * next one — otherwise it would be silently wasted on a tracing question.
 * Returns the item to show, narrowed or not.
 */
export function applyNarrow(meter, item, rng) {
  if (!meter.narrow) return item;
  if (!item.options || item.options.length < 3) return item;
  var out = narrowOptions(item, rng);
  if (out.narrowed) meter.narrow = false;
  return out;
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
