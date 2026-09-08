/**
 * presence.js — "someone is here". A toast across the top of the screen, a
 * chime, a buzz, the tab title, and — when the tab is in the background and
 * the person has already said yes — a system notification. DOM layer.
 *
 * Joining a game is the moment multiplayer either feels alive or does not.
 * A roster that silently grows by one chip is easy to miss on a phone lying
 * on the kitchen table; a chime, a buzz and a name across the screen are not.
 */

import { el } from './dom.js';
import { racerSvg } from './art.js';
import * as Sfx from './sfx.js';

var stack = null;

function stackNode() {
  if (stack && stack.parentNode) return stack;
  stack = el('div', 'toasts');
  stack.setAttribute('aria-live', 'polite');
  document.body.appendChild(stack);
  return stack;
}

/**
 * @param {string} text
 * @param {object} [o] {racer, kind: 'join'|'leave'|'info', ms}
 */
export function toast(text, o) {
  o = o || {};
  var t = el('div', 'toast' + (o.kind ? ' is-' + o.kind : ''));
  if (o.racer) {
    var av = el('span', 'toast-avatar');
    av.innerHTML = racerSvg(o.racer);
    t.appendChild(av);
  }
  t.appendChild(el('span', 'toast-text', text));
  var host = stackNode();
  host.appendChild(t);
  // Three at most: a burst of arrivals should read as a burst, not a wall.
  while (host.children.length > 3) host.removeChild(host.firstChild);
  var ms = o.ms || 3400;
  setTimeout(function () { t.className += ' is-leaving'; }, ms - 300);
  setTimeout(function () { if (t.parentNode) t.parentNode.removeChild(t); }, ms);
  return t;
}

var titleTimer = null;
var baseTitle = null;

/** Put a line in the tab title for a few seconds, then put it back. */
export function flashTitle(text, ms) {
  if (baseTitle === null) baseTitle = document.title;
  document.title = text;
  clearTimeout(titleTimer);
  titleTimer = setTimeout(function () { document.title = baseTitle; }, ms || 6000);
}

/*
 * System notifications. Only when the tab is hidden, and only if the person
 * already said yes. This never prompts on its own: a permission dialog in a
 * child's face is not a welcome, so the ask is a link they can choose.
 */
export function canOfferNotify() {
  return typeof window.Notification === 'function' && window.Notification.permission === 'default';
}

export function notifyAllowed() {
  return typeof window.Notification === 'function' && window.Notification.permission === 'granted';
}

export function askNotify() {
  if (typeof window.Notification !== 'function') return Promise.resolve('denied');
  try { return Promise.resolve(window.Notification.requestPermission()); }
  catch (e) { return Promise.resolve('denied'); }
}

export function notify(title, body) {
  if (!document.hidden || !notifyAllowed()) return;
  try {
    var n = new window.Notification(title, { body: body, tag: 'quiz-join' });
    setTimeout(function () { try { n.close(); } catch (e) {} }, 8000);
  } catch (e) {}
}

/** Who is new and who is gone between two rosters. No side effects. */
export function diffRoster(prev, next) {
  var was = {}, now = {};
  (prev || []).forEach(function (r) { was[r.seat] = r; });
  (next || []).forEach(function (r) { now[r.seat] = r; });
  var joined = [], left = [];
  for (var s in now) if (!was[s]) joined.push(now[s]);
  for (var t in was) if (!now[t]) left.push(was[t]);
  return { joined: joined, left: left };
}

/**
 * Say it out loud: chime, buzz, a toast with their racer, the tab title, a
 * background notification. `me` is the seat to stay quiet about — nobody
 * needs telling that they arrived themselves.
 * @returns {boolean} whether anyone new turned up
 */
export function announceArrivals(diff, me, o) {
  o = o || {};
  var loud = false;
  diff.joined.forEach(function (r) {
    if (r.seat === me) return;
    loud = true;
    toast(r.name + ' joined' + (o.gameName ? ' ' + o.gameName : '') + '!', { racer: r.racer, kind: 'join' });
    flashTitle(r.name + ' joined · Quiz Quest');
    notify(r.name + ' joined ' + (o.gameName || 'the game'), 'Open Quiz Quest to start.');
  });
  diff.left.forEach(function (r) {
    if (r.seat === me) return;
    toast(r.name + ' left', { racer: r.racer, kind: 'leave', ms: 2400 });
  });
  if (loud) { Sfx.play('cheer'); Sfx.buzz([18, 40, 18]); }
  return loud;
}
