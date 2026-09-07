/**
 * home.js, profiles.js, library.js, results.js — the shell around the loop.
 * Kept in one file: they are small, and they share the same header/section
 * builders that would otherwise be duplicated four times.
 */
import { el, clear, button, slider } from '../ui/dom.js';
import * as Music from '../ui/music.js';
import * as Sfx from '../ui/sfx.js';
import { familyCode, joinFamily } from '../sync/pairing.js';
import { RACERS, racerSvg } from '../ui/art.js';
import { icon } from '../ui/icons.js';
import { BAND_INFO, BANDS, bandForAge } from '../content/bands.js';
import * as Users from '../users/users.js';
import { loadSettings, saveSettings, setSetting, toggleModule, moduleEnabled, SETTING_LABELS, SETTING_NOTES } from '../settings/settings.js';
import { modulesForBand, defaultModuleIds, moduleFit } from '../content/registry.js';
import { state as logState } from '../sync/log.js';
import { isMastered, isRecovered } from '../learn/scheduler.js';

export function topbar(title, onBack, right) {
  var bar = el('div', 'topbar');
  if (onBack) {
    var b = button('', 'icon-btn', onBack);
    b.appendChild(icon('back', 20));
    b.setAttribute('aria-label', 'Back');
    bar.appendChild(b);
  } else bar.appendChild(el('span', 'icon-btn is-ghost', ''));
  bar.appendChild(el('h1', 'topbar-title', title));
  bar.appendChild(right || el('span', 'icon-btn is-ghost', ''));
  return bar;
}

export function section(title) {
  var s = el('section', 'section');
  if (title) s.appendChild(el('h2', 'section-head', title));
  return s;
}

function avatarNode(id, size) {
  var w = el('span', 'avatar');
  w.style.width = w.style.height = (size || 44) + 'px';
  w.innerHTML = racerSvg(id || 'rocket');
  return w;
}

/* ── Profiles ────────────────────────────────────────────────────────── */

export function profilesScreen(nav) {
  var root = el('div', 'screen');
  root.appendChild(topbar('Who is playing?', Users.getActiveUser() ? function () { nav.go('home'); } : null));

  var list = el('div', 'profile-grid');
  var users = Users.listUsers();
  users.forEach(function (u) {
    var b = el('button', 'profile-card');
    b.type = 'button';
    b.appendChild(avatarNode(u.avatar, 64));
    b.appendChild(el('span', 'profile-name', u.name));
    b.appendChild(el('span', 'profile-band', BAND_INFO[u.band].label));
    b.addEventListener('click', function () {
      Users.setActiveUserId(u.id);
      nav.go('home');
    });
    list.appendChild(b);
  });

  var add = el('button', 'profile-card is-add');
  add.type = 'button';
  add.appendChild(icon('plus', 28, 'profile-plus'));
  add.appendChild(el('span', 'profile-name', 'New player'));
  add.addEventListener('click', function () { nav.go('newuser'); });
  list.appendChild(add);
  root.appendChild(list);

  if (users.length) {
    root.appendChild(button('Remove a player', 'link-btn', function () {
      if (!Users.parentGate()) return;
      nav.go('removeuser');
    }));
  }
  return root;
}

export function newUserScreen(nav, opts) {
  var back = opts && opts.back ? function () { nav.go(opts.back, opts); } : function () { nav.go('profiles'); };
  var root = el('div', 'screen');
  root.appendChild(topbar('New player', back));

  var form = section();
  var name = el('input', 'field');
  name.type = 'text'; name.placeholder = 'Name'; name.maxLength = 16;
  form.appendChild(labelled('Name', name));

  var age = el('input', 'field');
  age.type = 'number'; age.min = '2'; age.max = '99'; age.value = '6';
  age.setAttribute('inputmode', 'numeric');
  form.appendChild(labelled('Age', age));

  var bandNote = el('p', 'field-note', '');
  function updateNote() {
    var b = bandForAge(parseInt(age.value, 10) || 6);
    bandNote.textContent = BAND_INFO[b].label + ' — ' +
      (BAND_INFO[b].maxWords === 0 ? 'questions are pictures and sound, with no reading' :
       'questions are read aloud and kept short');
  }
  age.addEventListener('input', updateNote);
  updateNote();
  form.appendChild(bandNote);
  root.appendChild(form);

  var pickWrap = section('Pick a racer');
  var grid = el('div', 'racer-grid');
  var chosen = RACERS[0].id;
  RACERS.forEach(function (r) {
    var b = el('button', 'racer-opt' + (r.id === chosen ? ' is-on' : ''));
    b.type = 'button';
    b.appendChild(avatarNode(r.id, 52));
    b.appendChild(el('span', 'racer-name', r.name));
    b.addEventListener('click', function () {
      chosen = r.id;
      var all = grid.querySelectorAll('.racer-opt');
      for (var i = 0; i < all.length; i++) all[i].className = 'racer-opt';
      b.className = 'racer-opt is-on';
    });
    grid.appendChild(b);
  });
  pickWrap.appendChild(grid);
  root.appendChild(pickWrap);

  root.appendChild(button('Start playing', 'btn btn-big btn-go', function () {
    var id = Users.createUser(name.value || 'Player', parseInt(age.value, 10) || 6, chosen);
    // Adding a second player mid-setup must not hijack whose device this is.
    if (opts && opts.back) return nav.go(opts.back, opts);
    Users.setActiveUserId(id);
    nav.go('home');
  }));
  return root;
}

