/**
 * choice.js — mcq, tap-image and listen. All three are "pick one of these",
 * differing only in what an option looks like and how the prompt is carried.
 *
 * Feedback rules, which are not negotiable (docs/LEARNING.md §10):
 *   • never a red X on the child, only on the option they picked
 *   • the correct answer is always shown before a re-attempt
 *   • wrong options carry a misconception slug, which the teach card uses to
 *     address the specific wrong idea rather than re-explaining the topic
 */

import { el, clear, button, shuffle } from '../ui/dom.js';
import { promptNode, pictureNode } from './index.js';

function build(host, props, kind) {
  var item = props.item;
  var rng = props.rng;
  var node = el('div', 'q q-' + kind);
  node.appendChild(promptNode(props));

  var opts = item.options.slice();
  if (item.shuffle !== false) opts = shuffle(opts, rng);

  var list = el('div', 'q-options q-options-' + kind);
  list.setAttribute('role', 'group');
  var done = false;
  var buttons = [];

  opts.forEach(function (o) {
    var b = el('button', 'q-opt');
    b.type = 'button';
    if (kind === 'tap-image') {
      b.appendChild(pictureNode(o, item.mediaBase, props.pictureSize || 88));
      if (o.alt && props.showLabels) b.appendChild(el('span', 'q-opt-label', o.alt));
      b.setAttribute('aria-label', o.alt || '');
    } else {
      // A shape as well as a position, so a child across the room can say
      // "the triangle one" — and so right/wrong is never colour alone.
      b.appendChild(el('span', 'q-opt-shape shape-' + (['sq', 'ci', 'tri', 'di'][buttons.length] || 'sq')));
      b.appendChild(el('span', 'q-opt-text', o.v));
    }
    b.addEventListener('click', function (e) {
      e.preventDefault();
      if (done) return;
      done = true;
      var correct = !!o.correct;

      // The reveal is a BEAT, not a flip. Everything locks, the chosen option
      // is marked, and only then does the right answer light up. Without the
      // pause an answer reads as a click; with it, it reads as a moment — and
      // the child actually looks at what was right.
      for (var i = 0; i < buttons.length; i++) buttons[i].disabled = true;
      list.className = list.className + ' is-locked';
      b.className = 'q-opt is-chosen';

      var hold = props.reducedMotion ? 0 : 380;
      setTimeout(function () {
        b.className = 'q-opt ' + (correct ? 'is-right' : 'is-wrong');
        // Always reveal the right one. Leaving a child having guessed wrong
        // with no correction is the single most wasteful thing a quiz app
        // can do.
        for (var j = 0; j < buttons.length; j++) {
          if (!correct && buttons[j].__correct) buttons[j].className = 'q-opt is-right is-revealed';
        }
        setTimeout(function () {
          props.onAnswer(correct, { chosen: o.v || o.alt, misconception: o.misconception || null });
        }, hold ? 260 : 0);
      }, hold);
    });
    b.__correct = !!o.correct;
    buttons.push(b);
    list.appendChild(b);
  });

  node.appendChild(list);
  host.appendChild(node);

  // A listen item leads with sound: speak on mount so a pre-reader is not
  // staring at a screen waiting for something to happen.
  if (kind === 'listen' && props.speak) props.speak(item.prompt);

  return {
    node: node,
    destroy: function () { done = true; },
    focus: function () { if (buttons.length) buttons[0].focus(); }
  };
}

export function createMcq(host, props) { return build(host, props, 'mcq'); }
export function createTapImage(host, props) { return build(host, props, 'tap-image'); }
export function createListen(host, props) { return build(host, props, 'listen'); }
