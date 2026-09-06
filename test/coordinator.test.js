import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCoordinator, MP_MODES, BUZZ_WINDOW_MS, BUZZ_BONUS } from '../js/net/coordinator.js';

/** An in-memory bus: the coordinator cannot tell it from a real transport. */
function bus() {
  const sent = [];
  let clock = 1000;
  const seats = [];
  const io = {
    now: () => clock,
    seats: () => seats.slice(),
    sendTo: (seat, msg) => sent.push({ to: seat, msg }),
    broadcast: (msg, except) => sent.push({ to: '*', except, msg })
  };
  return {
    io, sent, seats,
    advance: (ms) => { clock += ms; },
    last: (t) => { for (let i = sent.length - 1; i >= 0; i--) if (sent[i].msg.t === t) return sent[i].msg; return null; },
    all: (t) => sent.filter(s => s.msg.t === t).map(s => s.msg)
  };
}

function withPlayers(mode, players) {
  const b = bus();
  const co = createCoordinator(b.io);
  players.forEach((p, i) => { b.seats.push(i); co.addPlayer(i, p); });
  const match = co.startMatch(mode);
  return { b, co, match };
}

const KIDS = [
  { name: 'Ana', band: 'R' },   // 4
  { name: 'Sam', band: 'G3' },  // 8
  { name: 'Jo', band: 'G1' }    // 6
];

test('a team split spreads the youngest across teams rather than stacking them', () => {
  const { co, match } = withPlayers('teams', KIDS.concat([{ name: 'Kit', band: 'PN' }]));
  const roster = co.rosterList();
  const teamOf = {};
  roster.forEach(r => { teamOf[r.name] = r.team; });
  assert.equal(match.teams.A.length, 2);
  assert.equal(match.teams.B.length, 2);
  assert.notEqual(teamOf.Kit, teamOf.Ana, 'the two youngest must not be on the same team');
});

test('together mode puts everyone on one team, and nobody can lose', () => {
  const { co, match } = withPlayers('together', KIDS);
  assert.equal(match.teams.A.length, 3);
  assert.equal(MP_MODES.together.buzz, false, 'no head-to-head buzzing in the co-op mode');
  const board = co.scoreboard();
  assert.equal(board.kind, 'together');
  assert.ok(!('place' in board));
});

test('distance is applied by the coordinator, and a device cannot claim more than one question is worth', () => {
  const { b, co } = withPlayers('race', KIDS);
  co.onStep(0, { d: 1.2 });
  co.onStep(1, { d: 999 });          // a device claiming an absurd step
  const track = b.last('state').track;
  assert.ok(Math.abs(track.positions[0] - 1.2) < 1e-9);
  assert.ok(track.positions[1] <= 3, 'clamped, was ' + track.positions[1]);
});

test('a step is never negative, however it is reported', () => {
  const { b, co } = withPlayers('race', KIDS);
  co.onStep(0, { d: 1 });
  co.onStep(0, { d: -5 });
  assert.equal(b.last('state').track.positions[0], 1);
});

test('the pit message says who, never what', () => {
  const { b, co } = withPlayers('race', KIDS);
  co.onPit(1, true);
  const m = b.last('pit');
  assert.equal(m.seat, 1);
  assert.equal(m.on, true);
  assert.deepEqual(Object.keys(m).sort(), ['on', 'seat', 't']);
});

test('the checkpoint fires only when the whole pack has arrived', () => {
  const { b, co } = withPlayers('race', [KIDS[0], KIDS[1]]);
  for (let i = 0; i < 5; i++) co.onStep(0, { d: 1 });
  assert.equal(b.all('checkpoint').length, 0, 'one player alone must not advance the leg');
  for (let i = 0; i < 5; i++) co.onStep(1, { d: 1 });
  assert.equal(b.all('checkpoint').length, 1);
});

test('a trailing player is quietly helped at a checkpoint, and the leader is never slowed', () => {
  const { b, co } = withPlayers('race', [KIDS[0], KIDS[1]]);
  for (let i = 0; i < 5; i++) co.onStep(0, { d: 1.2 });
  const leadBefore = co.snapshot().positions[0];
  for (let i = 0; i < 5; i++) co.onStep(1, { d: 0.2 });
  const after = co.snapshot();
  assert.equal(after.positions[0], leadBefore, 'the leader must not be pulled back');
  assert.ok(after.positions[1] > 1.0, 'the trailing player got a nudge, was ' + after.positions[1]);
});

