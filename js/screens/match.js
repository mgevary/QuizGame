/**
 * match.js — the game itself, for one player or five.
 *
 * Solo is a match with one seat. There is deliberately no second code path:
 * a separate single-player screen would drift, and the interesting parts —
 * the teach loop, the ability model, the track — are identical either way.
 *
 * Pass-and-play is the default because it needs nothing: no server, no second
 * device, no pairing. A four-year-old with no phone of their own can still be
 * on your team.
 *
 * Each player is asked questions from THEIR OWN queue at THEIR OWN level, so
 * a four-year-old naming a letter and a nine-year-old doing 7x8 move the team
 * the same distance. That is what makes mixed-age play fair, and it is why
 * nothing about difficulty is negotiated between seats.
 */

import { el, clear, button } from '../ui/dom.js';
import { racerSvg, badgeSvg, burstSvg } from '../ui/art.js';
import { icon, iconSvg, REACTION_LABELS } from '../ui/icons.js';
import { mountItem } from '../items/index.js';
import { speak as speakPrompt, stop as stopAudio } from '../ui/audio.js';
import { makeRng, freshSeed, hashSeed } from '../content/rng.js';
import { BAND_INFO } from '../content/bands.js';
import * as Session from '../learn/session.js';
import * as Rem from '../learn/remediation.js';
import { thetaFor } from '../learn/ability.js';
import { emptyItemState } from '../learn/scheduler.js';
import { stepsFor } from '../sync/fold.js';
import * as Log from '../sync/log.js';
import { ansPayload, sessPayload } from '../sync/event.js';
import { createLocalSession } from '../net/local.js';
import { MP_MODES, CHEERS } from '../net/coordinator.js';
import { createRenderer } from '../track/render.js';
import { defaultsFor } from '../content/registry.js';
import { generate as generateTemplate } from '../content/templates.js';
import { loadSettings } from '../settings/settings.js';

