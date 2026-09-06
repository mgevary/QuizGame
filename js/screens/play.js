/**
 * play.js — the session: pick a question, ask it, and when it goes wrong,
 * run the remediation loop.
 *
 * This screen is where every pure module meets a child. The order of events
 * is deliberate and matches docs/LEARNING.md:
 *
 *   ask → judge → (wrong) → feedback naming the ERROR, not the child
 *                        → teach at a rung chosen by their ability
 *                        → GENERATE: they must produce the answer
 *                        → prove it with a DIFFERENT question
 *   then the outcome is written to the log as a fact, and the fold decides
 *   the box, the ability estimate and the track steps.
 */

import { el, clear, button } from '../ui/dom.js';
import { mountItem, promptNode } from '../items/index.js';
import { speak as speakPrompt, unlock as unlockAudio, stop as stopAudio } from '../ui/audio.js';
import { makeRng, freshSeed, hashSeed } from '../content/rng.js';
import { BAND_INFO } from '../content/bands.js';
import * as Session from '../learn/session.js';
import * as Rem from '../learn/remediation.js';
import { thetaFor } from '../learn/ability.js';
import { emptyItemState } from '../learn/scheduler.js';
import { stepsFor } from '../sync/fold.js';
import * as Log from '../sync/log.js';
import { ansPayload, sessPayload } from '../sync/event.js';
import * as Track from '../track/model.js';
import { createRenderer } from '../track/render.js';
import { defaultsFor } from '../content/registry.js';
import { badgeSvg } from '../ui/art.js';

