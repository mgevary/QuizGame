/**
 * validate.js — module and item validation. PURE, and shared by the browser
 * and by scripts/validate-modules.mjs so CI and the app agree exactly.
 *
 * Validation catches STRUCTURE, never SEMANTICS. An AI-written module can
 * pass every check here and still have a wrong answer — which is why modules
 * carry a `verified` flag, why there is a parent-preview mode, and why a
 * child can flag a broken question. Do not let a green validator imply the
 * content is correct.
 *
 * A crash mid-race is unrecoverable trust damage, so the rule is: anything
 * that could throw at play time must fail here instead.
 */

import { validateSkillId, isCustom, isAncestorOrSelf } from './skills.js';
import { BAND_INFO, isBand, wordCount, bandAllowsType } from './bands.js';
import { isGenerator, CONSTRAINTS } from './templates.js';
import { hasPicture } from '../ui/pictures.js';
import { RUNG_KINDS, isHigherProduction } from '../learn/remediation.js';

export var ITEM_TYPES = ['mcq', 'tap-image', 'listen', 'assemble', 'count', 'trace', 'template'];
export var GRADABLE = { mcq: true, 'tap-image': true, listen: true, assemble: true, count: true, trace: true, template: true };

var MODULE_ID = /^[a-z0-9][a-z0-9.-]*$/;
var ITEM_ID = /^[A-Za-z0-9_-]+$/;

function err(list, path, msg) { list.push(path + ': ' + msg); }

/**
 * An option is text (`v`), a named illustration (`art`), or an image file.
 * Exactly one. `art` names an entry in js/ui/pictures.js and is preferred:
 * it ships no bytes, scales to any screen and matches the app's palette.
 */
function checkOption(errors, path, o, needAlt) {
  var forms = 0;
  if (typeof o.v === 'string' && o.v.length) forms++;
  if (typeof o.art === 'string' && o.art.length) forms++;
  if (typeof o.image === 'string' && o.image.length) forms++;
  if (forms !== 1) err(errors, path, 'an option needs exactly one of v, art or image');
  if (typeof o.emoji === 'string') err(errors, path, 'emoji are not used: name an illustration with "art" instead');
  if (o.art && !hasPicture(o.art)) err(errors, path, 'unknown illustration "' + o.art + '"');
  if ((o.art || o.image) && !o.alt) err(errors, path, 'a picture option needs alt text');
  if (needAlt && !o.alt && !o.v) err(errors, path, 'missing alt');
}

function checkOptions(errors, path, item, min, max) {
  var opts = item.options;
  if (!Array.isArray(opts) || opts.length < min) { err(errors, path, 'needs at least ' + min + ' options'); return; }
  if (opts.length > max) err(errors, path, 'more than ' + max + ' options');
  var correct = 0, seen = {};
  for (var i = 0; i < opts.length; i++) {
    checkOption(errors, path + '.options[' + i + ']', opts[i]);
    if (opts[i].correct) correct++;
    var key = String(opts[i].v || opts[i].art || opts[i].image);
    if (seen[key]) err(errors, path, 'duplicate option "' + key + '"');
    seen[key] = true;
  }
  if (correct !== 1) err(errors, path, 'needs exactly one correct option, found ' + correct);
}

/** The answer must be constructible from the tiles, or the item is unplayable. */
export function assembleIsConstructible(tiles, answer, wordTiles) {
  var need = wordTiles ? String(answer).split(/\s+/) : String(answer).split('');
  var pool = (tiles || []).slice();
  for (var i = 0; i < need.length; i++) {
    var at = pool.indexOf(need[i]);
    if (at === -1) return false;
    pool.splice(at, 1);
  }
  return true;
}