export function removeUserScreen(nav) {
  var root = el('div', 'screen');
  root.appendChild(topbar('Remove a player', function () { nav.go('profiles'); }));
  root.appendChild(el('p', 'field-note', 'This deletes that player’s progress on this device. It cannot be undone.'));
  var list = section();
  Users.listUsers().forEach(function (u) {
    list.appendChild(button('Remove ' + u.name, 'btn btn-danger', function () {
      Users.deleteUser(u.id);
      nav.go('profiles');
    }));
  });
  root.appendChild(list);
  return root;
}

function labelled(text, field) {
  var w = el('label', 'field-row');
  w.appendChild(el('span', 'field-label', text));
  w.appendChild(field);
  return w;
}

/* ── Library: which modules this child plays ─────────────────────────── */

export function libraryScreen(nav) {
  var user = Users.getActiveUser();
  var settings = loadSettings(user.id, user.band);
  var root = el('div', 'screen');
  root.appendChild(topbar('Modules', function () { nav.go('home'); }));
  root.appendChild(el('p', 'field-note',
    'Chosen for ' + user.name + '\u2019s age. You can add a harder one if they are ready for a stretch.'));

  var offered = modulesForBand(user.band);
  var defaults = defaultModuleIds(user.band);
  var mine = offered.filter(function (m) { return moduleFit(m, user.band) === 'exact'; });
  var harder = offered.filter(function (m) { return moduleFit(m, user.band) === 'stretch'; });

  function group(title, list, note) {
    if (!list.length) return;
    var s = section(title);
    if (note) s.appendChild(el('p', 'field-note', note));
    list.forEach(function (m) { s.appendChild(moduleRow(m, settings, defaults, user)); });
    root.appendChild(s);
  }

  group('For ' + user.name, mine, null);
  group('Harder', harder,
    'Written for older children. Off unless you turn one on \u2014 the game will still only ask ' +
    user.name + ' the parts of it they can do.');

  if (!mine.length && !harder.length) {
    root.appendChild(el('p', 'field-note', 'No modules match this age band yet.'));
  }

  root.appendChild(button('Back to just their age', 'link-btn', function () {
    var s2 = loadSettings(user.id, user.band);
    s2.modules = null;
    saveSettings(s2, user.id);
    nav.go('library');
  }));
  return root;
}

function moduleRow(m, settings, defaults, user) {
  var row = el('div', 'mod-row');
  var on = moduleEnabled(settings, m.id, defaults);
  var toggle = el('button', 'mod-toggle' + (on ? ' is-on' : ''));
  toggle.type = 'button';
  toggle.setAttribute('role', 'switch');
  toggle.setAttribute('aria-checked', on ? 'true' : 'false');
  toggle.setAttribute('aria-label', m.title);

  var body = el('div', 'mod-body');
  body.appendChild(el('h3', 'mod-title', m.title));
  if (m.subtitle) body.appendChild(el('p', 'mod-sub', m.subtitle));
  var meta = el('p', 'mod-meta');
  meta.appendChild(el('span', null, m.items + ' questions'));
  meta.appendChild(el('span', 'mod-dot', ' \u00b7 '));
  meta.appendChild(el('span', null, '~' + m.estimatedMinutes + ' min'));
  if (!m.verified) {
    // An unverified module still earns track distance, but must never move
    // the ability estimate \u2014 an AI-written question can be plain wrong.
    meta.appendChild(el('span', 'mod-dot', ' \u00b7 '));
    meta.appendChild(el('span', 'mod-flag', 'not checked yet'));
  }
  body.appendChild(meta);

  toggle.addEventListener('click', function () {
    settings = toggleModule(m.id, defaults, user.id);
    var nowOn = moduleEnabled(settings, m.id, defaults);
    toggle.className = 'mod-toggle' + (nowOn ? ' is-on' : '');
    toggle.setAttribute('aria-checked', nowOn ? 'true' : 'false');
    row.className = 'mod-row' + (nowOn ? '' : ' is-off');
  });
  row.className = 'mod-row' + (on ? '' : ' is-off');
  row.appendChild(body);
  row.appendChild(toggle);
  return row;
}

