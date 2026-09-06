/**
 * icons.js — the interface iconography.
 *
 * Geometric, single-weight, drawn on one 24x24 grid and inheriting the text
 * colour, so they sit inside a button the way type does. No emoji anywhere in
 * the interface: emoji render differently on every device, carry a register
 * that undercuts the product, and cannot be recoloured to match a state.
 */

var STROKE = 'fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"';

var ICONS = {
  /* Game modes */
  together: '<path d="M9 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM17 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6z" ' + STROKE + '/>' +
            '<path d="M3 20c0-3 2.7-5 6-5s6 2 6 5M15 15c3 0 6 2 6 5" ' + STROKE + '/>',
  teams: '<path d="M4 12h16" ' + STROKE + '/>' +
         '<circle cx="12" cy="12" r="2.6" ' + STROKE + '/>' +
         '<path d="M4 8v8M20 8v8" ' + STROKE + '/>',
  race: '<path d="M5 3v18" ' + STROKE + '/>' +
        '<rect x="5" y="4.5" width="14" height="9" rx="1" ' + STROKE + '/>' +
        '<path d="M5 9h14M12 4.5v9" ' + STROKE + '/>' +
        '<path d="M5 4.5h7v4.5H5zM12 9h7v4.5h-7z" fill="currentColor" opacity=".85"/>',
  relay: '<path d="M7 17l4-4M13 11l4-4" ' + STROKE + '/>' +
         '<circle cx="5.5" cy="18.5" r="2.2" ' + STROKE + '/>' +
         '<circle cx="18.5" cy="5.5" r="2.2" ' + STROKE + '/>' +
         '<path d="M11 13l2 -2" stroke="currentColor" stroke-width="4" stroke-linecap="round"/>',
  solo: '<circle cx="12" cy="12" r="8" ' + STROKE + '/><circle cx="12" cy="12" r="3.2" ' + STROKE + '/>',

  /* Navigation and actions */
  back: '<path d="M15 5l-7 7 7 7" ' + STROKE + '/>',
  close: '<path d="M6 6l12 12M18 6L6 18" ' + STROKE + '/>',
  people: '<circle cx="12" cy="8" r="3.4" ' + STROKE + '/><path d="M5 20c0-4 3.2-6.5 7-6.5S19 16 19 20" ' + STROKE + '/>',
  modules: '<rect x="3.5" y="4.5" width="17" height="15" rx="2.5" ' + STROKE + '/><path d="M8.5 4.5v15M12.5 9h4M12.5 13h4" ' + STROKE + '/>',
  settings: '<circle cx="12" cy="12" r="3" ' + STROKE + '/>' +
            '<path d="M12 3v2.2M12 18.8V21M21 12h-2.2M5.2 12H3M18.4 5.6l-1.6 1.6M7.2 16.8l-1.6 1.6M18.4 18.4l-1.6-1.6M7.2 7.2L5.6 5.6" ' + STROKE + '/>',
  sound: '<path d="M5 9.5h3l4-3.5v12l-4-3.5H5z" ' + STROKE + '/><path d="M16 9a4 4 0 0 1 0 6" ' + STROKE + '/>',
  plus: '<path d="M12 5v14M5 12h14" ' + STROKE + '/>',
  chart: '<path d="M4 20h16M8 20v-6M12 20V8M16 20v-9" ' + STROKE + '/>',

  /* Question states */
  repair: '<path d="M14.5 4.2a4.5 4.5 0 0 0 5.6 5.9L21 11l-9 9-3.5-.6L8 16l9-9z" ' + STROKE + '/>' +
          '<path d="M6.5 17.5l-2.6 2.6" ' + STROKE + '/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7" ' + STROKE + '/>',
  cross: '<path d="M7 7l10 10M17 7L7 17" ' + STROKE + '/>',
  lightbulb: '<path d="M9.5 17h5M10 20h4" ' + STROKE + '/>' +
             '<path d="M12 3a6 6 0 0 0-3.4 10.9c.6.4.9 1 .9 1.6h5c0-.6.3-1.2.9-1.6A6 6 0 0 0 12 3z" ' + STROKE + '/>',
  flag: '<path d="M6 21V4" ' + STROKE + '/><path d="M6 5h11l-2 3.5L17 12H6z" ' + STROKE + '/>',

  /* Reactions — abstract marks, not faces. Nothing here can read as mockery. */
  clap: '<path d="M12 21a6 6 0 0 0 6-6V9.5a1.5 1.5 0 0 0-3 0V13" ' + STROKE + '/>' +
        '<path d="M15 12.5V6a1.5 1.5 0 0 0-3 0v6.5M12 12V4.5a1.5 1.5 0 0 0-3 0V13" ' + STROKE + '/>' +
        '<path d="M9 13V8a1.5 1.5 0 0 0-3 0v7a6 6 0 0 0 6 6" ' + STROKE + '/>',
  spark: '<path d="M12 3l2.1 5.7L20 11l-5.9 2.3L12 19l-2.1-5.7L4 11l5.9-2.3z" ' + STROKE + '/>',
  strong: '<path d="M6 14l6-6 6 6" ' + STROKE + '/>' +
          '<path d="M6 19h12" ' + STROKE + '/>' +
          '<path d="M12 8v9" ' + STROKE + '/>',
  star: '<path d="M12 3.5l2.7 5.6 6.1.9-4.4 4.3 1 6.1-5.4-2.9-5.4 2.9 1-6.1L3.2 10l6.1-.9z" ' + STROKE + '/>',

  /* Placings — numerals in a ring, so they are readable and unfussy. */
  first: '<circle cx="12" cy="12" r="8.5" ' + STROKE + '/><path d="M10.6 9.4L12 8.4V16" ' + STROKE + '/>',
  second: '<circle cx="12" cy="12" r="8.5" ' + STROKE + '/><path d="M9.6 9.6a2.4 2.4 0 1 1 4.4 1.4L9.6 16h4.8" ' + STROKE + '/>',
  third: '<circle cx="12" cy="12" r="8.5" ' + STROKE + '/><path d="M9.7 9.2a2.3 2.3 0 1 1 2.6 3.1 2.4 2.4 0 1 1-2.6 3.5" ' + STROKE + '/>'
};

export var REACTIONS = ['clap', 'spark', 'strong', 'star'];
export var REACTION_LABELS = { clap: 'Nice one', spark: 'Brilliant', strong: 'Strong', star: 'Star' };

export function hasIcon(name) { return ICONS.hasOwnProperty(name); }

export function iconSvg(name) {
  var body = ICONS[name];
  if (!body) return '';
  return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="100%" height="100%" ' +
    'aria-hidden="true" focusable="false">' + body + '</svg>';
}

/** An <span> carrying an icon, sized in px and inheriting colour. */
export function icon(name, size, className) {
  var span = document.createElement('span');
  span.className = 'icon' + (className ? ' ' + className : '');
  if (size) { span.style.width = size + 'px'; span.style.height = size + 'px'; }
  span.innerHTML = iconSvg(name);
  return span;
}

export function placeIcon(place) {
  return place === 1 ? 'first' : place === 2 ? 'second' : place === 3 ? 'third' : null;
}
