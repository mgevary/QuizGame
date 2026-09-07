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

import { el, clear, button, slider } from '../ui/dom.js';
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
import * as Boost from '../learn/boosts.js';
import * as Sfx from '../ui/sfx.js';
import * as Music from '../ui/music.js';
import { burst as confetti } from '../ui/confetti.js';
import { regionInfo } from '../mission/regions.js';
import { landmarksReached, regionOf, distanceFor } from '../mission/model.js';

/**
 * @param {object} opts
 *   mode      one of MP_MODES, or 'solo'
 *   players   the players THIS DEVICE asks questions of
 *   session   a transport (local, p2p, room). Omitted means pass-and-play.
 *   networked true when other seats belong to other devices
 */
export function mountMatch(host, opts) {
  var mode = opts.mode || 'solo';
  var cfg = MP_MODES[mode] || { label: 'Practice', teams: false, buzz: false, icon: 'solo' };
  var players = opts.players;            // [{id, name, band, avatar, settings, bundle}]
  var networked = !!opts.networked;
  // "Solo" means one player on one screen with nobody else in the game at
  // all. A single player on a networked device is not solo: there are other
  // racers, they are just somewhere else.
  var solo = players.length === 1 && !networked;
  var seed = freshSeed();
  var destroyed = false;

  /* ── per-player state ───────────────────────────────────────────────── */
  // On a networked device this player owns exactly one seat — the one the
  // transport assigned — and every other racer on the track belongs to
  // somebody else.
  var baseSeat = networked && opts.session && opts.session.mySeat !== null &&
                 opts.session.mySeat !== undefined ? opts.session.mySeat : 0;

  var seats = players.map(function (p, i) {
    var band = p.band;
    var info = BAND_INFO[band] || BAND_INFO.K;
    Log.append('sess', p.id, sessPayload('start', { session: 's' + seed, mode: mode, seats: players.length }));
    var me = Log.state().users[p.id] || { session: 1 };
    var q = Session.createQueue({ session: me.session, seed: seed + i, band: band });
    Session.updateSuspensions(q, (Log.state().users[p.id] || {}).skills || {}, (Log.state().users[p.id] || {}).items || {});
    return {
      seat: networked ? baseSeat : i, user: p, band: band, info: info, queue: q,
      rng: makeRng(seed + i * 977),
      answered: 0, recovered: [], target: p.settings.sessionItems || info.items[0],
      run: null, item: null, itemState: null, handle: null, resolved: false,
      meter: Boost.emptyMeter(), pendingPick: false
    };
  });

  var session = opts.session || createLocalSession(players.map(function (p) {
    return { name: p.name, racer: p.avatar, band: p.band, userId: p.id };
  }));

  var track = null;
  var lastSeat = -1;
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
  // A volume control reachable without leaving the game. "Where do I turn
  // the music down" must never be answered with "quit and go to settings".
  var soundBtn = button('', 'icon-btn', function () { toggleSoundSheet(); });
  soundBtn.appendChild(icon('sound', 20));
  soundBtn.setAttribute('aria-label', 'Sound and music');
  top.appendChild(soundBtn);
  root.appendChild(top);

  /**
   * Mounting a new card is a SCREEN RESET. On a phone the player scrolled
   * down to tap the bottom option; if the next question simply replaces the
   * DOM, the page stays scrolled, the top of the question is off screen, and
   * the option now sitting under their finger inherits the touch-hover
   * highlight — which reads as "my last answer is still selected".
   */
  function clearStage() {
    clear(stage);
    try { window.scrollTo(0, 0); } catch (e) {}
    root.scrollTop = 0;
  }

  /** Mark the card on screen as leaving, so the swap reads as a transition. */
  function leaveCard() {
    var old = stage.querySelector('.card');
    if (old && !settings.reducedMotion) old.className += ' is-leaving';
  }

  var soundSheet = null;
  function toggleSoundSheet() {
    if (soundSheet) { soundSheet.parentNode.removeChild(soundSheet); soundSheet = null; return; }
    soundSheet = el('div', 'sound-sheet');
    var p = Music.getPrefs();
    var vol = slider({
      label: 'Music volume', min: 0, max: Math.round(Music.MAX_VOLUME * 100), step: 1,
      value: Math.round(p.musicVolume * 100),
      format: function (v) { return v === 0 ? 'off' : v + '%'; },
      onInput: function (v) { Music.setMusicVolume(v / 100); if (v > 0 && !Music.getPrefs().musicOn) Music.setMusicOn(true); }
    });
    soundSheet.appendChild(el('div', 'sound-sheet-label', 'Music'));
    soundSheet.appendChild(vol);
    var mute = button(p.musicOn ? 'Turn music off' : 'Turn music on', 'btn btn-quiet', function () {
      var on = Music.setMusicOn(!Music.getPrefs().musicOn);
      mute.textContent = on ? 'Turn music off' : 'Turn music on';
      if (on) Music.play(Music.trackForSeed(seed));
    });
    soundSheet.appendChild(mute);
    var fx = button(p.soundOn ? 'Sound effects: on' : 'Sound effects: off', 'btn btn-quiet', function () {
      var on = Music.setSoundOn(!Music.getPrefs().soundOn);
      fx.textContent = on ? 'Sound effects: on' : 'Sound effects: off';
    });
    soundSheet.appendChild(fx);
    soundSheet.appendChild(button('Close', 'btn btn-quiet', function () { toggleSoundSheet(); }));
    // A popover under the top bar, not a block pushed into the layout: on a
    // phone the inline version shoved the question below the fold.
    root.appendChild(soundSheet);
  }

  var trackWrap = el('div', 'play-track');
  var canvas = el('canvas', 'track-canvas');
  trackWrap.appendChild(canvas);
  root.appendChild(trackWrap);

  var teamBar = el('div', 'team-bar');
  root.appendChild(teamBar);

  var meterWrap = el('div', 'meter-wrap');
  root.appendChild(meterWrap);

  var stage = el('div', 'play-stage');
  root.appendChild(stage);

  var live = el('div', 'sr-live');
  live.setAttribute('aria-live', 'polite');
  live.setAttribute('role', 'status');
  root.appendChild(live);

  host.appendChild(root);

  // The sky takes the colour of the region the family has reached, so the
  // twentieth game does not look like the first.
  var hue = '#6E8BFF';
  try {
    var st0 = Log.state();
    var mid = Object.keys(st0.missions)[0];
    if (mid) {
      var m0 = st0.missions[mid];
      var crew = (m0.crew && m0.crew.length) ? m0.crew : Object.keys(st0.users);
      var dist = distanceFor({ crew: crew }, st0.users);
      hue = regionInfo(regionOf(landmarksReached(dist))).hue;
    }
  } catch (e) { /* the default hue is fine */ }
  var renderer = settings.reducedMotion ? null : createRenderer(canvas, { theme: cfg.theme || 'race', seed: seed, hue: hue });
  if (settings.reducedMotion) trackWrap.style.display = 'none';

  var rosterByseat = {};
  function refreshRoster() {
    rosterByseat = {};
    (session.roster() || []).forEach(function (r) { rosterByseat[r.seat] = r; });
  }
  refreshRoster();
  session.on('roster', function () { refreshRoster(); drawTeams(); });

  var TEAM_TINT = { A: '#5AA9F0', B: '#F0885A' };
  var turnSeat = null;          // whose turn it is, for the name under the racer

  /**
   * What the track draws.
   *
   * A race is a race: one racer per player, so two children on one screen see
   * two rockets and can watch each other. A team mode is not — the team moves
   * as one thing, so it gets ONE racer, and the name and avatar under it swap
   * to whoever is answering. Two lanes there would put the youngest visibly
   * last in a game whose whole point is that they are not.
   */
  function entities() {
    if (!track) return [];
    if (!track.teams) {
      var keys = Object.keys(track.positions);
      return keys.map(function (k) {
        var seat = Number(k);
        var who = rosterByseat[seat] || { name: 'Player', racer: 'rocket' };
        return {
          key: 'p' + seat,
          position: track.positions[seat] || 0,
          label: who.name + (turnSeat === seat ? ' \u2022' : ''),
          racer: who.racer,
          pit: !!track.pits[seat]
        };
      });
    }
    var names = Object.keys(track.teams);
    return names.map(function (t) {
      var members = track.teams[t] || [];
      var shownSeat = members.indexOf(turnSeat) !== -1 ? turnSeat : members[0];
      var shown = rosterByseat[shownSeat] || null;
      var sum = 0, pit = false;
      for (var i = 0; i < members.length; i++) {
        sum += track.positions[members[i]] || 0;
        if (track.pits[members[i]]) pit = true;
      }
      // The MEAN, not the sum: the finish line is one track length, so a team
      // drawn at its combined distance would run off the end.
      var mean = members.length ? sum / members.length : 0;
      var label = shown ? shown.name : 'Team ' + t;
      if (names.length > 1) label = label + ' · ' + t;
      return {
        key: 'team' + t,
        position: mean,
        label: label,
        racer: shown ? shown.racer : 'rocket',
        pit: pit,
        tint: names.length > 1 ? TEAM_TINT[t] : null
      };
    });
  }

  function seatOf(seatNumber) {
    for (var i = 0; i < seats.length; i++) if (seats[i].seat === seatNumber) return seats[i];
    return null;
  }

  var raf = null, lastFrame = 0;
  function frame(now) {
    if (destroyed) return;
    raf = requestAnimationFrame(frame);
    var dt = Math.min(0.05, (now - lastFrame) / 1000);
    lastFrame = now;
    if (renderer && track) {
      renderer.draw({ length: track.length, checkpoints: track.checkpoints, leg: track.leg }, entities(), dt);
    }
  }

  /* ── wire the coordinator ───────────────────────────────────────────── */
  /**
   * One place where the track changes, so a test hook and the renderer can
   * never disagree about what the game currently looks like.
   */
  // Every change to the track is kept, so the finish can replay the real
  // race: where everyone was, when, and which pit stops happened. Capped so a
  // long session cannot grow it without bound.
  var history = [];
  function setTrack(next) {
    if (!next) return;
    track = next;
    var pos = {};
    for (var k in next.positions) pos[k] = next.positions[k];
    history.push({ at: Date.now() - startedAt, positions: pos, pits: Object.keys(next.pits || {}) });
    if (history.length > 800) history.splice(0, history.length - 800);
    window.__quiz = window.__quiz || {};
    window.__quiz.track = track;
    drawTeams();
  }

  session.on('start', function (m) { refreshRoster(); setTrack(m.track); });
  session.on('state', function (m) { setTrack(m.track); });
  session.on('pit', function () { setTrack(session.snapshot()); });
  session.on('checkpoint', function (m) {
    setTrack(m.track);
    pendingCheckpoint = m.leg;
  });

  session.on('cheer', function (m) { showCheer(m); });
  session.on('results', function (m) { setTrack(m.track); finish(false); });
  session.on('finished', function (m) { setTrack(m.track); });

  if (opts.startMatch !== false) session.start(mode === 'solo' ? 'together' : mode, { seed: seed, length: opts.length });
  setTrack(session.snapshot());
  if (renderer) raf = requestAnimationFrame(frame);
  drawTeams();
  Music.play(Music.trackForSeed(seed));

  /**
   * Three seconds before anything else. It costs almost nothing and it is the
   * single largest "this is a game, not a worksheet" upgrade available: the
   * room goes quiet and everybody looks at the screen at the same moment.
   */
  function countdown(then) {
    if (settings.reducedMotion || !renderer) return then();
    clearStage();
    var card = el('div', 'card card-countdown');
    var num = el('div', 'countdown-num', 'Ready');
    card.appendChild(num);
    card.appendChild(el('p', 'countdown-sub', cfg.blurb || ''));
    stage.appendChild(card);
    var n = 3;
    renderer.setCountdown(3);
    announce('Starting in 3');
    Sfx.play('tick'); Sfx.buzz(Sfx.HAPTIC.tick);
    var iv = setInterval(function () {
      if (destroyed) { clearInterval(iv); return; }
      n -= 1;
      if (n > 0) {
        renderer.setCountdown(n);
        Sfx.play(n === 1 ? 'tickHigh' : 'tick');
        Sfx.buzz(Sfx.HAPTIC.tick);
        return;
      }
      clearInterval(iv);
      renderer.setCountdown('Go');
      num.textContent = 'Go!';
      num.className = 'countdown-num is-go';
      Sfx.play('go');
      Sfx.buzz([16, 30, 40]);
      announce('Go');
      setTimeout(function () { renderer.setCountdown(null); then(); }, 620);
    }, 780);
  }

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
    Sfx.play('cheer');
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

  /**
   * The boost meter. It fills from ANSWERING, not from being right, and a
   * turned-around mistake fills it faster than a correct answer — so the child
   * having a hard night earns boosts sooner than the one breezing through.
   */
  function drawMeter(s) {
    clear(meterWrap);
    if (!s) return;
    var row = el('div', 'meter-row');
    var prog = Boost.meterProgress(s.meter);
    var bar = el('div', 'meter-bar' + (prog >= 0.6 ? ' is-near' : ''));
    var fill = el('div', 'meter-fill');
    fill.style.width = Math.round(prog * 100) + '%';
    bar.appendChild(fill);
    row.appendChild(bar);
    var cap = el('span', 'meter-cap');
    cap.appendChild(icon('spark', 15));
    cap.setAttribute('aria-label', prog >= 0.6 ? 'Boost nearly ready' : 'Boost meter');
    row.appendChild(cap);

    // What is armed right now, so a doubled answer is never a surprise.
    if (s.meter.run) {
      var b = Boost.BOOSTS[s.meter.run.id];
      var live = el('span', 'meter-live');
      live.appendChild(icon(b.icon, 14));
      live.appendChild(el('span', null, b.label + ' \u00d7' + s.meter.run.left));
      live.title = b.what;
      row.appendChild(live);
    }
    if (Boost.narrowPending(s.meter)) {
      var nb = Boost.BOOSTS.hint;
      var narrow = el('span', 'meter-live');
      narrow.appendChild(icon(nb.icon, 14));
      narrow.appendChild(el('span', null, nb.label));
      narrow.title = nb.what;
      row.appendChild(narrow);
    }
    meterWrap.appendChild(row);
  }

  /* ── boosts ─────────────────────────────────────────────────────────── */

  /**
   * A boost takes effect the moment it is earned. Instant and team boosts
   * move the track while the card is still up, so the child sees the jump
   * happen; run and question boosts arm, and the meter says so until they are
   * used. Nothing here touches the question, the log or the schedule.
   */
  function applyBoost(s, id) {
    var b = Boost.BOOSTS[id];
    if (!b) return;
    Boost.arm(s.meter, id);
    Sfx.play('boost');
    Sfx.buzz(Sfx.HAPTIC.boost);
    if (b.kind === 'instant') {
      session.step(s.seat, b.distance);
      floatFor(s.seat, '+' + b.distance);
    } else if (b.kind === 'team') {
      var members = teamMatesOf(s.seat);
      for (var i = 0; i < members.length; i++) {
        session.step(members[i], b.distance);
        floatFor(members[i], '+' + b.distance);
      }
    }
    drawMeter(s);
  }

  function floatFor(seat, text) {
    if (!renderer) return;
    var key = track && track.teams ? 'team' + (teamOfSeat(seat) || 'A') : 'p' + seat;
    renderer.float(key, text, '#7C8CFF');
  }

  function teamOfSeat(seat) {
    if (!track || !track.teams) return null;
    for (var t in track.teams) if (track.teams[t].indexOf(seat) !== -1) return t;
    return null;
  }

  function teamMatesOf(seat) {
    if (!track || !track.teams) return [seat];
    for (var t in track.teams) if (track.teams[t].indexOf(seat) !== -1) return track.teams[t];
    return [seat];
  }

  function flash(text) {
    if (settings.reducedMotion) { announce(text); return; }
    var f = el('div', 'boost-flash', text);
    stage.appendChild(f);
    announce(text);
    setTimeout(function () { if (f.parentNode) f.parentNode.removeChild(f); }, 1100);
  }

  /**
   * The earn moment. The game picks the boost and it happens at once; the
   * card's whole job is to say, in one big sentence, what just happened. No
   * menu: a choice of three was a decision a six-year-old could not make and
   * a ten-year-old agonised over, and neither is what a reward should feel
   * like. This is also the pacing beat — something happens every five
   * questions instead of twenty-five questions in a row.
   */
  function showBoostEarned(s) {
    clearStage();
    var id = Boost.pickBoost(Boost.offerFor(!!(track && track.teams)), s.rng, s.meter);
    var b = Boost.BOOSTS[id] || Boost.BOOSTS.leap;
    applyBoost(s, b.id);

    var card = el('div', 'card card-boost');
    card.appendChild(el('div', 'teach-kind', s.user.name + ' earned a boost'));
    var badge = el('div', 'boost-badge');
    badge.appendChild(icon(b.icon, 44, 'boost-icon'));
    card.appendChild(badge);
    card.appendChild(el('h2', 'boost-head', b.label + '!'));
    card.appendChild(el('p', 'boost-what', b.what));
    card.appendChild(el('p', 'boost-explain', b.explain));
    card.appendChild(button('Let’s go', 'btn btn-big btn-go', function () {
      s.pendingPick = false;
      nextTurn();
    }));
    stage.appendChild(card);
    exposeForTests({ type: 'boost', id: b.id }, 'card-boost');
    if (!settings.reducedMotion) confetti(stage, { count: 50, power: 1, y: 0.25 });
    announce(b.label + '. ' + b.what + ' ' + b.explain);
    // A pre-reader cannot read what the boost did, and a boost nobody
    // understands is just a delay — so at those bands it is spoken.
    sayTeaching({ tts: b.label + '. ' + b.what + ' ' + b.explain }, s);
  }

  /* ── turn flow ──────────────────────────────────────────────────────── */

  /**
   * Whose turn it is, derived from what has actually happened rather than
   * from a counter. A counter can be advanced twice by a stray timer or a
   * double-fired callback, and in a two-player game that silently hands one
   * child two turns in a row — which is exactly the unfairness a sibling
   * notices first. Fewest answers goes next; ties break round-robin from
   * whoever went last.
   */
  function currentSeat() {
    var best = null;
    for (var n = 0; n < seats.length; n++) {
      var s = seats[(lastSeat + 1 + n) % seats.length];
      if (s.answered >= s.target) continue;
      if (best === null || s.answered < best.answered) best = s;
    }
    return best;
  }

  function seatAwaitingPick() {
    for (var i = 0; i < seats.length; i++) if (seats[i].pendingPick) return seats[i];
    return null;
  }

  function everyoneDone() {
    for (var i = 0; i < seats.length; i++) if (seats[i].answered < seats[i].target) return false;
    return true;
  }

  function nextTurn() {
    stopAudio();
    if (destroyed) return;
    var picker = seatAwaitingPick();
    if (picker) return showBoostEarned(picker);
    if (pendingCheckpoint !== null) {
      var leg = pendingCheckpoint;
      pendingCheckpoint = null;
      return checkpointMoment(leg);
    }
    if (everyoneDone()) return finish(false);
    var s = currentSeat();
    if (!s) return finish(false);
    turnSeat = s.seat;
    counter.textContent = (s.answered + 1) + ' of ' + s.target;
    // A handover card only makes sense when the next player is standing next
    // to you. On a networked device there is nobody to pass to.
    if (solo || networked) return askFor(s);
    handover(s);
  }

  /**
   * The pass-and-play handover. Big, unmissable, and it names the next player
   * out loud — the youngest player often cannot read whose turn it is.
   */
  function handover(s) {
    clearStage();
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
    var prev = lastSeat >= 0 ? seats[lastSeat] : null;
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
    if (!got) {
      // Nothing fresh, nothing due, no template: they have done everything
      // their modules have for them today. That is a good thing, and the
      // results card says so instead of the session just stopping.
      s.exhausted = true;
      s.answered = s.target;
      return nextTurn();
    }
    s.item = resolveItem(s, got.item);
    // A Narrow-it waits here for a question with enough options to take it.
    s.item = Boost.applyNarrow(s.meter, s.item, s.rng);
    s.pickReason = got.reason;
    s.itemState = u.items[got.item.id] || emptyItemState();
    s.run = null;
    s.resolved = false;
    drawMeter(s);
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
    clearStage();
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
      reducedMotion: !!settings.reducedMotion,
      maxWords: s.info.maxWords, pictureSize: s.info.touchPx,
      speak: function (p) { speakPrompt(p, { base: s.item ? s.item.mediaBase : null, enabled: true }); },
      onAnswer: onAnswer || function (correct, detail) { judge(s, correct, detail); }
    });
    if (item.prompt) sayQuestion(item.prompt, s);
    announce((item.prompt && item.prompt.text) || 'New question');
    if (cardClass === 'card-q') {
      // The last five answers, as dots: right, turned around, or not yet.
      var streak = el('div', 'streak');
      var hist = s.streak || [];
      for (var d = 0; d < 5; d++) {
        var v = hist[hist.length - 5 + d];
        streak.appendChild(el('span', 'streak-dot' + (v ? ' is-' + v : '')));
      }
      streak.setAttribute('aria-label', 'Last five answers');
      var topline = el('div', 'q-topline');
      topline.appendChild(streak);
      // When a question comes BACK, say why. An unexplained repeat reads as
      // a bug; "checking this stuck" reads as the point.
      var reason = s.pickReason || '';
      if (/review|due|hard-due/.test(reason)) {
        var tag = el('span', 'q-tag', s.itemState.l > 0 ? 'Back for another go' : 'Checking this stuck');
        topline.appendChild(tag);
      }
      if (item.narrowed) topline.appendChild(el('span', 'q-tag is-boost', 'One wrong answer gone'));
      card.insertBefore(topline, card.firstChild);
      // A child who cannot read the question cannot read "this question looks
      // wrong" either; for them it is noise. The report screen still lists
      // every item, so a parent can flag one there.
      if (s.info.maxWords > 6) {
        var flag = button('Report this question', 'link-btn flag-btn', function () { flagBroken(s, item); });
        card.appendChild(flag);
      }
    }
  }

  function flagBroken(s, item) {
    var parts = item.id.split('/');
    Log.append('mod', s.user.id, { op: 'flag', moduleId: parts[0], item: parts.slice(1).join('/') });
    announce('Thanks. We will not ask that one again.');
    resolve(s, 'wrong', { steps: 0 });
  }

  function judge(s, correct, detail) {
    if (correct) {
      var outcome = s.itemState.n === 0 ? 'first' : 'review';
      var recovery = outcome === 'review' && s.itemState.l > 0 && !s.itemState.rec;
      if (recovery && s.item.prompt) s.recovered.push(s.item.prompt.text);
      celebrate(recovery);
      // Say WHAT was turned around, not just that something was. "You got
      // this wrong before. Not any more." is true, and specific praise is the
      // only kind the feedback research supports.
      if (recovery) flash('Turned around!');
      return resolve(s, outcome, { steps: stepsFor(outcome, s.itemState), recovery: recovery });
    }
    if (!Session.mayRemediate(s.queue)) {
      return resolve(s, 'wrong', { steps: 0 });
    }
    Session.noteRemediation(s.queue);
    Sfx.play('pit');
    Sfx.buzz(Sfx.HAPTIC.pit);
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
    // Dim the track for a beat so the teach card arrives from somewhere,
    // rather than the question simply being replaced.
    if (!settings.reducedMotion) {
      trackWrap.className = 'play-track is-pit';
      setTimeout(function () { if (!destroyed) showFeedback(s, detail); }, 520);
    } else showFeedback(s, detail);
  }

  function showFeedback(s, detail) {
    clearStage();
    var card = el('div', 'card card-teach');
    var head = el('div', 'teach-top');
    var face = el('span', 'teach-face');
    face.innerHTML = racerSvg(s.user.avatar || 'rocket', { mood: 'thinking' });
    head.appendChild(face);
    head.appendChild(icon('repair', 28, 'teach-badge'));
    card.appendChild(head);
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
    clearStage();
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
    clearStage();
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
    trackWrap.className = 'play-track';
    var farm = Rem.looksLikeFarming(s.run, at);
    var outcome = s.run.outcome === 'assisted' ? 'assisted' : 'remediated';
    celebrate(false);
    resolve(s, outcome, { rung: s.run.highestRung, farm: farm, steps: stepsFor(outcome, s.itemState, farm) });
  }

  /* ── after every question ───────────────────────────────────────────── */

  /**
   * A question resolves exactly once: the fact is written to the log, the
   * distance is applied, and the turn passes — together, or not at all.
   *
   * Keeping these three in one place matters more than it looks. When they
   * were separate, a callback that fired twice could write two answers to a
   * child's learning history while the track moved once, so the schedule and
   * the game quietly disagreed about what had happened.
   */
  function resolve(s, outcome, opts2) {
    if (s.resolved) return;
    s.resolved = true;
    opts2 = opts2 || {};
    Log.append('ans', s.user.id, ansPayload({
      item: s.item.id, skill: s.item.skill, diff: s.item.difficulty,
      outcome: outcome, assisted: outcome === 'assisted',
      rung: opts2.rung === undefined ? -1 : opts2.rung, mod: s.item.mod,
      session: 's' + seed, farm: !!opts2.farm
    }));
    s.answered += 1;
    lastSeat = s.seat;
    s.streak = (s.streak || []).concat([outcome === 'wrong' || outcome === 'assisted' ? 'wrong' : (opts2.recovery ? 'turned' : 'right')]).slice(-5);

    // A boost multiplies TRACK distance only. The event written above is
    // untouched, so the ability estimate and tomorrow's schedule cannot be
    // bought with a boost.
    var mult = Boost.multiplierFor(s.meter);
    var gained = (opts2.steps || 0) * mult;
    session.step(s.seat, gained);
    Boost.tickRun(s.meter);
    if (renderer && gained > 0) {
      var key = track && track.teams ? 'team' + (teamOfSeat(s.seat) || 'A') : 'p' + s.seat;
      renderer.float(key, '+' + (Math.round(gained * 10) / 10) + (mult > 1 ? ' \u00d7' + mult : ''), opts2.recovery ? '#FFB547' : '#4FE3A8');
    }
    if (mult > 1 && opts2.steps) flash('Double!');

    if (Boost.addResolved(s.meter, outcome, !!opts2.recovery)) s.pendingPick = true;
    drawMeter(s);

    // The answered card slides away during this pause, so the next one does
    // not simply appear on top of it.
    setTimeout(leaveCard, solo ? 180 : 380);
    setTimeout(nextTurn, solo ? 520 : 800);
  }

  function celebrate(big) {
    Sfx.play(big ? 'recovery' : 'correct');
    Sfx.buzz(big ? Sfx.HAPTIC.recovery : Sfx.HAPTIC.correct);
    if (settings.reducedMotion) return;
    // A right answer gets a small burst; turning a mistake around gets the
    // whole thing. A celebration that is the same every time is not one.
    confetti(stage, big ? { count: 90, power: 1.25 } : { count: 34, power: 0.8, y: 0.35 });
    var badge = el('div', 'burst' + (big ? ' is-big' : ''));
    // The racer is delighted, and it is the racer the child chose.
    var who = currentSeat() || seats[0];
    badge.innerHTML = big
      ? badgeSvg('recovery')
      : racerSvg(who ? who.user.avatar : 'rocket', { mood: 'delighted' });
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
    if (networked && seats.length === 1) {
      // Everyone regroups on their own screen; do not make one device wait on
      // a tap that the others cannot see.
      flash('Checkpoint ' + leg);
      return nextTurn();
    }
    clearStage();
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
    Sfx.play('checkpoint');
    Sfx.buzz(Sfx.HAPTIC.checkpoint);
    if (!settings.reducedMotion) confetti(stage, { count: 70, power: 1.1 });
    announce('Checkpoint ' + leg + '. ' + answers + ' answered.');
  }

  function finish(early) {
    if (destroyed) return;
    destroyed = true;
    Music.fadeOut(900);
    if (!early) Sfx.play('finish');
    if (raf) cancelAnimationFrame(raf);
    if (renderer) renderer.destroy();
    stopAudio();
    seats.forEach(function (s) {
      Log.append('sess', s.user.id, sessPayload('end', { session: 's' + seed }));
      if (networked) session.finishSeat(s.seat);
    });
    var board = session.scoreboard();
    if (!opts.keepSession) session.destroy();
    opts.onDone({
      mode: mode,
      early: early,
      seconds: Math.round((Date.now() - startedAt) / 1000),
      board: board,
      replay: {
        history: history,
        roster: rosterByseat,
        length: track ? track.length : 30,
        checkpoints: track ? track.checkpoints : [],
        teams: track ? track.teams : null,
        theme: cfg.theme || 'race',
        seed: seed
      },
      players: seats.map(function (s) {
        return {
          id: s.user.id, name: s.user.name, avatar: s.user.avatar,
          answered: s.answered, recovered: s.recovered, exhausted: !!s.exhausted,
          distance: track ? Math.round((track.positions[s.seat] || 0) * 10) / 10 : 0
        };
      })
    });
  }

  countdown(nextTurn);

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
