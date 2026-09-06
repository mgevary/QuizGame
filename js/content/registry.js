/**
 * registry.js — loads the manifest and modules, and resolves the pool of
 * items a given child may be served.
 *
 * Modules are fetched once and cached in memory; the service worker holds the
 * bytes, so a second visit is offline. Nothing here decides WHAT to serve —
 * that is learn/session.js. This only decides what EXISTS.
 */

import { bandAtLeast, bandAllowsType, bandIndex } from './bands.js';

var index = null;
var modules = {};       // id -> module
var loading = {};

export function getIndex() { return index; }

export function loadIndex() {
  if (index) return Promise.resolve(index);
  return fetch('content/index.json', { cache: 'no-cache' })
    .then(function (r) { if (!r.ok) throw new Error('no content index'); return r.json(); })
    .then(function (j) { index = j; return j; });
}

export function loadModule(id) {
  if (modules[id]) return Promise.resolve(modules[id]);
  if (loading[id]) return loading[id];
  var entry = null;
  for (var i = 0; i < (index ? index.modules : []).length; i++) if (index.modules[i].id === id) entry = index.modules[i];
  if (!entry) return Promise.reject(new Error('unknown module ' + id));
  loading[id] = fetch('content/' + entry.url, { cache: 'no-cache' })
    .then(function (r) { return r.json(); })
    .then(function (m) { modules[id] = m; delete loading[id]; return m; });
  return loading[id];
}

export function loadModules(ids) {
  return Promise.all(ids.map(loadModule));
}

/**
 * How a module sits against a child's band.
 *
 *   'exact'   — written for them. On by default.
 *   'stretch' — written for someone older. Offered, off by default, so a
 *               parent can reach for it deliberately.
 *   'below'   — written for someone younger. NOT offered at all: spending an
 *               eight-year-old's session on "where is the cat" is not gentle,
 *               it is a waste of the one thing they will not give you twice.
 *
 * A module declares every band it suits, so a maths pack of templates that
 * genuinely scales can claim G2 through G6 and be exact for all of them.
 */
export function moduleFit(m, band) {
  var idx = bandIndex(band);
  var lo = Infinity, hi = -Infinity;
  for (var i = 0; i < m.bands.length; i++) {
    var b = bandIndex(m.bands[i]);
    if (b < lo) lo = b;
    if (b > hi) hi = b;
    if (b === idx) return 'exact';
  }
  if (lo > idx) return 'stretch';
  return 'below';
}

/** Everything a child may be offered: their own level, plus harder. */
export function modulesForBand(band) {
  if (!index) return [];
  return index.modules.filter(function (m) { return moduleFit(m, band) !== 'below'; });
}

/** What is switched on for a child who has never touched the settings. */
export function defaultModuleIds(band) {
  return modulesForBand(band)
    .filter(function (m) { return moduleFit(m, band) === 'exact'; })
    .map(function (m) { return m.id; });
}

export function chosenModuleIds(settings, band) {
  // No explicit choice means "the ones written for them", not "everything".
  if (!settings.modules) return defaultModuleIds(band);
  var offered = modulesForBand(band).map(function (m) { return m.id; });
  return offered.filter(function (id) { return settings.modules.indexOf(id) !== -1; });
}

/**
 * Flatten loaded modules into a pool of playable items, with module context
 * attached. `hidden` items stay in `byId` (so prove-it can find them) but are
 * filtered out of `pool` by the picker.
 */
export function buildPool(mods, band) {
  var pool = [], byId = {}, defaults = {}, parents = {};
  for (var i = 0; i < mods.length; i++) {
    var mod = mods[i];
    var d = mod.defaults || {};
    for (var k in (mod.parents || {})) parents[k] = mod.parents[k];
    defaults[mod.id] = mod.remediationDefaults || {};
    for (var j = 0; j < mod.items.length; j++) {
      var raw = mod.items[j];
      var item = {};
      for (var f in raw) item[f] = raw[f];
      item.type = item.type || d.type;
      item.skill = item.skill || d.skill;
      item.band = item.band || d.band;
      if (item.difficulty === undefined) item.difficulty = d.difficulty;
      item.mod = mod.id;
      item.mediaBase = mod.media && mod.media.baseUrl ? 'content/' + mod.media.baseUrl.replace(/^\.\//, '') : null;
      // Namespace ids across modules so two modules can both use "i1".
      item.id = mod.id + '/' + item.id;
      if (item.variants) item.variants = item.variants.map(function (v) { return mod.id + '/' + v; });
      if (item.remediation && item.remediation.proveIt) {
        item.remediation = JSON.parse(JSON.stringify(item.remediation));
        item.remediation.proveIt = { ref: mod.id + '/' + item.remediation.proveIt.ref };
      }
      byId[item.id] = item;
      if (!item.hidden && bandAllowsType(band, item.type)) pool.push(item);
    }
  }
  return { pool: pool, byId: byId, remediationDefaults: defaults, parents: parents };
}

/** The module-level teach ladder for an item, if it has one. */
export function defaultsFor(bundle, item) {
  return bundle.remediationDefaults[item.mod] || {};
}