export function validateItem(item, mod, errors, byId) {
  var path = (mod.id || '?') + '#' + (item.id || '?');
  if (!item.id || !ITEM_ID.test(item.id)) err(errors, path, 'bad item id');
  var type = item.type || (mod.defaults && mod.defaults.type);
  if (ITEM_TYPES.indexOf(type) === -1) { err(errors, path, 'unknown type "' + type + '"'); return; }

  var skill = item.skill || (mod.defaults && mod.defaults.skill);
  var se = validateSkillId(skill);
  if (se) err(errors, path, se);
  else if (isCustom(skill)) {
    var declared = false;
    for (var k in (mod.parents || {})) if (isAncestorOrSelf(k, skill)) declared = true;
    if (!declared) err(errors, path, 'custom skill "' + skill + '" has no declared parent in module.parents');
  }

  var diff = item.difficulty === undefined ? (mod.defaults && mod.defaults.difficulty) : item.difficulty;
  if (typeof diff !== 'number' || diff < 1 || diff > 10) err(errors, path, 'difficulty must be 1..10');

  var band = item.band || (mod.defaults && mod.defaults.band);
  if (!isBand(band)) err(errors, path, 'unknown band "' + band + '"');
  else {
    if (!bandAllowsType(band, type)) err(errors, path, 'band ' + band + ' does not allow type ' + type);
    var max = BAND_INFO[band].maxWords;
    var words = wordCount(item.prompt && item.prompt.text);
    // A pre-reader cannot read ANY instruction, so a PN prompt must carry its
    // meaning in audio. Text there is for the grown-up alongside, and the
    // renderer hides it — but it must still not be the only channel.
    if (words > max && max > 0) err(errors, path, words + ' prompt words exceeds band ' + band + ' limit of ' + max);
    if (max === 0 && !(item.prompt && (item.prompt.audio || item.prompt.tts))) {
      err(errors, path, 'band ' + band + ' is pre-reading: the prompt needs audio or tts');
    }
  }

  switch (type) {
    case 'mcq': case 'listen': checkOptions(errors, path, item, 2, 4); break;
    case 'tap-image':
      checkOptions(errors, path, item, 2, 4);
      for (var i = 0; i < (item.options || []).length; i++) {
        if (!item.options[i].art && !item.options[i].image) err(errors, path, 'tap-image options must be pictures');
      }
      break;
    case 'assemble':
      if (!Array.isArray(item.tiles) || !item.tiles.length) err(errors, path, 'assemble needs tiles');
      else if (typeof item.answer !== 'string' || !item.answer) err(errors, path, 'assemble needs an answer');
      else if (!assembleIsConstructible(item.tiles, item.answer, item.wordTiles)) {
        err(errors, path, 'answer "' + item.answer + '" cannot be built from its tiles');
      }
      break;
    case 'count':
      if (typeof item.n !== 'number' || item.n < 1 || item.n > 20) err(errors, path, 'count needs n between 1 and 20');
      if (!item.art) err(errors, path, 'count needs an illustration to show');
      else if (!hasPicture(item.art)) err(errors, path, 'unknown illustration "' + item.art + '"');
      if (item.choices && item.choices.indexOf(item.n) === -1) err(errors, path, 'count choices must include n');
      break;
    case 'trace':
      if (!item.glyph && !item.path) err(errors, path, 'trace needs a glyph or a path');
      break;
    case 'template':
      if (!isGenerator(item.gen)) err(errors, path, 'unknown generator "' + item.gen + '"');
      if (item.params && item.params.constraint && CONSTRAINTS.indexOf(item.params.constraint) === -1) {
        err(errors, path, 'unknown constraint "' + item.params.constraint + '"');
      }
      break;
  }

  var rem = item.remediation;
  if (rem) {
    if (rem.ladder) validateLadder(rem.ladder, item, path, errors);
    if (rem.generate) {
      var gt = rem.generate.type;
      if (gt && ITEM_TYPES.indexOf(gt) === -1) err(errors, path, 'generate has unknown type ' + gt);
      // The generate step exists to make the child PRODUCE the answer. If it
      // is no harder to produce than the original, recognition substitutes for
      // recall and the whole remediation loop is decorative.
      // Pre-reading bands are the one principled exception: a PN child cannot
      // type and cannot manage tiles, so no higher-production form EXISTS.
      // A reshuffled re-ask with the target named aloud is the strongest
      // production step available at that age, and refusing it would mean
      // shipping no remediation at all for the youngest children.
      var preReading = band === 'PN' || band === 'N';
      if (gt && type !== 'template' && !preReading && !isHigherProduction(type, gt)) {
        err(errors, path, 'generate type "' + gt + '" is not higher-production than "' + type + '"');
      }
      if (gt === 'assemble' && rem.generate.tiles && rem.generate.answer &&
          !assembleIsConstructible(rem.generate.tiles, rem.generate.answer, rem.generate.wordTiles)) {
        err(errors, path, 'generate answer cannot be built from its tiles');
      }
    }
    if (rem.proveIt && byId && !byId[rem.proveIt.ref]) err(errors, path, 'proveIt.ref "' + rem.proveIt.ref + '" does not resolve');
    if (rem.proveIt && byId && byId[rem.proveIt.ref] && byId[rem.proveIt.ref].skill && skill &&
        byId[rem.proveIt.ref].skill !== skill) {
      err(errors, path, 'proveIt must be at the same skill');
    }
  }
  var vs = item.variants || [];
  for (var v = 0; v < vs.length; v++) if (byId && !byId[vs[v]]) err(errors, path, 'variant "' + vs[v] + '" does not resolve');
}

