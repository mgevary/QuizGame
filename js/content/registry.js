/**
 * registry.js — loads the manifest and modules, and resolves the pool of
 * items a given child may be served.
 *
 * Modules are fetched once and cached in memory; the service worker holds the
 * bytes, so a second visit is offline. Nothing here decides WHAT to serve —
 * that is learn/session.js. This only decides what EXISTS.
 */

import { bandAtLeast, bandAllowsType } from './bands.js';
import { moduleEnabled } from '../settings/settings.js';

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

/** Every module whose bands overlap this child's, newest version wins. */
export function modulesForBand(band) {
  if (!index) return [];
  return index.modules.filter(function (m) {
    for (var i = 0; i < m.bands.length; i++) {
      // A module suits a child if they are at or past its lowest band. An
      // older child playing an easier module is fine — the ability model will
      // simply serve them the harder items in it.
      if (bandAtLeast(band, m.bands[i])) return true;
    }
    return false;
  });
}

export function chosenModuleIds(settings, band) {
  var suited = modulesForBand(band).map(function (m) { return m.id; });
  return suited.filter(function (id) { return moduleEnabled(settings, id); });
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
