/**
 * assemble.js — build the answer from tiles.
 *
 * This is the most important renderer in the app, because it is the default
 * GENERATE step: after a child is taught, they must produce the answer rather
 * than recognise it (Slamecka & Graf's generation effect). Tapping tiles is
 * the only production interaction available to a child who cannot yet type.
 *
 * `wordTiles` switches the unit from letters to whole words, which is what
 * makes reading-comprehension answers buildable.
 */

import { el, clear, button, shuffle } from '../ui/dom.js';
import { promptNode, pictureNode } from './index.js';

export function createAssemble(host, props) {
  var item = props.item;
  var wordMode = !!item.wordTiles;
  var target = wordMode ? String(item.answer).split(/\s+/) : String(item.answer).split('');
  var node = el('div', 'q q-assemble' + (wordMode ? ' is-words' : ''));
  node.appendChild(promptNode(props));

  if (item.media && (item.media.emoji || item.media.image)) {
    var fig = el('div', 'q-figure');
    fig.appendChild(pictureNode(item.media, item.mediaBase, 96));
    node.appendChild(fig);
  }

  var slotWrap = el('div', 'q-slots');
  var trayWrap = el('div', 'q-tray');
  var picked = [];
  var done = false;

  var tiles = shuffle(item.tiles.slice(), props.rng);

  function renderSlots() {
    clear(slotWrap);
    for (var i = 0; i < target.length; i++) {
      var s = el('span', 'q-slot' + (picked[i] ? ' is-filled' : ''), picked[i] || '');
      if (picked[i]) {
        (function (idx) {
          s.addEventListener('click', function () {
            if (done) return;
            returnTile(idx);
          });
        })(i);
        s.setAttribute('role', 'button');
        s.setAttribute('aria-label', 'Remove ' + picked[i]);
      }
      slotWrap.appendChild(s);
    }
  }

  function returnTile(idx) {
    var v = picked[idx];
    picked.splice(idx, 1);
    var b = el('button', 'q-tile', v);
    b.type = 'button';
    wire(b, v);
    trayWrap.appendChild(b);
    renderSlots();
  }

  function wire(b, v) {
    b.addEventListener('click', function (e) {
      e.preventDefault();
      if (done || picked.length >= target.length) return;
      picked.push(v);
      b.parentNode.removeChild(b);
      renderSlots();
      if (picked.length === target.length) check();
    });
  }

  function check() {
    done = true;
    var correct = picked.join(wordMode ? ' ' : '') === target.join(wordMode ? ' ' : '');
    slotWrap.className = 'q-slots ' + (correct ? 'is-right' : 'is-wrong');
    if (!correct) {
      // Show the target so the attempt ends on the right answer, then let the
      // caller decide what happens next.
      var want = el('div', 'q-answer', target.join(wordMode ? ' ' : ''));
      node.appendChild(want);
    }
    props.onAnswer(correct, { chosen: picked.join(wordMode ? ' ' : '') });
  }

  tiles.forEach(function (t) {
    var b = el('button', 'q-tile', t);
    b.type = 'button';
    wire(b, t);
    trayWrap.appendChild(b);
  });

  renderSlots();
  node.appendChild(slotWrap);
  node.appendChild(trayWrap);

  var undo = button('Undo', 'q-undo', function () { if (!done && picked.length) returnTile(picked.length - 1); });
  node.appendChild(undo);

  host.appendChild(node);
  return { node: node, destroy: function () { done = true; }, focus: function () {} };
}
