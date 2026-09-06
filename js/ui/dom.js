// dom.js — the handful of DOM helpers the whole app shares.

export function el(tag, className, text) {
  var node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined && text !== null) node.textContent = String(text);
  return node;
}

export function clear(node) {
  while (node.firstChild) node.removeChild(node.firstChild);
  return node;
}

export function on(node, event, handler) {
  node.addEventListener(event, handler);
  return node;
}

/** A button that responds to touch without the 300ms tap delay. */
export function button(label, className, onTap) {
  var b = el('button', className || 'btn', label);
  b.type = 'button';
  b.addEventListener('click', function (e) { e.preventDefault(); onTap(e); });
  return b;
}

/**
 * A labelled slider. `onInput` fires live as it is dragged so audio can follow
 * the thumb, and the readout keeps the current value visible — a bare track
 * gives no clue what it is set to.
 */
export function slider(opts) {
  var row = el('div', 'slider-row');
  if (opts.icon) row.appendChild(el('span', 'slider-icon', opts.icon));

  var input = el('input', 'slider');
  input.type = 'range';
  input.min = String(opts.min === undefined ? 0 : opts.min);
  input.max = String(opts.max === undefined ? 100 : opts.max);
  input.step = String(opts.step === undefined ? 1 : opts.step);
  input.value = String(opts.value);
  if (opts.label) input.setAttribute('aria-label', opts.label);
  row.appendChild(input);

  // Read the value BACK off the input: the browser snaps it to `step`, and a
  // readout built from the raw value would disagree with the thumb.
  var shown = parseFloat(input.value);
  var readout = el('span', 'slider-value', opts.format ? opts.format(shown) : String(shown));
  row.appendChild(readout);

  function handle() {
    var v = parseFloat(input.value);
    readout.textContent = opts.format ? opts.format(v) : String(v);
    if (opts.onInput) opts.onInput(v);
  }
  // `input` tracks the drag; `change` is the commit, and is all some older
  // WebKit builds fire for a keyboard nudge.
  input.addEventListener('input', handle);
  input.addEventListener('change', handle);

  row.input = input;
  row.setValue = function (v) {
    input.value = String(v);
    var snapped = parseFloat(input.value);
    readout.textContent = opts.format ? opts.format(snapped) : String(snapped);
  };
  return row;
}

export function shuffle(arr, rng) {
  var r = rng || Math.random;
  var out = arr.slice();
  for (var i = out.length - 1; i > 0; i--) {
    var j = Math.floor(r() * (i + 1));
    var t = out[i]; out[i] = out[j]; out[j] = t;
  }
  return out;
}

export function randInt(min, max) { return min + Math.floor(Math.random() * (max - min + 1)); }

export function fmtTime(seconds) {
  var s = Math.max(0, Math.floor(seconds));
  var m = Math.floor(s / 60);
  var r = s % 60;
  return m + ':' + (r < 10 ? '0' : '') + r;
}
