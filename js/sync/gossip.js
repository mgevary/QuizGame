/**
 * gossip.js — moving events between two devices that have met.
 *
 * The exchange is anti-entropy: each side says what it has (a version
 * vector), each side sends what the other lacks, both fold. It is idempotent
 * and order-independent, so it is safe to run on every connection, twice,
 * in either direction, over any transport that can carry a JSON message.
 *
 * The one rule with a real-world cost: only devices in the SAME FAMILY swap
 * logs. A friend's phone joining a race gets the race and nothing durable —
 * otherwise a child's whole learning history would follow them home.
 */

import * as Log from './log.js';
import { diff, versionVector } from './merge.js';
import { familyCode, isFamily } from './pairing.js';

var CHUNK = 200;

/**
 * Attach to a session. Works with every transport: they all expose
 * `sendRaw(msg)` and `on(type, fn)`, and the relay ones add `from`.
 *
 * @param {object} session
 * @param {object} [o] {onSynced(count, fromSeat)}
 */
export function attach(session, o) {
  o = o || {};
  var announced = false;

  function have() {
    session.sendRaw({ t: 'sync-have', vv: Log.vector(), campaignId: familyCode(), deviceId: Log.getDevice().deviceId });
  }

  session.on('sync-have', function (msg) {
    if (!isFamily(msg.campaignId)) return;          // a guest: nothing durable crosses
    var missing = diff(Log.all(), msg.vv || {});
    for (var i = 0; i < missing.length; i += CHUNK) {
      session.sendRaw({
        t: 'sync-events', campaignId: familyCode(),
        events: missing.slice(i, i + CHUNK),
        more: i + CHUNK < missing.length
      });
    }
    // Answer their have with ours, once, so both directions run.
    if (!announced) { announced = true; have(); }
  });

  session.on('sync-events', function (msg) {
    if (!isFamily(msg.campaignId)) return;
    var added = Log.absorb(msg.events || []);
    if (added && o.onSynced) o.onSynced(added, msg.from);
  });

  // Open the exchange as soon as we are attached.
  have();
  announced = true;
  return { again: have };
}

/** For tests and the mailbox: what would we send to a peer with this vector? */
export function eventsFor(remoteVV) {
  return diff(Log.all(), remoteVV || {});
}

export function ourVector() { return versionVector(Log.all()); }
