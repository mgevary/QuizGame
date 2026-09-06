/**
 * coordinator.js — the authoritative half of a match, with no network and no
 * DOM in it. Every transport drives this exact module — one device passing a
 * tablet round, a room server on a laptop, phones over WebRTC — so the rules
 * cannot drift apart between them.
 *
 * What it owns:
 *   • the match: seed, mode, teams, track length
 *   • distance: a step reported by a device is applied here, never there
 *   • checkpoints: the pack regroups, so nobody is lapped and nobody waits
 *     more than one leg
 *   • buzz rounds: one shared question, first correct answer takes it
 *   • the finish order and the final scoreboard
 *
 * What it deliberately does NOT own: which question a player is asked. That
 * comes from their own private scheduler, at their own ability. Only the
 * OUTCOME crosses the wire, which is both what makes mixed-age play fair and
 * a nice privacy property — a child's questions never leave their device.
 */

import * as Track from '../track/model.js';

export var MP_MODES = {
  together: {
    label: 'Together',
    blurb: 'One team, one finish line. Nobody loses.',
    teams: 'one', buzz: false,
    // The right default for a family with a two-year-old in it. Co-op first
    // is also the right way to meet unfamiliar content: nobody should be
    // learning something new while visibly losing a race.
    icon: '🤝'
  },
  teams: {
    label: 'Team tug',
    blurb: 'Two teams, one rope. Every answer pulls it your way.',
    teams: 'split', buzz: true, theme: 'tug',
    icon: '🪢'
  },
  race: {
    label: 'Race',
    blurb: 'Everyone for themselves. First past the flag.',
    teams: false, buzz: true,
    icon: '🏁'
  },
  relay: {
    label: 'Relay',
    blurb: 'Take turns for your team. Pass the baton.',
    teams: 'split', buzz: false, relay: true,
    icon: '🏃'
  }
};

export var BUZZ_WINDOW_MS = 15000;
export var BUZZ_BONUS = 2.0;          // in track steps
export var CHEERS = ['👏', '🎉', '💪', '⭐'];

/**
 * @param {object} io {broadcast(msg, exceptSeat), sendTo(seat, msg), now(), seats()}
 */
