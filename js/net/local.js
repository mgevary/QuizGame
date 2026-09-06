/**
 * local.js — the pass-and-play transport: every seat is on this one device.
 *
 * It exists for three reasons. It is the only mode that works for a
 * two-year-old who has no device of their own. It needs no network, no
 * server, no pairing and no second screen, so it works the very first time
 * anyone opens the app. And because it drives the same coordinator as every
 * other transport, it exercises the real match rules from the simplest
 * possible direction — which is why the rules cannot quietly rot.
 */

import { createCoordinator } from './coordinator.js';

export function createLocalSession(players) {
  var handlers = {};
  var seats = [];

  var io = {
    now: function () { return Date.now(); },
    seats: function () { return seats.slice(); },
    sendTo: function (seat, msg) { deliver(msg); },
    broadcast: function (msg) { deliver(msg); }
  };

  function deliver(msg) {
    var fn = handlers[msg.t];
    if (fn) fn(msg);
  }

  var co = createCoordinator(io);
  for (var i = 0; i < players.length; i++) {
    seats.push(i);
    co.addPlayer(i, players[i]);
  }

  var timer = setInterval(function () { co.tick(); }, 1000);

  return {
    kind: 'local',
    co: co,
    seats: seats,
    on: function (type, fn) { handlers[type] = fn; return this; },
    start: function (mode, opts) { return co.startMatch(mode, opts); },
    step: function (seat, delta, skillHash) { co.onStep(seat, { d: delta, skillHash: skillHash }); },
    pit: function (seat, on) { co.onPit(seat, on); },
    cheer: function (from, to, emoji) { co.onCheer(from, to, emoji); },
    startBuzz: function (itemRef) { return co.startBuzz(itemRef); },
    buzzAnswer: function (seat, correct) { co.onBuzzAnswer(seat, correct); },
    roster: function () { return co.rosterList(); },
    snapshot: function () { return co.snapshot(); },
    scoreboard: function () { return co.scoreboard(); },
    destroy: function () { clearInterval(timer); handlers = {}; }
  };
}