export function mountMatch(host, opts) {
  var mode = opts.mode || 'solo';
  var cfg = MP_MODES[mode] || { label: 'Practice', teams: false, buzz: false, icon: 'solo' };
  var players = opts.players;            // [{id, name, band, avatar, settings, bundle}]
  var solo = players.length === 1;
  var seed = freshSeed();
  var destroyed = false;

  /* ── per-player state ───────────────────────────────────────────────── */
  var seats = players.map(function (p, i) {
    var band = p.band;
    var info = BAND_INFO[band] || BAND_INFO.K;
    Log.append('sess', p.id, sessPayload('start', { session: 's' + seed, mode: mode, seats: players.length }));
    var me = Log.state().users[p.id] || { session: 1 };
    var q = Session.createQueue({ session: me.session, seed: seed + i, band: band });
    Session.updateSuspensions(q, (Log.state().users[p.id] || {}).skills || {}, (Log.state().users[p.id] || {}).items || {});
    return {
      seat: i, user: p, band: band, info: info, queue: q,
      rng: makeRng(seed + i * 977),
      answered: 0, recovered: [], target: p.settings.sessionItems || info.items[0],
      run: null, item: null, itemState: null, handle: null
    };
  });

  var session = createLocalSession(players.map(function (p) {
    return { name: p.name, racer: p.avatar, band: p.band, userId: p.id };
  }));

  var track = null;
  var turnIndex = 0;
  // A checkpoint must not interrupt whoever is mid-question. It is queued and
  // played back between turns, which is the only moment everyone is looking
  // at the screen anyway.
  var pendingCheckpoint = null;
  var startedAt = Date.now();
  var settings = players[0].settings;

  /* ── layout ─────────────────────────────────────────────────────────── */
  var root = el('div', 'screen screen-match');

  var top = el('div', 'play-top');
  var quit = button('', 'icon-btn', function () { finish(true); });
  quit.appendChild(icon('close', 20));
  quit.setAttribute('aria-label', 'End this game');
  top.appendChild(quit);
  var modeTag = el('div', 'match-mode');
  if (cfg.icon) modeTag.appendChild(icon(cfg.icon, 16));
  modeTag.appendChild(el('span', null, cfg.label));
  top.appendChild(modeTag);
  var counter = el('div', 'play-count', '');
  top.appendChild(counter);
  root.appendChild(top);

  var trackWrap = el('div', 'play-track');
  var canvas = el('canvas', 'track-canvas');
  trackWrap.appendChild(canvas);
  root.appendChild(trackWrap);

  var teamBar = el('div', 'team-bar');
  root.appendChild(teamBar);

  var stage = el('div', 'play-stage');
  root.appendChild(stage);

  var live = el('div', 'sr-live');
  live.setAttribute('aria-live', 'polite');
  live.setAttribute('role', 'status');
  root.appendChild(live);

  host.appendChild(root);

  var renderer = settings.reducedMotion ? null : createRenderer(canvas, { theme: cfg.theme || 'race', seed: seed });
  if (settings.reducedMotion) trackWrap.style.display = 'none';

  var rosterByseat = {};
  session.roster().forEach(function (r) { rosterByseat[r.seat] = r; });

  var raf = null, lastFrame = 0;
  function frame(now) {
    if (destroyed) return;
    raf = requestAnimationFrame(frame);
    var dt = Math.min(0.05, (now - lastFrame) / 1000);
    lastFrame = now;
    if (renderer && track) renderer.draw(track, rosterByseat, dt);
  }

  /* ── wire the coordinator ───────────────────────────────────────────── */
  session.on('start', function (m) { track = m.track; drawTeams(); });
  session.on('state', function (m) { track = m.track; drawTeams(); });
  session.on('pit', function () { track = session.snapshot(); });
  session.on('checkpoint', function (m) {
    track = m.track;
    drawTeams();
    pendingCheckpoint = m.leg;
  });
  session.on('finished', function (m) {
    if (renderer) renderer.celebrate(m.seat);
  });
  session.on('cheer', function (m) { showCheer(m); });
  session.on('results', function () { finish(false); });

  var match = session.start(mode === 'solo' ? 'together' : mode, { seed: seed, length: opts.length });
  track = session.snapshot();
  if (renderer) raf = requestAnimationFrame(frame);
  drawTeams();

  /* ── the team bar: the thing that makes a team feel like a team ─────── */
  function drawTeams() {
    clear(teamBar);
    if (!track) return;
    if (mode === 'teams' || mode === 'relay') {
      var names = Object.keys(track.teams || {});
      var totals = names.map(function (t) {
        var sum = 0;
        (track.teams[t] || []).forEach(function (s) { sum += track.positions[s] || 0; });
        return sum;
      });
      // Level at the start, so the rope reads as a rope before anyone has
      // answered. An empty bar looks broken, and this is the one element a
      // four-year-old is meant to watch.
      var grand = totals[0] + totals[1];
      var share = grand > 0 ? totals[0] / grand : 0.5;
      var rope = el('div', 'rope');
      var left = el('div', 'rope-side is-a');
      left.style.width = Math.round(share * 100) + '%';
      var right = el('div', 'rope-side is-b');
      right.style.width = Math.round((1 - share) * 100) + '%';
      rope.appendChild(left);
      rope.appendChild(right);
      rope.appendChild(el('span', 'rope-knot'));
      teamBar.appendChild(rope);
      var labels = el('div', 'rope-labels');
      names.forEach(function (t, i) {
        var who = (track.teams[t] || []).map(function (s) { return rosterByseat[s] ? rosterByseat[s].name : '?'; }).join(' + ');
        var lab = el('span', 'rope-label is-' + t.toLowerCase(), who + ' · ' + Math.round(totals[i] * 10) / 10);
        labels.appendChild(lab);
      });
      teamBar.appendChild(labels);
    } else if (mode === 'together' || (mode === 'solo' && !solo)) {
      var total = 0;
      for (var s in track.positions) total += track.positions[s];
      var bar = el('div', 'together-bar');
      var fill = el('div', 'together-fill');
      fill.style.width = Math.min(100, Math.round((total / track.length) * 100)) + '%';
      bar.appendChild(fill);
      teamBar.appendChild(bar);
      teamBar.appendChild(el('p', 'together-label',
        Math.round(total * 10) / 10 + ' of ' + track.length + ' — together'));
    }
  }

  /**
   * A cheer lands as a floating emoji on the shared screen. It is four fixed
   * symbols and nothing else: there is deliberately no free text of any kind
   * between players, which is both a safeguarding rule and the reason a
   * sibling cannot use this to be unkind.
   */
  function showCheer(m) {
    if (settings.reducedMotion) return;
    var who = rosterByseat[m.to];
    var f = el('div', 'cheer-float');
    f.innerHTML = iconSvg(m.emoji);
    f.style.left = (12 + Math.random() * 60) + '%';
    stage.appendChild(f);
    announce((rosterByseat[m.from] ? rosterByseat[m.from].name : 'Someone') +
      ' cheered ' + (who ? who.name : 'you'));
    setTimeout(function () { if (f.parentNode) f.parentNode.removeChild(f); }, 1400);
  }

  /** The cheer strip, shown while the next player is getting ready. */
  function cheerStrip(fromSeat, toSeat) {
    var wrap = el('div', 'cheer-strip');
    CHEERS.forEach(function (name) {
      var b = el('button', 'cheer-btn');
      b.type = 'button';
      b.appendChild(icon(name, 24));
      b.setAttribute('aria-label', REACTION_LABELS[name] || 'Cheer');
      b.addEventListener('click', function (e) {
        e.preventDefault();
        session.cheer(fromSeat, toSeat, name);
        b.className = 'cheer-btn is-sent';
      });
      wrap.appendChild(b);
    });
    return wrap;
  }

  /* ── turn flow ──────────────────────────────────────────────────────── */

  function currentSeat() { return seats[turnIndex % seats.length]; }

  function everyoneDone() {
    for (var i = 0; i < seats.length; i++) if (seats[i].answered < seats[i].target) return false;
    return true;
  }

  function nextTurn() {
    stopAudio();
    if (destroyed) return;
    if (pendingCheckpoint !== null) {
      var leg = pendingCheckpoint;
      pendingCheckpoint = null;
      return checkpointMoment(leg);
    }
    if (everyoneDone()) return finish(false);
    // Skip anyone who has finished their share, so a quick player does not
    // hold up the rest.
    var guard = 0;
    while (currentSeat().answered >= currentSeat().target && guard++ < seats.length * 2) turnIndex++;
    var s = currentSeat();
    counter.textContent = (s.answered + 1) + ' of ' + s.target;
    if (solo) return askFor(s);
    handover(s);
  }

  /**
   * The pass-and-play handover. Big, unmissable, and it names the next player
   * out loud — the youngest player often cannot read whose turn it is.
   */
  function handover(s) {
    clear(stage);
    var card = el('div', 'card card-handover');
    var av = el('div', 'handover-avatar');
    av.innerHTML = racerSvg(s.user.avatar || 'rocket');
    card.appendChild(av);
    card.appendChild(el('h2', 'handover-name', s.user.name + '’s turn'));
    if (track && track.teams) {
      var team = rosterByseat[s.seat] && rosterByseat[s.seat].team;
      if (team) card.appendChild(el('p', 'handover-team', 'for team ' + team));
    }
    card.appendChild(button('I’m ready', 'btn btn-big btn-go', function () { askFor(s); }));
    // Cheer whoever just handed the device over. It costs one tap and is the
    // most-used social thing in a game like this.
    var prev = seats[(turnIndex - 1 + seats.length) % seats.length];
    if (prev && prev.seat !== s.seat && prev.answered > 0) {
      card.appendChild(el('p', 'cheer-label', 'Give ' + prev.user.name + ' a cheer'));
      card.appendChild(cheerStrip(s.seat, prev.seat));
    }
    stage.appendChild(card);
    announce(s.user.name + '’s turn');
  }

  /**
   * Read a QUESTION aloud. Nothing else is ever spoken automatically: not the
   * handover, not a checkpoint, not a hint. Anything that talks when there is
   * no question on screen is noise, and noise from a device nobody is looking
   * at is worse than silence.
   */
  function sayQuestion(prompt, s) {
    if (!s || s.user.settings.audio === false) return;
    speakPrompt(prompt, { base: s.item ? s.item.mediaBase : null, enabled: true });
  }

  /**
   * The one exception. A child at a pre-reading band cannot read the teach
   * card either, so leaving it silent would make the whole remediation loop
   * useless to exactly the children it matters most for. Everyone who can
   * read gets it in text, with the speaker button if they want it.
   */
  function sayTeaching(prompt, s) {
    if (!s || s.user.settings.audio === false) return;
    if (s.info.audio !== 'required') return;
    speakPrompt(prompt, { base: s.item ? s.item.mediaBase : null, enabled: true });
  }
  function announce(text) { live.textContent = text; }

  function askFor(s) {
    var state = Log.state();
    var u = state.users[s.user.id] || { items: {}, skills: {} };
    s.queue.successTarget = 0.82;
    var got = Session.pick(s.queue, {
      pool: s.user.bundle.pool, items: u.items, skills: u.skills,
      nowMs: Date.now(), rng: s.rng, broken: brokenFor(state), parents: s.user.bundle.parents
    });
    if (!got) { s.answered = s.target; return nextTurn(); }
    s.item = resolveItem(s, got.item);
    s.itemState = u.items[got.item.id] || emptyItemState();
    s.run = null;
    renderQuestion(s, s.item, 'card-q');
  }

  function brokenFor(state) {
    var out = {};
    for (var id in state.modules) {
      var b = state.modules[id].broken || {};
      for (var k in b) out[id + '/' + k] = true;
    }
    return out;
  }

  function resolveItem(s, item) {
    if (item.type !== 'template') return item;
    var gen = generateTemplate(item, makeRng(hashSeed(item.id + ':' + seed + ':' + s.answered + ':' + s.seat)));
    if (!gen) return item;
    gen.mod = item.mod; gen.mediaBase = item.mediaBase; gen.id = item.id;
    return gen;
  }

  function renderQuestion(s, item, cardClass, onAnswer) {
    clear(stage);
    var card = el('div', 'card ' + cardClass);
    if (!solo) {
      var who = el('div', 'q-who');
      var av = el('span', 'q-who-avatar');
      av.innerHTML = racerSvg(s.user.avatar || 'rocket');
      who.appendChild(av);
      who.appendChild(el('span', 'q-who-name', s.user.name));
      card.appendChild(who);
    }
    stage.appendChild(card);
    exposeForTests(item, cardClass);
    s.handle = mountItem(card, {
      item: item, band: s.band, settings: s.user.settings, rng: s.rng,
      maxWords: s.info.maxWords, pictureSize: s.info.touchPx,
      speak: function (p) { speakPrompt(p, { base: s.item ? s.item.mediaBase : null, enabled: true }); },
      onAnswer: onAnswer || function (correct, detail) { judge(s, correct, detail); }
    });
    if (item.prompt) sayQuestion(item.prompt, s);
    announce((item.prompt && item.prompt.text) || 'New question');
    if (cardClass === 'card-q') {
      card.appendChild(button('This question looks wrong', 'link-btn', function () { flagBroken(s, item); }));
    }
  }

  function flagBroken(s, item) {
    var parts = item.id.split('/');
    Log.append('mod', s.user.id, { op: 'flag', moduleId: parts[0], item: parts.slice(1).join('/') });
    announce('Thanks. We will not ask that one again.');
    record(s, 'wrong', { rung: -1 });
    complete(s, 0);
  }

  function judge(s, correct, detail) {
    if (correct) {
      var outcome = s.itemState.n === 0 ? 'first' : 'review';
      var recovery = outcome === 'review' && s.itemState.l > 0 && !s.itemState.rec;
      if (recovery && s.item.prompt) s.recovered.push(s.item.prompt.text);
      record(s, outcome, { rung: -1 });
      celebrate(recovery);
      return complete(s, stepsFor(outcome, s.itemState));
    }
    if (!Session.mayRemediate(s.queue)) {
      record(s, 'wrong', { rung: -1 });
      return complete(s, 0);
    }
    Session.noteRemediation(s.queue);
    beginTeaching(s, detail);
  }

  /* ── the teach loop ─────────────────────────────────────────────────── */

  function beginTeaching(s, detail) {
    var u = Log.state().users[s.user.id] || { skills: {} };
    s.run = Rem.start({
      item: s.item,
      theta: thetaFor(u.skills, s.item.skill, s.band, s.user.bundle.parents),
      lapses: s.itemState.l,
      misconception: detail && detail.misconception,
      moduleDefaults: defaultsFor(s.user.bundle, s.item),
      answerText: answerTextOf(s.item),
      proveItem: Session.proveItemFor(s.item, s.user.bundle.byId),
      nowMs: Date.now()
    });
    session.pit(s.seat, true);
    showFeedback(s, detail);
  }

  function showFeedback(s, detail) {
    clear(stage);
    var card = el('div', 'card card-teach');
    card.appendChild(icon('repair', 34, 'teach-badge'));
    var msg = s.run.misconceptionNote || errorLine(s.item, detail);
    card.appendChild(el('h2', 'teach-head', 'Not yet — here is why'));
    card.appendChild(el('p', 'teach-msg', msg));
    card.appendChild(button('Show me', 'btn btn-go', function () {
      Rem.acknowledgeFeedback(s.run, Date.now());
      showTeach(s);
    }));
    stage.appendChild(card);
    announce(msg);
    sayTeaching({ tts: msg }, s);
  }

  function showTeach(s) {
    clear(stage);
    var rung = Rem.currentRung(s.run);
    var card = el('div', 'card card-teach');
    card.appendChild(el('div', 'teach-kind', rungLabel(rung.kind)));
    card.appendChild(el('p', 'teach-body', rung.text || ''));
    if (rung.emoji) card.appendChild(el('div', 'teach-emoji', rung.emoji));
    card.appendChild(button('I can do it', 'btn btn-go', function () {
      Rem.proceedToGenerate(s.run);
      showGenerate(s);
    }));
    stage.appendChild(card);
    announce(rung.text || '');
    sayTeaching(rung.tts ? { tts: rung.tts } : { tts: rung.text }, s);
  }

  function showGenerate(s) {
    var spec = Rem.resolveGenerate(s.item, null);
    var item = spec.authored ? buildGenerateItem(s, spec.spec) : reshuffled(s.item);
    renderQuestion(s, item, 'card-q card-generate', function (correct) {
      var at = Date.now();
      Rem.answerGenerate(s.run, correct, at);
      if (s.run.phase === 'teach') return showTeach(s);
      if (s.run.phase === 'assist') return showAssist(s);
      if (s.run.phase === 'prove') return showProve(s, at);
      endTeaching(s, at);
    });
  }

  function showAssist(s) {
    clear(stage);
    var card = el('div', 'card card-teach');
    card.appendChild(el('h2', 'teach-head', 'Here it is'));
    card.appendChild(el('p', 'teach-body', 'The answer is ' + answerTextOf(s.item) + '. Tap it to keep going.'));
    card.appendChild(button(answerTextOf(s.item), 'btn btn-answer', function () {
      Rem.completeAssist(s.run);
      if (s.run.phase === 'prove') showProve(s, Date.now());
      else endTeaching(s, Date.now());
    }));
    stage.appendChild(card);
    announce('The answer is ' + answerTextOf(s.item));
  }

  function showProve(s, at) {
    var item = resolveItem(s, s.run.proveItem);
    renderQuestion(s, item, 'card-q card-prove', function (correct) {
      Rem.answerProve(s.run, correct);
      endTeaching(s, at);
    });
  }

  function endTeaching(s, at) {
    session.pit(s.seat, false);
    var farm = Rem.looksLikeFarming(s.run, at);
    var outcome = s.run.outcome === 'assisted' ? 'assisted' : 'remediated';
    record(s, outcome, { rung: s.run.highestRung, farm: farm });
    celebrate(false);
    complete(s, stepsFor(outcome, s.itemState, farm));
  }

  /* ── after every question ───────────────────────────────────────────── */

  function record(s, outcome, extra) {
    Log.append('ans', s.user.id, ansPayload({
      item: s.item.id, skill: s.item.skill, diff: s.item.difficulty,
      outcome: outcome, assisted: outcome === 'assisted',
      rung: extra && extra.rung, mod: s.item.mod,
      session: 's' + seed, farm: !!(extra && extra.farm)
    }));
  }

  function complete(s, steps) {
    s.answered += 1;
    session.step(s.seat, steps);
    turnIndex += 1;
    setTimeout(nextTurn, solo ? 420 : 700);
  }

  function celebrate(big) {
    if (settings.reducedMotion) return;
    var badge = el('div', 'burst' + (big ? ' is-big' : ''));
    badge.innerHTML = badgeSvg(big ? 'recovery' : 'mastery');
    stage.appendChild(badge);
    if (big) announce('You turned a mistake into a know!');
    setTimeout(function () { if (badge.parentNode) badge.parentNode.removeChild(badge); }, big ? 1500 : 700);
  }

  /**
   * A checkpoint is the only moment everyone looks up at once. It shows where
   * the group actually is and hands out cheers, then gets out of the way —
   * a breath, not a cutscene.
   */
  function checkpointMoment(leg) {
    if (solo) return nextTurn();
    clear(stage);
    var card = el('div', 'card card-checkpoint');
    if (!settings.reducedMotion) {
      var burst = el('div', 'checkpoint-burst');
      burst.innerHTML = burstSvg('#8ce36b');
      card.appendChild(burst);
    }
    card.appendChild(el('h2', 'checkpoint-head', 'Checkpoint ' + leg));

    // What the group has actually done, in the unit that matters. Not a
    // ranking: in a team game a child must never read themselves as the
    // reason their side is behind.
    var turned = 0, answers = 0;
    seats.forEach(function (s2) { turned += s2.recovered.length; answers += s2.answered; });
    card.appendChild(el('p', 'checkpoint-line',
      answers + ' answered' + (turned ? ' · ' + turned + ' turned around' : '')));

    var row = el('div', 'checkpoint-players');
    seats.forEach(function (s2) {
      var chip = el('div', 'cp-chip');
      var av = el('span', 'cp-avatar');
      av.innerHTML = racerSvg(s2.user.avatar || 'rocket');
      chip.appendChild(av);
      chip.appendChild(el('span', 'cp-name', s2.user.name));
      row.appendChild(chip);
    });
    card.appendChild(row);

    card.appendChild(button('Keep going', 'btn btn-big btn-go', function () { nextTurn(); }));
    stage.appendChild(card);
    announce('Checkpoint ' + leg + '. ' + answers + ' answered.');
  }

  function finish(early) {
    if (destroyed) return;
    destroyed = true;
    if (raf) cancelAnimationFrame(raf);
    if (renderer) renderer.destroy();
    stopAudio();
    seats.forEach(function (s) {
      Log.append('sess', s.user.id, sessPayload('end', { session: 's' + seed }));
    });
    var board = session.scoreboard();
    session.destroy();
    opts.onDone({
      mode: mode,
      early: early,
      seconds: Math.round((Date.now() - startedAt) / 1000),
      board: board,
      players: seats.map(function (s) {
        return {
          id: s.user.id, name: s.user.name, avatar: s.user.avatar,
          answered: s.answered, recovered: s.recovered,
          distance: track ? Math.round((track.positions[s.seat] || 0) * 10) / 10 : 0
        };
      })
    });
  }

  nextTurn();

  return {
    destroy: function () {
      destroyed = true;
      if (raf) cancelAnimationFrame(raf);
      if (renderer) renderer.destroy();
      seats.forEach(function (s) { if (s.handle && s.handle.destroy) s.handle.destroy(); });
      session.destroy();
      stopAudio();
    }
  };

  /* ── helpers ────────────────────────────────────────────────────────── */

  function exposeForTests(item, phase) {
    window.__quiz = window.__quiz || {};
    window.__quiz.current = {
      phase: phase, type: item.type,
      answer: answerTextOf(item), wordTiles: !!item.wordTiles
    };
  }

  function answerTextOf(item) {
    if (item.answer) return String(item.answer);
    var o = item.options || [];
    for (var i = 0; i < o.length; i++) if (o[i].correct) return String(o[i].v || o[i].alt || '');
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

  function reshuffled(item) {
    var copy = {};
    for (var k in item) copy[k] = item[k];
    copy.shuffle = true;
    return copy;
  }

  function decoyTiles(answer, wordTiles, units) {
    if (wordTiles) return ['not', 'the'];
    if (/^[0-9]+$/.test(answer)) {
      var out = [], n = Number(answer);
      var cands = [String((n + 1) % 10), String((n + 3) % 10), String((n + 7) % 10)];
      for (var i = 0; i < cands.length && out.length < 2; i++) {
        if (units.indexOf(cands[i]) === -1 && out.indexOf(cands[i]) === -1) out.push(cands[i]);
      }
      return out;
    }
    var letters = 'aeiourstnl'.split('');
    var picked = [];
    for (var j = 0; j < letters.length && picked.length < 2; j++) {
      if (units.indexOf(letters[j]) === -1) picked.push(letters[j]);
    }
    return picked;
  }

  function buildGenerateItem(s, spec) {
    var copy = {};
    for (var k in spec) copy[k] = spec[k];
    copy.id = s.item.id + '#gen';
    copy.skill = s.item.skill;
    copy.difficulty = s.item.difficulty;
    copy.band = s.item.band;
    copy.mod = s.item.mod;
    copy.mediaBase = s.item.mediaBase;
    if (!copy.type) copy.type = 'assemble';
    if (copy.type === 'assemble' && !copy.tiles) {
      var ans = answerTextOf(s.item);
      copy.answer = ans;
      copy.wordTiles = copy.wordTiles || ans.indexOf(' ') !== -1;
      var units = copy.wordTiles ? ans.split(/\s+/) : ans.split('');
      copy.tiles = units.concat(decoyTiles(ans, copy.wordTiles, units));
      if (!copy.prompt) copy.prompt = { text: 'Build the answer', tts: true };
    }
    return copy;
  }
}