/* ── Settings ────────────────────────────────────────────────────────── */

export function settingsScreen(nav) {
  var user = Users.getActiveUser();
  var settings = loadSettings(user.id, user.band);
  var root = el('div', 'screen');
  root.appendChild(topbar('Settings', function () { Music.stop(); nav.go('home'); }));

  var s1 = section(user.name);
  ['audio', 'reducedMotion', 'bigText', 'teachAssist'].forEach(function (key) {
    s1.appendChild(toggleRow(key, settings, user.id));
  });
  root.appendChild(s1);

  var s2 = section('Age band');
  var sel = el('select', 'field');
  BANDS.forEach(function (b) {
    var o = el('option', null, BAND_INFO[b].label + ' (' + BAND_INFO[b].ages[0] + '–' + BAND_INFO[b].ages[1] + ')');
    o.value = b;
    if (b === user.band) o.selected = true;
    sel.appendChild(o);
  });
  sel.addEventListener('change', function () { Users.updateUser(user.id, { band: sel.value }); });
  s2.appendChild(sel);
  s2.appendChild(el('p', 'field-note',
    'Age band decides how a question is ASKED — pictures and sound, or reading. How HARD the questions are is worked out separately, from how ' + user.name + ' actually does.'));
  root.appendChild(s2);

  root.appendChild(soundSection());

  var s3 = section('Speed');
  s3.appendChild(toggleRow('fastLane', settings, user.id));
  root.appendChild(s3);

  var fam = section('Family devices');
  fam.appendChild(el('p', 'field-note',
    'Devices with the same family code swap progress whenever they meet in a game, so a child can play on the tablet on Tuesday and the phone on Thursday. Nobody else’s device ever sees it.'));
  var codeRow = el('div', 'family-code-row');
  codeRow.appendChild(el('span', 'family-code-label', 'This device’s family code'));
  codeRow.appendChild(el('span', 'family-code', familyCode()));
  fam.appendChild(codeRow);
  fam.appendChild(button('Join another device’s family', 'btn btn-quiet', function () {
    if (!Users.parentGate()) return;
    var code = window.prompt('Type the family code shown on the other device:');
    if (!code) return;
    try {
      joinFamily(code);
      window.alert('Done. The next time these devices meet in a game, they will catch each other up.');
      nav.go('settings');
    } catch (e) { window.alert(e.message); }
  }));
  root.appendChild(fam);

  var s4 = section('Grown-ups');
  s4.appendChild(button('Progress report', 'btn btn-quiet', function () { nav.go('report'); }));
  s4.appendChild(button('Erase everything on this device', 'btn btn-danger', function () {
    if (!Users.parentGate()) return;
    if (!window.confirm('Erase all players and all progress on this device?')) return;
    nav.wipe();
  }));
  root.appendChild(s4);
  return root;
}

/**
 * Sound lives in its own section with a real slider, because "is there a
 * volume control and where is it" is the first thing a parent asks. The
 * default is six percent and the slider tops out at fifty: nothing in this
 * app should ever need to be talked over.
 */