export function validateLadder(ladder, item, path, errors) {
  if (!Array.isArray(ladder) || !ladder.length) { err(errors, path, 'ladder must be a non-empty array'); return; }
  var last = -1;
  for (var i = 0; i < ladder.length; i++) {
    var rank = RUNG_KINDS.indexOf(ladder[i].kind);
    if (rank === -1) { err(errors, path, 'unknown rung kind "' + ladder[i].kind + '"'); continue; }
    if (rank <= last) err(errors, path, 'ladder rungs must ascend: ' + ladder[i].kind + ' after ' + RUNG_KINDS[last]);
    last = rank;
    // An `example` rung must be an ANALOGOUS item, never the target. If the
    // worked example contains the answer, the generate step becomes copying
    // and the generation effect is destroyed. This is the most common design
    // error in educational apps and it is worth failing a build over.
    if (ladder[i].kind === 'example' && item) {
      var ans = answerTextOf(item);
      if (ans && ans.length > 2 && String(ladder[i].text || '').toLowerCase().indexOf(ans.toLowerCase()) !== -1) {
        err(errors, path, 'the example rung contains the answer "' + ans + '" — it must use an analogous item');
      }
    }
  }
}

export function answerTextOf(item) {
  if (item.answer) return String(item.answer);
  var opts = item.options || [];
  for (var i = 0; i < opts.length; i++) if (opts[i].correct) return String(opts[i].v || opts[i].alt || '');
  return null;
}

/** @returns {{errors: string[], warnings: string[]}} */
export function validateModule(mod) {
  var errors = [], warnings = [];
  if (!mod || typeof mod !== 'object') return { errors: ['not an object'], warnings: [] };
  if (mod.schema !== 'quizquest.module/1') errors.push('schema must be "quizquest.module/1"');
  if (!mod.id || !MODULE_ID.test(mod.id)) errors.push('bad module id');
  if (typeof mod.version !== 'number') errors.push('version must be a number');
  if (!mod.title) errors.push('missing title');
  if (!Array.isArray(mod.bands) || !mod.bands.length) errors.push('bands must be a non-empty array');
  else for (var b = 0; b < mod.bands.length; b++) if (!isBand(mod.bands[b])) errors.push('unknown band ' + mod.bands[b]);
  if (!Array.isArray(mod.items) || !mod.items.length) { errors.push('items must be a non-empty array'); return { errors: errors, warnings: warnings }; }

  var byId = {}, dup = {};
  for (var i = 0; i < mod.items.length; i++) {
    var it = mod.items[i];
    if (!it || !it.id) continue;
    if (byId[it.id]) dup[it.id] = true;
    byId[it.id] = it;
  }
  for (var d in dup) errors.push('duplicate item id "' + d + '"');

  for (var j = 0; j < mod.items.length; j++) validateItem(mod.items[j], mod, errors, byId);

  for (var s in (mod.remediationDefaults || {})) {
    var se2 = validateSkillId(s);
    if (se2) errors.push('remediationDefaults: ' + se2);
    else validateLadder(mod.remediationDefaults[s].ladder, null, mod.id + '#defaults.' + s, errors);
  }

  if (mod.mission) {
    var m = mod.mission;
    if (m.kind === 'goal') {
      if (!m.horizon) errors.push('a goal mission needs a horizon date');
      var sum = 0;
      for (var k = 0; k < (m.domains || []).length; k++) sum += m.domains[k].weight || 0;
      if ((m.domains || []).length && Math.abs(sum - 1) > 0.01) errors.push('mission domain weights sum to ' + sum + ', expected 1');
    }
  }

  var withRem = 0;
  for (var w = 0; w < mod.items.length; w++) if (mod.items[w].remediation || (mod.remediationDefaults || {})[mod.items[w].skill]) withRem++;
  if (withRem < mod.items.length) {
    // Not an error: a module with no remediation is valid and playable, and
    // making good remediation a precondition is how content ecosystems die.
    warnings.push((mod.items.length - withRem) + ' of ' + mod.items.length + ' items fall back to the generic teach ladder');
  }
  return { errors: errors, warnings: warnings };
}
