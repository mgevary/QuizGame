/**
 * items/index.js — the item-type registry and the shared question chrome.
 *
 * Contract: a factory takes (props) and returns {node, destroy, focus}. It
 * calls props.onAnswer(correct, detail) exactly once. Everything about
 * whether that answer was "first try" or "a recovery" is decided upstream —
 * an item renderer only knows right or wrong.
 *
 * `gradable` is the load-bearing flag: only gradable types are allowed to
 * touch the ability estimate and the review schedule. Anything else earns
 * track distance and joy and stays invisible to the learning model.
 */

import { el, clear, button } from '../ui/dom.js';
import { createMcq, createTapImage, createListen } from './choice.js';
import { createAssemble } from './assemble.js';
import { createCount } from './count.js';
import { createTrace } from './trace.js';

var FACTORIES = {
  mcq: createMcq,
  'tap-image': createTapImage,
  listen: createListen,
  assemble: createAssemble,
  count: createCount,
  trace: createTrace
};

export var GRADABLE = {
  mcq: true, 'tap-image': true, listen: true, assemble: true, count: true, trace: true
};

export function isGradable(type) { return GRADABLE[type] === true; }

export function hasRenderer(type) { return !!FACTORIES[type]; }

/**
 * Mount an item into `host`.
 * @param {object} props {item, band, settings, rng, speak, onAnswer}
 */
export function mountItem(host, props) {
  var factory = FACTORIES[props.item.type];
  clear(host);
  if (!factory) {
    host.appendChild(el('p', 'q-error', 'This question needs a newer version of the game.'));
    return { node: host, destroy: function () {} };
  }
  return factory(host, props);
}

/**
 * The question stem. A pre-reader cannot read it, so at bands with a zero
 * word budget the text is hidden from the child and spoken instead — the
 * text stays in the DOM for screen readers and for the grown-up alongside.
 */
export function promptNode(props) {
  var wrap = el('div', 'q-prompt');
  var item = props.item;
  var text = (item.prompt && item.prompt.text) || '';
  var mute = props.maxWords === 0;
  if (text) {
    var p = el('p', 'q-text' + (mute ? ' is-quiet' : ''), text);
    wrap.appendChild(p);
  }
  if (item.passage) {
    var pass = el('div', 'q-passage');
    pass.appendChild(el('p', null, item.passage));
    wrap.insertBefore(pass, wrap.firstChild);
  }
  if (props.speak) {
    var say = button('🔊', 'q-say', function () { props.speak(item.prompt); });
    say.setAttribute('aria-label', 'Read the question aloud');
    wrap.appendChild(say);
  }
  return wrap;
}

/** A picture: an emoji drawn as text, or a real image. */
export function pictureNode(o, base, size) {
  if (o.emoji) {
    var span = el('span', 'q-emoji', o.emoji);
    span.setAttribute('role', 'img');
    span.setAttribute('aria-label', o.alt || '');
    if (size) span.style.fontSize = size + 'px';
    return span;
  }
  var img = el('img', 'q-img');
  img.src = (base || '') + o.image;
  img.alt = o.alt || '';
  return img;
}
