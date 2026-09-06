/**
 * validate-modules.mjs — validate every module and rebuild content/index.json.
 *
 * Not optional, and it runs in CI. Unvalidated content will crash a child's
 * game mid-race, and a crash mid-race is unrecoverable trust damage.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateModule } from '../js/content/validate.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIR = path.join(ROOT, 'content', 'modules');
const INDEX = path.join(ROOT, 'content', 'index.json');

const PACKS = [
  { id: 'core', title: 'Starter pack', precache: true,
    modules: ['core.firstwords', 'core.counting', 'core.letters', 'core.math.k', 'core.reading.k'] },
  { id: 'school', title: 'School', precache: false,
    modules: ['core.math.g1', 'core.math.g2', 'core.math.g3', 'core.math.g45',
              'core.reading.g1', 'core.reading.g2', 'core.reading.g3'] }
];

let failed = 0, warned = 0;
const entries = [];

for (const file of fs.readdirSync(DIR).filter(f => f.endsWith('.json')).sort()) {
  const full = path.join(DIR, file);
  let mod;
  try { mod = JSON.parse(fs.readFileSync(full, 'utf8')); }
  catch (e) { console.log('✗ ' + file + ': not valid JSON — ' + e.message); failed++; continue; }

  const { errors, warnings } = validateModule(mod);
  for (const w of warnings) { console.log('  ! ' + mod.id + ': ' + w); warned++; }
  if (errors.length) {
    failed++;
    console.log('✗ ' + file);
    for (const e of errors.slice(0, 12)) console.log('    ' + e);
    if (errors.length > 12) console.log('    …and ' + (errors.length - 12) + ' more');
    continue;
  }

  // Media must exist on disk, or a child sees a broken picture mid-race.
  const missing = [];
  const base = mod.media && mod.media.baseUrl ? path.join(ROOT, 'content', mod.media.baseUrl.replace(/^\.\//, '')) : null;
  const walk = (o) => {
    if (!o || typeof o !== 'object') return;
    if (typeof o.image === 'string' && base && !fs.existsSync(path.join(base, o.image))) missing.push(o.image);
    for (const k of Object.keys(o)) walk(o[k]);
  };
  walk(mod);
  if (missing.length) { failed++; console.log('✗ ' + file + ': missing media ' + [...new Set(missing)].join(', ')); continue; }

  const visible = mod.items.filter(i => !i.hidden).length;
  const hasAudio = JSON.stringify(mod).includes('"audio"');
  entries.push({
    id: mod.id, title: mod.title, subtitle: mod.subtitle || '',
    url: 'modules/' + file,
    bands: mod.bands, strands: [...new Set(mod.items.map(i => (i.skill || (mod.defaults || {}).skill || '').split('.')[0]))].filter(Boolean),
    items: visible, version: mod.version,
    bytes: fs.statSync(full).size, hasAudio,
    verified: mod.verified === true,
    estimatedMinutes: mod.estimatedMinutes || Math.max(3, Math.round(visible / 4))
  });
  console.log('✓ ' + mod.id + '  ' + visible + ' items, ' + mod.bands.join('/'));
}

if (failed) { console.log('\n' + failed + ' module(s) failed validation.'); process.exitCode = 1; }
else {
  const byId = Object.fromEntries(entries.map(e => [e.id, e]));
  const packs = PACKS.map(p => ({ ...p, modules: p.modules.filter(m => byId[m]) }));
  const index = { schema: 'quizquest.index/1', updated: new Date().toISOString().slice(0, 10), modules: entries, packs };
  fs.writeFileSync(INDEX, JSON.stringify(index, null, 1) + '\n');
  const total = entries.reduce((s, e) => s + e.items, 0);
  console.log('\n' + entries.length + ' modules, ' + total + ' items' + (warned ? ', ' + warned + ' warning(s)' : '') + '. index.json rebuilt.');
}