export function mountPlay(host, opts) {
  var user = opts.user;
  var bundle = opts.bundle;
  var settings = opts.settings;
  var band = user.band;
  var bandInfo = BAND_INFO[band] || BAND_INFO.K;
  var maxItems = settings.sessionItems || bandInfo.items[1];

  var seed = freshSeed();
  var rng = makeRng(seed);
  var track = Track.createTrack({ length: 30, theme: settings.theme || 'race' });
  Track.addSeat(track, 0);
  var roster = { 0: { name: user.name, racer: user.avatar || 'rocket' } };

  var queue = Session.createQueue({ session: 0, seed: seed, band: band });
  var run = null;               // the active remediation run, if any
  var currentItem = null;
  var currentState = null;
  var handle = null;
  var answered = 0;
  var startedAt = Date.now();
  var recoveredNames = [];
  var destroyed = false;

  Log.append('sess', user.id, sessPayload('start', { session: 's' + seed, mode: 'solo' }));
  var st = Log.state();
  var me = st.users[user.id] || { items: {}, skills: {}, session: 1, turn: 0 };
  queue.session = me.session;
  queue.turn = 0;
  Session.updateSuspensions(queue, me.skills, me.items);

  /* ── layout ─────────────────────────────────────────────────────────── */
  var root = el('div', 'screen screen-play');

  var top = el('div', 'play-top');
  var quitBtn = button('✕', 'icon-btn', function () { finishSession(true); });
  quitBtn.setAttribute('aria-label', 'End this game');
  top.appendChild(quitBtn);
  var counter = el('div', 'play-count', '');
  top.appendChild(counter);
  root.appendChild(top);

  var trackWrap = el('div', 'play-track');
  var canvas = el('canvas', 'track-canvas');
  trackWrap.appendChild(canvas);
  root.appendChild(trackWrap);

  var stage = el('div', 'play-stage');
  root.appendChild(stage);

  var live = el('div', 'sr-live');
  live.setAttribute('aria-live', 'polite');
  live.setAttribute('role', 'status');
  root.appendChild(live);

  host.appendChild(root);

  var renderer = settings.reducedMotion ? null : createRenderer(canvas, { theme: settings.theme || 'race', seed: seed });
  if (settings.reducedMotion) trackWrap.style.display = 'none';

  var raf = null, lastFrame = 0;
  function frame(now) {
    if (destroyed) return;
    raf = requestAnimationFrame(frame);
    var dt = Math.min(0.05, (now - lastFrame) / 1000);
    lastFrame = now;
    if (renderer) renderer.draw(track, roster, dt);
  }
  if (renderer) raf = requestAnimationFrame(frame);

  function say(prompt) {
    speakPrompt(prompt, { base: currentItem && currentItem.mediaBase, enabled: settings.audio !== false });
  }

  function announce(text) { live.textContent = text; }

  /* ── the loop ───────────────────────────────────────────────────────── */

  function next() {
    stopAudio();
    if (answered >= maxItems) return finishSession(false);
    var state = Log.state();
    var u = state.users[user.id] || { items: {}, skills: {} };
    queue.successTarget = Track.successTargetFor(track, 0);
    var got = Session.pick(queue, {
      pool: bundle.pool, items: u.items, skills: u.skills,
      nowMs: Date.now(), rng: rng, broken: brokenFor(state), parents: bundle.parents
    });
    if (!got) return finishSession(false);
    currentItem = resolve(got.item);
    currentState = u.items[got.item.id] || emptyItemState();
    run = null;
    ask(currentItem, false);
  }

  function brokenFor(state) {
    var out = {};
    for (var id in state.modules) {
      var b = state.modules[id].broken || {};
      for (var k in b) out[id + '/' + k] = true;
    }
    return out;
  }

  /** Templates become a concrete question here, seeded so it is reproducible. */
  function resolve(item) {
    if (item.type !== 'template') return item;
    var gen = bundle.generate(item, makeRng(hashSeed(item.id + ':' + seed + ':' + answered)));
    if (!gen) return item;
    gen.mod = item.mod;
    gen.mediaBase = item.mediaBase;
    gen.id = item.id;
    return gen;
  }

  function ask(item, isRetry) {
    clear(stage);
    expose(item, 'ask');
    counter.textContent = (answered + 1) + ' of ' + maxItems;
    var card = el('div', 'card card-q');
    stage.appendChild(card);
    handle = mountItem(card, {
      item: item, band: band, settings: settings, rng: rng,
      maxWords: bandInfo.maxWords,
      pictureSize: bandInfo.touchPx,
      speak: say,
      onAnswer: function (correct, detail) { judge(correct, detail); }
    });
    if (settings.audio !== false && item.prompt) say(item.prompt);
    announce(item.prompt && item.prompt.text ? item.prompt.text : 'New question');
    var flag = button('This question looks wrong', 'link-btn', function () { flagBroken(item); });
    card.appendChild(flag);
  }

  function flagBroken(item) {
    var parts = item.id.split('/');
    Log.append('mod', user.id, { op: 'flag', moduleId: parts[0], item: parts.slice(1).join('/') });
    announce('Thanks. We will not ask that one again.');
    record('wrong', { rung: -1 });
    answered += 1;
    next();
  }

  function judge(correct, detail) {
    if (correct) {
      var outcome = currentState.n === 0 ? 'first' : 'review';
      var isRecovery = outcome === 'review' && currentState.l > 0 && !currentState.rec;
      celebrate(isRecovery);
      if (isRecovery) recoveredNames.push(currentItem.prompt && currentItem.prompt.text);
      record(outcome, { rung: -1 });
      advance(stepsFor(outcome, currentState));
      return;
    }
    if (!Session.mayRemediate(queue)) {
      // Past the cap, a failure is logged and rescheduled without the full
      // loop. Without this, a bad day becomes fifteen minutes of teaching and
      // the race never moves.
      record('wrong', { rung: -1 });
      advance(0);
      return;
    }
    Session.noteRemediation(queue);
    startRemediation(detail);
  }

  function startRemediation(detail) {
    var state = Log.state();
    var u = state.users[user.id] || { skills: {} };
    var theta = thetaFor(u.skills, currentItem.skill, band, bundle.parents);
    run = Rem.start({
      item: currentItem,
      theta: theta,
      lapses: currentState.l,
      misconception: detail && detail.misconception,
      moduleDefaults: defaultsFor(bundle, currentItem),
      answerText: answerTextOf(currentItem),
      proveItem: Session.proveItemFor(currentItem, bundle.byId),
      nowMs: Date.now()
    });
    Track.setPit(track, 0, true);
    showFeedback(detail);
  }

  function showFeedback(detail) {
    clear(stage);
    var card = el('div', 'card card-teach');
    card.appendChild(el('div', 'teach-badge', '🔧'));
    // Task-level, never person-level. Name the ERROR, not the child.
    var msg = run.misconceptionNote || errorLine(currentItem, detail);
    card.appendChild(el('h2', 'teach-head', 'Not yet — here is why'));
    card.appendChild(el('p', 'teach-msg', msg));
    card.appendChild(button('Show me', 'btn btn-go', function () {
      Rem.acknowledgeFeedback(run, Date.now());
      showTeach();
    }));
    stage.appendChild(card);
    announce(msg);
    say({ tts: msg });
  }

  function showTeach() {
    clear(stage);
    var rung = Rem.currentRung(run);
    var card = el('div', 'card card-teach');
    card.appendChild(el('div', 'teach-kind', rungLabel(rung.kind)));
    card.appendChild(el('p', 'teach-body', rung.text || ''));
    if (rung.emoji) card.appendChild(el('div', 'teach-emoji', rung.emoji));
    // There is deliberately no "OK, got it" that returns to the race. The
    // only way onward is to produce the answer.
    card.appendChild(button('I can do it', 'btn btn-go', function () {
      Rem.proceedToGenerate(run);
      showGenerate();
    }));
    stage.appendChild(card);
    announce(rung.text || '');
    say(rung.tts ? { tts: rung.tts } : { tts: rung.text });
  }

  function showGenerate() {
    clear(stage);
    var spec = Rem.resolveGenerate(currentItem, null);
    var item = spec.authored ? buildGenerateItem(spec.spec) : reshuffled(currentItem);
    var card = el('div', 'card card-q card-generate');
    card.appendChild(el('div', 'teach-kind', 'Your turn'));
    stage.appendChild(card);
    expose(item, 'generate');
    var answeredAt = 0;
    handle = mountItem(card, {
      item: item, band: band, settings: settings, rng: rng,
      maxWords: bandInfo.maxWords, pictureSize: bandInfo.touchPx, speak: say,
      onAnswer: function (correct) {
        answeredAt = Date.now();
        Rem.answerGenerate(run, correct, Date.now());
        if (run.phase === 'teach') return showTeach();
        if (run.phase === 'assist') return showAssist();
        if (run.phase === 'prove') return showProve(answeredAt);
        finishRemediation(answeredAt);
      }
    });
    if (item.prompt) say(item.prompt);
  }

  function showAssist() {
    clear(stage);
    var card = el('div', 'card card-teach');
    card.appendChild(el('h2', 'teach-head', 'Here it is'));
    card.appendChild(el('p', 'teach-body', 'The answer is ' + answerTextOf(currentItem) + '. Tap it to keep going.'));
    var b = button(answerTextOf(currentItem), 'btn btn-answer', function () {
      Rem.completeAssist(run);
      if (run.phase === 'prove') showProve(Date.now());
      else finishRemediation(Date.now());
    });
    card.appendChild(b);
    stage.appendChild(card);
    announce('The answer is ' + answerTextOf(currentItem));
  }

  function showProve(answeredAt) {
    clear(stage);
    var card = el('div', 'card card-q card-prove');
    card.appendChild(el('div', 'teach-kind', 'Prove it'));
    stage.appendChild(card);
    var item = resolve(run.proveItem);
    expose(item, 'prove');
    handle = mountItem(card, {
      item: item, band: band, settings: settings, rng: rng,
      maxWords: bandInfo.maxWords, pictureSize: bandInfo.touchPx, speak: say,
      onAnswer: function (correct) {
        Rem.answerProve(run, correct);
        finishRemediation(answeredAt);
      }
    });
    if (item.prompt) say(item.prompt);
  }

  function finishRemediation(answeredAt) {
    Track.setPit(track, 0, false);
    var farm = Rem.looksLikeFarming(run, answeredAt);
    var outcome = run.outcome === 'assisted' ? 'assisted' : 'remediated';
    record(outcome, { rung: run.highestRung, farm: farm });
    celebrate(false);
    advance(stepsFor(outcome, currentState, farm));
  }

  function record(outcome, extra) {
    Log.append('ans', user.id, ansPayload({
      item: currentItem.id, skill: currentItem.skill, diff: currentItem.difficulty,
      outcome: outcome, assisted: outcome === 'assisted',
      rung: extra && extra.rung, mod: currentItem.mod,
      session: 's' + seed, farm: !!(extra && extra.farm)
    }));
  }

  function advance(steps) {
    Track.step(track, 0, steps);
    Track.noteAnswered(track, 0);
    Session.advance(queue);
    answered += 1;
    setTimeout(next, 420);
  }

  function celebrate(big) {
    if (settings.reducedMotion) return;
    var badge = el('div', 'burst' + (big ? ' is-big' : ''));
    badge.innerHTML = badgeSvg(big ? 'recovery' : 'mastery');
    stage.appendChild(badge);
    if (big) announce('You turned a mistake into a know!');
    setTimeout(function () { if (badge.parentNode) badge.parentNode.removeChild(badge); }, big ? 1500 : 700);
  }

  function finishSession(early) {
    if (destroyed) return;
    destroyed = true;
    if (raf) cancelAnimationFrame(raf);
    if (renderer) renderer.destroy();
    stopAudio();
    Log.append('sess', user.id, sessPayload('end', { session: 's' + seed }));
    opts.onDone({
      answered: answered,
      steps: track.positions[0],
      seconds: Math.round((Date.now() - startedAt) / 1000),
      recovered: recoveredNames.filter(Boolean),
      early: early
    });
  }

  next();

  return {
    destroy: function () {
      destroyed = true;
      if (raf) cancelAnimationFrame(raf);
      if (renderer) renderer.destroy();
      if (handle && handle.destroy) handle.destroy();
      stopAudio();
    }
  };

  /* ── helpers ────────────────────────────────────────────────────────── */

  /**
   * Test hook. Exposed so scripts/smoke.mjs can drive a real session through
   * real input events — including answering the generate step correctly,
   * which is otherwise unknowable from the DOM. Never read by the game.
   */
  function expose(item, phase) {
    window.__quiz = window.__quiz || {};
    window.__quiz.current = {
      phase: phase,
      type: item.type,
      answer: answerTextOf(item),
      wordTiles: !!item.wordTiles
    };
  }

  function answerTextOf(item) {
    if (item.answer) return String(item.answer);
    var opts2 = item.options || [];
    for (var i = 0; i < opts2.length; i++) if (opts2[i].correct) return String(opts2[i].v || opts2[i].alt || '');
    if (item.type === 'count') return String(item.n);
    if (item.type === 'trace') return String(item.glyph || 'it');
    return 'it';
  }

  function errorLine(item, detail) {
    var right = answerTextOf(item);
    if (detail && detail.chosen) return 'You picked "' + detail.chosen + '". The answer is "' + right + '".';
    return 'The answer is "' + right + '".';
  }

  function rungLabel(kind) {
    return { nudge: 'A hint', example: 'Here is one like it', rule: 'The rule', reveal: 'The answer' }[kind] || 'Hint';
  }

  /** Re-ask the original with options reshuffled and the wrong pick retained. */
  function reshuffled(item) {
    var copy = {};
    for (var k in item) copy[k] = item[k];
    copy.shuffle = true;
    return copy;
  }

  function buildGenerateItem(spec) {
    var copy = {};
    for (var k in spec) copy[k] = spec[k];
    copy.id = currentItem.id + '#gen';
    copy.skill = currentItem.skill;
    copy.difficulty = currentItem.difficulty;
    copy.band = currentItem.band;
    copy.mod = currentItem.mod;
    copy.mediaBase = currentItem.mediaBase;
    if (!copy.type) copy.type = 'assemble';
    // A generate step authored only as a shape (type + flags) is completed
    // from the original item, so content can stay terse.
    if (copy.type === 'assemble' && !copy.tiles) {
      var ans = answerTextOf(currentItem);
      copy.answer = ans;
      copy.wordTiles = ans.indexOf(' ') !== -1;
      var units = copy.wordTiles ? ans.split(/\s+/) : ans.split('');
      copy.tiles = units.concat(copy.wordTiles ? ['not', 'the'] : ['x', 'o']);
      if (!copy.prompt) copy.prompt = { text: 'Build the answer', tts: true };
    }
    return copy;
  }
}