export function createCoordinator(io) {
  var state = {
    match: null,
    track: null,
    roster: {},          // seat -> {name, racer, band, team, userId}
    buzz: null,          // {itemRef, seed, startedAt, answers:{seat:{correct,at}}}
    buzzCount: 0,
    finished: false
  };

  function addPlayer(seat, info) {
    state.roster[seat] = {
      seat: seat,
      name: info.name || 'Player',
      racer: info.racer || 'rocket',
      band: info.band || 'K',
      userId: info.userId || null,
      team: null,
      ready: false
    };
    if (state.track) Track.addSeat(state.track, seat);
    io.broadcast({ t: 'roster', roster: rosterList() });
  }

  function removePlayer(seat) {
    delete state.roster[seat];
    io.broadcast({ t: 'roster', roster: rosterList() });
  }

  function rosterList() {
    var out = [];
    for (var s in state.roster) out.push(state.roster[s]);
    out.sort(function (a, b) { return a.seat - b.seat; });
    return out;
  }

  function setReady(seat, ready) {
    if (state.roster[seat]) state.roster[seat].ready = !!ready;
    io.broadcast({ t: 'roster', roster: rosterList() });
  }

  /**
   * Teams are balanced by BAND, not by ability score. Splitting on ability
   * would need every device to publish how good its child is, which is both a
   * privacy problem and the sort of number that starts arguments at a kitchen
   * table. Alternating by age spreads the youngest across teams, which is what
   * actually keeps a tug of war close.
   */
  function assignTeams(mode) {
    var cfg = MP_MODES[mode] || MP_MODES.together;
    var seats = rosterList();
    if (!cfg.teams) { for (var i = 0; i < seats.length; i++) state.roster[seats[i].seat].team = null; return null; }
    if (cfg.teams === 'one') {
      var all = {};
      all.A = seats.map(function (p) { return p.seat; });
      for (var j = 0; j < seats.length; j++) state.roster[seats[j].seat].team = 'A';
      return all;
    }
    var byBand = seats.slice().sort(function (a, b) { return String(a.band).localeCompare(String(b.band)); });
    var teams = { A: [], B: [] };
    for (var k = 0; k < byBand.length; k++) {
      var t = k % 2 === 0 ? 'A' : 'B';
      teams[t].push(byBand[k].seat);
      state.roster[byBand[k].seat].team = t;
    }
    return teams;
  }

  function startMatch(mode, opts) {
    opts = opts || {};
    var cfg = MP_MODES[mode] || MP_MODES.together;
    var seats = rosterList();
    var teams = assignTeams(mode);
    // Shorter tracks for more players: the finish should land in ten to
    // fifteen minutes whether two are playing or five.
    var length = opts.length || Math.max(14, Math.round(30 / Math.max(1, seats.length * 0.55)));
    state.track = Track.createTrack({ length: length, teams: teams, theme: cfg.theme || 'race' });
    for (var i = 0; i < seats.length; i++) Track.addSeat(state.track, seats[i].seat);
    state.match = {
      seed: opts.seed || (Math.floor(Math.random() * 2147483000) + 1),
      mode: mode,
      teams: teams,
      relay: !!cfg.relay,
      buzz: cfg.buzz && opts.buzz !== false,
      theme: cfg.theme || 'race',
      length: length,
      startedAt: io.now()
    };
    state.finished = false;
    state.buzz = null;
    state.buzzCount = 0;
    io.broadcast({ t: 'start', match: state.match, roster: rosterList(), track: snapshot() });
    return state.match;
  }

  /** A device reports the outcome of one question. Distance is applied here. */
  function onStep(seat, msg) {
    if (!state.track || state.finished) return;
    var delta = Math.max(0, Math.min(3, Number(msg.d) || 0));
    Track.step(state.track, seat, delta);
    var legAdvanced = Track.noteAnswered(state.track, seat);
    io.broadcast({ t: 'state', track: snapshot(), by: seat, gained: delta });
    if (legAdvanced) onCheckpoint();
    if (state.track.positions[seat] >= state.track.length) onFinish(seat);
  }

  function onPit(seat, on) {
    if (!state.track) return;
    Track.setPit(state.track, seat, !!on);
    // Only that someone is fixing something, never what. Remediation is
    // private: a child being taught in front of an audience is a child who
    // stops answering.
    io.broadcast({ t: 'pit', seat: seat, on: !!on });
  }

  function onCheer(seat, to, emoji) {
    if (CHEERS.indexOf(emoji) === -1) return;
    io.broadcast({ t: 'cheer', from: seat, to: to, emoji: emoji });
  }

  /**
   * The pack has regrouped. Two things happen: a small invisible catch-up for
   * anyone trailing (capped, so the leader never notices), and — if the mode
   * has them — a buzz round, which is the one moment everybody answers the
   * same question at the same time.
   */
  function onCheckpoint() {
    var lead = Track.leader(state.track);
    var leadPos = lead === null ? 0 : state.track.positions[lead];
    var seats = io.seats();
    for (var i = 0; i < seats.length; i++) {
      if (seats[i] !== lead) Track.catchupAt(state.track, seats[i], leadPos);
    }
    io.broadcast({ t: 'checkpoint', leg: state.track.leg, track: snapshot() });
  }

  /**
   * Start a buzz round. The item is chosen by the caller from the intersection
   * of what every device has installed, and travels as an ID plus a seed —
   * never as content, because every device already holds the module.
   */
  function startBuzz(itemRef) {
    if (!state.match || !state.match.buzz || state.buzz || state.finished) return null;
    state.buzz = {
      itemRef: itemRef,
      seed: Math.floor(Math.random() * 2147483000) + 1,
      startedAt: io.now(),
      answers: {}
    };
    state.buzzCount += 1;
    io.broadcast({ t: 'buzz', itemRef: itemRef, seed: state.buzz.seed, endsAt: state.buzz.startedAt + BUZZ_WINDOW_MS });
    return state.buzz;
  }

  /** First correct answer takes it. Everyone else still gets to finish. */
  function onBuzzAnswer(seat, correct) {
    var b = state.buzz;
    if (!b) return;
    if (b.answers[seat]) return;
    b.answers[seat] = { correct: !!correct, at: io.now() };
    if (correct) return resolveBuzz(seat);
    var seats = io.seats();
    var all = true;
    for (var i = 0; i < seats.length; i++) if (!b.answers[seats[i]]) all = false;
    if (all) resolveBuzz(null);
  }

  function resolveBuzz(winner) {
    var b = state.buzz;
    if (!b) return;
    state.buzz = null;
    if (winner !== null && state.track) {
      Track.step(state.track, winner, BUZZ_BONUS);
      if (state.track.positions[winner] >= state.track.length) onFinish(winner);
    }
    io.broadcast({
      t: 'buzz-result', winner: winner,
      team: winner !== null && state.roster[winner] ? state.roster[winner].team : null,
      track: snapshot()
    });
  }

  /** Called on a timer so an unanswered buzz can never stall the race. */
  function tick() {
    var b = state.buzz;
    if (!b) return;
    if (io.now() - b.startedAt < BUZZ_WINDOW_MS) return;
    var best = null;
    for (var seat in b.answers) {
      if (!b.answers[seat].correct) continue;
      if (best === null || b.answers[seat].at < b.answers[best].at) best = Number(seat);
    }
    resolveBuzz(best);
  }

  function onFinish(seat) {
    if (!state.track || Track.isFinished(state.track, seat)) return;
    var place = Track.finish(state.track, seat);
    io.broadcast({ t: 'finished', seat: seat, place: place, track: snapshot() });

    // The leader crossing does NOT end the game. Everyone gets to cross, so
    // no child is left mid-track when the screen changes.
    var seats = io.seats();
    var cfg = MP_MODES[state.match.mode] || MP_MODES.together;
    var done;
    if (cfg.teams === 'split') {
      // A team is home when all of its members are.
      done = true;
      for (var t in state.match.teams) {
        var members = state.match.teams[t];
        var allIn = members.length > 0;
        for (var m = 0; m < members.length; m++) if (!Track.isFinished(state.track, members[m])) allIn = false;
        if (!allIn) done = false;
      }
    } else {
      done = state.track.finished.length >= seats.length;
    }
    if (done) endMatch();
  }

  function endMatch() {
    if (state.finished) return;
    state.finished = true;
    io.broadcast({ t: 'results', results: scoreboard(), track: snapshot() });
  }

  /**
   * The scoreboard. In a team mode the TEAM is the unit and individual
   * distances are not ranked against each other — the little one is never
   * shown as last.
   */
  function scoreboard() {
    var cfg = MP_MODES[state.match ? state.match.mode : 'together'] || MP_MODES.together;
    if (cfg.teams === 'split' && state.match.teams) {
      var rows = [];
      for (var t in state.match.teams) {
        rows.push({
          team: t,
          distance: Math.round(Track.teamDistance(state.track, t) * 10) / 10,
          members: state.match.teams[t].map(function (s) {
            return { seat: s, name: state.roster[s] ? state.roster[s].name : '?', distance: Math.round((state.track.positions[s] || 0) * 10) / 10 };
          })
        });
      }
      rows.sort(function (a, b) { return b.distance - a.distance; });
      return { kind: 'teams', rows: rows };
    }
    if (cfg.teams === 'one') {
      var total = 0;
      var who = [];
      for (var s2 in state.track.positions) {
        total += state.track.positions[s2];
        who.push({ seat: Number(s2), name: state.roster[s2] ? state.roster[s2].name : '?', distance: Math.round(state.track.positions[s2] * 10) / 10 });
      }
      return { kind: 'together', distance: Math.round(total * 10) / 10, length: state.track.length, members: who };
    }
    var list = state.track.finished.map(function (seat, i) {
      return { seat: seat, place: i + 1, name: state.roster[seat] ? state.roster[seat].name : '?', distance: Math.round((state.track.positions[seat] || 0) * 10) / 10 };
    });
    for (var s3 in state.track.positions) {
      if (state.track.finished.indexOf(Number(s3)) === -1) {
        list.push({ seat: Number(s3), place: null, name: state.roster[s3] ? state.roster[s3].name : '?', distance: Math.round(state.track.positions[s3] * 10) / 10 });
      }
    }
    return { kind: 'race', rows: list };
  }

  /** A plain snapshot of the track, small enough to send at a few hertz. */
  function snapshot() {
    var t = state.track;
    if (!t) return null;
    return {
      length: t.length, positions: t.positions, leg: t.leg,
      checkpoints: t.checkpoints, teams: t.teams, pits: t.pits,
      finished: t.finished, answered: t.answered, theme: t.theme
    };
  }

  return {
    state: state,
    addPlayer: addPlayer,
    removePlayer: removePlayer,
    setReady: setReady,
    rosterList: rosterList,
    startMatch: startMatch,
    onStep: onStep,
    onPit: onPit,
    onCheer: onCheer,
    startBuzz: startBuzz,
    onBuzzAnswer: onBuzzAnswer,
    onFinish: onFinish,
    endMatch: endMatch,
    scoreboard: scoreboard,
    snapshot: snapshot,
    tick: tick
  };
}
