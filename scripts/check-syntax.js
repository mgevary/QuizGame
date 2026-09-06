/**
 * check-syntax.js — guards the Safari 12 baseline. The shipped JS must parse
 * on an old iPad, so this scans for syntax and APIs that would throw there:
 * optional chaining, nullish coalescing, class fields, and friends.
 *
 * Vendor bundles are exempt — they ship their own compatibility story.
 */
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SKIP = ['node_modules', 'js/vendor', '.git', 'scripts', 'test', 'audio', '.port', 'worker', 'content'];

// The layering rule (docs/ARCHITECTURE.md): PURE modules may import only other
// PURE modules. A pure file that pulls in the DOM or storage layer silently
// stops being unit-testable, so this is enforced here rather than by review.
const PURE = [
  'js/sync/hlc.js', 'js/sync/event.js', 'js/sync/fold.js', 'js/sync/merge.js',
  'js/content/bands.js', 'js/content/skills.js', 'js/content/validate.js',
  // pictures.js only builds SVG strings — no DOM, so the validator may use it
  // to check that an item names an illustration that actually exists.
  'js/ui/pictures.js',
  'js/content/templates.js', 'js/content/rng.js',
  'js/learn/ability.js', 'js/learn/scheduler.js', 'js/learn/session.js', 'js/learn/remediation.js',
  'js/track/model.js', 'js/mission/model.js', 'js/net/coordinator.js'
];
const PURE_SET = new Set(PURE);

const BANNED = [
  { re: /\?\./g, name: 'optional chaining (?.)' },
  { re: /\?\?/g, name: 'nullish coalescing (??)' },
  { re: /\|\|=|&&=|\?\?=/g, name: 'logical assignment' },
  { re: /\bstatic\s+\{/g, name: 'static init block' },
  { re: /\.at\(/g, name: 'Array.prototype.at' },
  { re: /\.replaceAll\(/g, name: 'String.replaceAll' },
  { re: /Object\.hasOwn\(/g, name: 'Object.hasOwn' },
  { re: /\.flatMap\(/g, name: 'Array.flatMap' },
  { re: /globalThis/g, name: 'globalThis' },
  { re: /this\.#[a-zA-Z_]\w*|^\s*#[a-zA-Z_]\w*\s*[=;(]/gm, name: 'private class field' },
  { re: /\bBigInt\b|\d+n\b/g, name: 'BigInt' }
];

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    const rel = path.relative(ROOT, full);
    if (SKIP.some(s => rel === s || rel.startsWith(s + path.sep))) continue;
    if (entry.isDirectory()) walk(full, out);
    else if (entry.name.endsWith('.js')) out.push(full);
  }
  return out;
}

/**
 * Actually parse the file. A grep-only check once passed a ternary with no
 * else branch, which took the whole app down in the browser with nothing but
 * "Unexpected token )" to go on — so every shipped file is parsed here.
 *
 * SourceTextModule needs --experimental-vm-modules, so when it is missing we
 * strip the import/export keywords and parse the remainder as a script, which
 * catches every syntax error that matters.
 */
function parseModule(src, rel) {
  try {
    if (vm.SourceTextModule) { new vm.SourceTextModule(src, { identifier: rel }); return null; }
  } catch (e) { return e.message; }
  const asScript = src
    .replace(/^\s*import[\s\S]*?from\s+['"][^'"]+['"];?\s*$/gm, '')
    .replace(/^\s*import\s+['"][^'"]+['"];?\s*$/gm, '')
    .replace(/\bexport\s+default\b/g, 'void 0,')
    .replace(/\bexport\s+/g, '');
  try { new vm.Script(asScript, { filename: rel }); return null; }
  catch (e) { return e.message; }
}

let problems = 0;
for (const file of walk(ROOT)) {
  const src = fs.readFileSync(file, 'utf8');
  const rel = path.relative(ROOT, file);

  // PARSE it, don't just grep it. A grep-only check happily passed a ternary
  // with no else branch, which took the whole app down in the browser with
  // nothing but "Unexpected token )" to go on.
  const parseError = parseModule(src, rel);
  if (parseError) { console.log(`  ${rel}: ${parseError}`); problems++; continue; }
  // Strip comments and strings so a mention in prose isn't a false positive.
  const code = src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1')
    .replace(/'(?:[^'\\]|\\.)*'/g, "''")
    .replace(/"(?:[^"\\]|\\.)*"/g, '""')
    .replace(/`(?:[^`\\]|\\.)*`/g, '``')
    // Regex literals would otherwise look like banned syntax (a /#a=/ pattern
    // reads as a private field). Blank their bodies, keeping the delimiters.
    .replace(/([=(,:[!&|?{};]\s*)\/(?![*/])(?:[^/\\\n[]|\\.|\[(?:[^\]\\]|\\.)*\])+\/[gimsuy]*/g, '$1/RE/');
  for (const { re, name } of BANNED) {
    re.lastIndex = 0;
    const m = code.match(re);
    if (m) {
      console.log(`  ${rel}: ${name} (${m.length}x)`);
      problems += m.length;
    }
  }

  if (PURE_SET.has(rel.split(path.sep).join('/'))) {
    // Resolve every static import against the repo and demand it is also pure.
    const importRe = /^\s*import\s+(?:[\s\S]*?\s+from\s+)?['"]([^'"]+)['"]/gm;
    let im;
    while ((im = importRe.exec(src))) {
      const target = path.relative(ROOT, path.resolve(path.dirname(file), im[1])).split(path.sep).join('/');
      if (!PURE_SET.has(target)) {
        console.log(`  ${rel}: pure module imports non-pure ${target}`);
        problems++;
      }
    }
    // And no ambient browser/storage globals either.
    const globalsRe = /\b(document|window|localStorage|navigator|fetch|XMLHttpRequest|WebSocket|RTCPeerConnection)\b/g;
    const g = code.match(globalsRe);
    if (g) {
      console.log(`  ${rel}: pure module references ${[...new Set(g)].join(', ')}`);
      problems += g.length;
    }
  }
}

if (problems === 0) console.log('Safari 12 syntax + layering check: clean.');
else { console.log(`\n${problems} incompatible construct(s) found.`); process.exitCode = 1; }
