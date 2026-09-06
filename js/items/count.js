/**
 * count.js — tap each thing as you count it.
 *
 * Deliberately NOT "pick the numeral". Tapping one object at a time is what
 * teaches one-to-one correspondence, which is the actual skill a two-year-old
 * is building; a multiple-choice numeral quiz tests a different thing and
 * lets a child guess from three options.
 *
 * With `choices` the child taps to count and then picks the total. Without
 * them the count itself is the answer, which is the right form at PN.
 */

import { el, clear, button, shuffle } from '../ui/dom.js';
import { promptNode } from './index.js';

export function createCount(host, props) {
  var item = props.item;
  var node = el('div', 'q q-count');
  node.appendChild(promptNode(props));

  var field = el('div', 'q-count-field');
  var tapped = 0;
  var done = false;
  var readout = el('div', 'q-count-readout', '0');
  var marks = [];

  for (var i = 0; i < item.n; i++) {
    var b = el('button', 'q-countable', item.item);
    b.type = 'button';
    b.setAttribute('aria-label', 'one');
    (function (btn) {
      btn.addEventListener('click', function (e) {
        e.preventDefault();
        if (done || btn.className.indexOf('is-counted') !== -1) return;
        btn.className = 'q-countable is-counted';
        tapped += 1;
        readout.textContent = String(tapped);
        if (props.speak) props.speak({ tts: String(tapped) });
        if (tapped === item.n && !item.choices) finish(true);
        else if (tapped === item.n && item.choices) showChoices();
      });
    })(b);
    marks.push(b);
    field.appendChild(b);
  }

  node.appendChild(field);
  node.appendChild(readout);

  var choiceWrap = el('div', 'q-options q-options-mcq');
  node.appendChild(choiceWrap);

  function showChoices() {
    var opts = shuffle(item.choices.slice(), props.rng);
    opts.forEach(function (c) {
      var b = el('button', 'q-opt', String(c));
      b.type = 'button';
      b.addEventListener('click', function (e) {
        e.preventDefault();
        if (done) return;
        b.className = 'q-opt ' + (c === item.n ? 'is-right' : 'is-wrong');
        finish(c === item.n);
      });
      choiceWrap.appendChild(b);
    });
  }

  function finish(correct) {
    done = true;
    readout.className = 'q-count-readout ' + (correct ? 'is-right' : 'is-wrong');
    props.onAnswer(correct, { chosen: String(tapped) });
  }

  // A child who does not tap everything still needs a way to answer.
  if (item.choices) showChoices();

  host.appendChild(node);
  return { node: node, destroy: function () { done = true; }, focus: function () {} };
}