export function soundSection() {
  var p = Music.getPrefs();
  var s = section('Sound');

  var musicRow = el('div', 'toggle-row');
  var musicBody = el('div', 'toggle-body');
  musicBody.appendChild(el('span', 'toggle-label', 'Music'));
  musicBody.appendChild(el('p', 'toggle-note', 'Quiet by default. Off is fine too.'));
  musicRow.appendChild(musicBody);
  var musicOn = p.musicOn;
  var mt = el('button', 'mod-toggle' + (musicOn ? ' is-on' : ''));
  mt.type = 'button'; mt.setAttribute('role', 'switch'); mt.setAttribute('aria-checked', musicOn ? 'true' : 'false');
  mt.setAttribute('aria-label', 'Music');
  mt.addEventListener('click', function () {
    musicOn = Music.setMusicOn(!musicOn);
    mt.className = 'mod-toggle' + (musicOn ? ' is-on' : '');
    mt.setAttribute('aria-checked', musicOn ? 'true' : 'false');
    vol.style.opacity = musicOn ? '1' : '.4';
  });
  musicRow.appendChild(mt);
  s.appendChild(musicRow);

  var vol = slider({
    label: 'Music volume',
    min: 0, max: Math.round(Music.MAX_VOLUME * 100), step: 1,
    value: Math.round(p.musicVolume * 100),
    format: function (v) { return v + '%'; },
    onInput: function (v) {
      Music.setMusicVolume(v / 100);
      // Let them hear the level they are setting.
      if (musicOn) Music.play(Music.trackForSeed(1));
    }
  });
  vol.className = 'slider-row volume-row';
  vol.style.opacity = musicOn ? '1' : '.4';
  s.appendChild(vol);

  var fxRow = el('div', 'toggle-row');
  var fxBody = el('div', 'toggle-body');
  fxBody.appendChild(el('span', 'toggle-label', 'Sound effects'));
  fxBody.appendChild(el('p', 'toggle-note', 'Ticks, chimes and the countdown. Never a buzzer.'));
  fxRow.appendChild(fxBody);
  var fxOn = p.soundOn;
  var ft = el('button', 'mod-toggle' + (fxOn ? ' is-on' : ''));
  ft.type = 'button'; ft.setAttribute('role', 'switch'); ft.setAttribute('aria-checked', fxOn ? 'true' : 'false');
  ft.setAttribute('aria-label', 'Sound effects');
  ft.addEventListener('click', function () {
    fxOn = Music.setSoundOn(!fxOn);
    ft.className = 'mod-toggle' + (fxOn ? ' is-on' : '');
    ft.setAttribute('aria-checked', fxOn ? 'true' : 'false');
    if (fxOn) Sfx.play('correct');
  });
  fxRow.appendChild(ft);
  s.appendChild(fxRow);
  return s;
}

function toggleRow(key, settings, userId) {
  var row = el('div', 'toggle-row');
  var body = el('div', 'toggle-body');
  body.appendChild(el('span', 'toggle-label', SETTING_LABELS[key] || key));
  if (SETTING_NOTES[key]) body.appendChild(el('p', 'toggle-note', SETTING_NOTES[key]));
  row.appendChild(body);
  var on = settings[key] !== false && settings[key] !== undefined ? !!settings[key] : false;
  var t = el('button', 'mod-toggle' + (on ? ' is-on' : ''));
  t.type = 'button';
  t.setAttribute('role', 'switch');
  t.setAttribute('aria-checked', on ? 'true' : 'false');
  t.setAttribute('aria-label', SETTING_LABELS[key] || key);
  t.addEventListener('click', function () {
    on = !on;
    setSetting(key, on, userId);
    t.className = 'mod-toggle' + (on ? ' is-on' : '');
    t.setAttribute('aria-checked', on ? 'true' : 'false');
  });
  row.appendChild(t);
  return row;
}

/* ── Parent report ───────────────────────────────────────────────────── */

export function reportScreen(nav) {
  var root = el('div', 'screen');
  root.appendChild(topbar('Progress', function () { nav.go('settings'); }));
  var st = logState();
  Users.listUsers().forEach(function (u) {
    var s = section(u.name);
    var data = st.users[u.id];
    if (!data || !data.totals.answered) { s.appendChild(el('p', 'field-note', 'No games yet.')); root.appendChild(s); return; }
    var known = 0, recovered = 0, working = 0;
    for (var id in data.items) {
      if (isMastered(data.items[id])) known++;
      else working++;
      if (isRecovered(data.items[id])) recovered++;
    }
    var t = el('table', 'report');
    t.appendChild(reportRow('Questions answered', data.totals.answered));
    t.appendChild(reportRow('Right first time', data.totals.firstTry));
    t.appendChild(reportRow('Mistakes turned into knows', recovered));
    t.appendChild(reportRow('Things known', known));
    t.appendChild(reportRow('Still working on', working));
    t.appendChild(reportRow('Sessions', data.sessions.length));
    s.appendChild(t);
    s.appendChild(el('p', 'field-note',
      'The questions that matter most are the ones that come back a day or two later. Those are the ones that stick.'));
    root.appendChild(s);
  });
  return root;
}

function reportRow(label, value) {
  var tr = el('tr');
  tr.appendChild(el('td', 'report-label', label));
  tr.appendChild(el('td', 'report-value', String(value)));
  return tr;
}