test('the first correct answer takes a buzz round, and a later one cannot steal it', () => {
  const { b, co } = withPlayers('teams', KIDS);
  co.startBuzz('core.math/g1');
  b.advance(400);
  co.onBuzzAnswer(1, true);
  b.advance(400);
  co.onBuzzAnswer(2, true);
  const results = b.all('buzz-result');
  assert.equal(results.length, 1);
  assert.equal(results[0].winner, 1);
  assert.ok(Math.abs(results[0].track.positions[1] - BUZZ_BONUS) < 1e-9);
});

test('a buzz round everybody gets wrong resolves with no winner rather than hanging', () => {
  const { b, co } = withPlayers('teams', KIDS);
  co.startBuzz('x');
  co.onBuzzAnswer(0, false);
  co.onBuzzAnswer(1, false);
  co.onBuzzAnswer(2, false);
  assert.equal(b.last('buzz-result').winner, null);
});

test('an unanswered buzz round cannot stall the race', () => {
  const { b, co } = withPlayers('teams', KIDS);
  co.startBuzz('x');
  co.tick();
  assert.equal(b.all('buzz-result').length, 0, 'not resolved before the window closes');
  b.advance(BUZZ_WINDOW_MS + 10);
  co.tick();
  assert.equal(b.all('buzz-result').length, 1);
});

test('the buzz item travels as an id and a seed, never as content', () => {
  const { b, co } = withPlayers('teams', KIDS);
  co.startBuzz('core.math.school/g2');
  const m = b.last('buzz');
  assert.equal(m.itemRef, 'core.math.school/g2');
  assert.equal(typeof m.seed, 'number');
  assert.ok(!('options' in m) && !('prompt' in m) && !('answer' in m));
});

test('only the four allowed cheers are relayed', () => {
  const { b, co } = withPlayers('race', KIDS);
  co.onCheer(0, 1, '👏');
  assert.equal(b.all('cheer').length, 1);
  co.onCheer(0, 1, 'you are rubbish');
  assert.equal(b.all('cheer').length, 1, 'anything not on the list is dropped — there is no free text between devices');
});

test('the leader crossing does not end the game — everyone gets to finish', () => {
  const { b, co, match } = withPlayers('race', [KIDS[0], KIDS[1]]);
  for (let i = 0; i < match.length; i++) co.onStep(0, { d: 1 });
  assert.equal(b.all('finished').length, 1);
  assert.equal(b.all('results').length, 0, 'the race must not end under the second player');
  for (let i = 0; i < match.length; i++) co.onStep(1, { d: 1 });
  assert.equal(b.all('results').length, 1);
});

test('finish order is fixed once and cannot be reclaimed', () => {
  const { b, co, match } = withPlayers('race', [KIDS[0], KIDS[1]]);
  for (let i = 0; i < match.length + 5; i++) co.onStep(1, { d: 1 });
  const finishes = b.all('finished');
  assert.equal(finishes.length, 1);
  assert.equal(finishes[0].seat, 1);
  assert.equal(finishes[0].place, 1);
});

test('a team scoreboard ranks teams, never children against each other', () => {
  const { co } = withPlayers('teams', KIDS);
  co.onStep(0, { d: 2 });
  co.onStep(1, { d: 5 });
  const board = co.scoreboard();
  assert.equal(board.kind, 'teams');
  assert.equal(board.rows.length, 2);
  assert.ok(board.rows.every(r => 'team' in r && 'distance' in r));
  assert.ok(board.rows.every(r => r.members.every(m => !('place' in m))));
});

test('the track shortens as more players join, so a finish still lands in one sitting', () => {
  const two = withPlayers('race', [KIDS[0], KIDS[1]]).match.length;
  const five = withPlayers('race', KIDS.concat([{ name: 'D', band: 'K' }, { name: 'E', band: 'K' }])).match.length;
  assert.ok(five < two, 'five players: ' + five + ', two players: ' + two);
  assert.ok(five >= 14);
});

test('a player who leaves is dropped from the roster without taking the match down', () => {
  const { b, co } = withPlayers('race', KIDS);
  co.removePlayer(2);
  assert.equal(co.rosterList().length, 2);
  co.onStep(0, { d: 1 });
  assert.ok(b.last('state'));
});
