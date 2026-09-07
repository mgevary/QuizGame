/**
 * mobiletest.mjs — play on a phone, with a finger, and complain about
 * everything that is wrong for a phone.
 *
 * iPhone-sized viewport, touch events rather than mouse, and after every
 * transition it checks the things a desktop test never notices: did the page
 * stay scrolled down, is anything wider than the screen, did a tap leave a
 * highlight behind, is the thing you need to tap actually on screen.
 */
import { chromium, devices } from 'playwright';
import { spawn } from 'node:child_process';
import { LAUNCH, silenceSpeech } from './testenv.mjs';

const server = spawn('node', ['scripts/serve.mjs'], { stdio: 'ignore' });
await new Promise(r => setTimeout(r, 700));
const browser = await chromium.launch(LAUNCH);
const problems = [];
const note = (s) => { problems.push(s); console.log('  ! ' + s); };

const phone = devices['iPhone 13'];
const context = await browser.newContext({ ...phone, deviceScaleFactor: 2 });
await silenceSpeech(context);
const page = await context.newPage();
page.on('pageerror', e => note('pageerror: ' + e.message));

async function audit(label, fresh) {
  const r = await page.evaluate(() => ({
    scrollY: window.scrollY,
    overflowX: document.documentElement.scrollWidth - window.innerWidth,
    stale: document.querySelectorAll('.q-opt.is-chosen, .q-opt.is-right, .q-opt.is-wrong').length,
    hasQ: !!document.querySelector('.card-q'),
    card: (document.querySelector('.play-stage > .card') || {}).className || 'none',
    firstOptTop: (() => { const o = document.querySelector('.q-opt, .q-tile, .q-countable, .card-teach .btn, .card-boost .btn, .card-handover .btn'); return o ? Math.round(o.getBoundingClientRect().top) : null; })(),
    lastOptBottom: (() => { const os = document.querySelectorAll('.q-opt, .q-tile, .q-countable'); const o = os[os.length - 1]; return o ? Math.round(o.getBoundingClientRect().bottom) : null; })(),
    vh: window.innerHeight
  }));
  if (r.overflowX > 0) note(label + ': page is ' + r.overflowX + 'px wider than the screen');
  if (fresh && r.hasQ && r.stale) note(label + ': a fresh question shows ' + r.stale + ' option(s) still marked chosen/right/wrong');
  if (fresh && r.hasQ && r.scrollY > 40) note(label + ': new question but the page is still scrolled ' + r.scrollY + 'px down');
  if (r.firstOptTop !== null && r.firstOptTop > r.vh) note(label + ': the first thing to tap is below the fold (' + r.firstOptTop + ' > ' + r.vh + ')');
  return r;
}

const tap = async (sel) => { const el = page.locator(sel).first(); await el.scrollIntoViewIfNeeded(); await el.tap(); };

try {
  await page.goto('http://localhost:8321/', { waitUntil: 'networkidle' });
  await page.waitForSelector('.field');
  await audit('new-player');
  await page.fill('input[type=text]', 'Pip'); await page.fill('input[type=number]', '7');
  await tap('.btn:has-text("Start playing")');
  await page.waitForSelector('.lobby-hi');
  await audit('lobby');
  await page.screenshot({ path: 'shots/m-01-lobby.png' });

  await tap('.btn:has-text("Play on my own")');
  await page.waitForSelector('.card-q', { timeout: 15000 });
  await page.waitForTimeout(300);
  await audit('first-question', true);
  await page.screenshot({ path: 'shots/m-02-question.png' });

  // Scroll to the bottom option, tap it, and see what the NEXT question does.
  let seen = 0, transitions = 0;
  for (let i = 0; i < 40 && seen < 8; i++) {
    const cls = await page.evaluate(() => (document.querySelector('.play-stage > .card') || {}).className || '');
    if (/card-boost/.test(cls)) { await tap('.card-boost .btn'); await page.waitForTimeout(500); continue; }
    if (/card-checkpoint/.test(cls)) { await tap('.card-checkpoint .btn'); await page.waitForTimeout(500); continue; }
    if (/card-teach/.test(cls)) { await tap('.card-teach .btn'); await page.waitForTimeout(400); continue; }
    if (!/card-q/.test(cls)) { await page.waitForTimeout(250); continue; }

    seen++;
    const opts = page.locator('.q-opt:not([disabled])');
    const n = await opts.count();
    if (n) {
      // Always the LAST option: it forces a scroll on a phone, which is the
      // case that leaks. Then wait for the next card and audit it.
      const before = await page.evaluate(() => document.querySelector('.play-stage > .card'));
      await opts.nth(n - 1).scrollIntoViewIfNeeded();
      const y = await page.evaluate(() => window.scrollY);
      await opts.nth(n - 1).tap();
      await page.waitForTimeout(200);
      const mid = await audit('after-tap-' + seen, false);
      if (!mid.stale) note('after-tap-' + seen + ': the tapped option was not marked at all');
      // Wait for the card to be replaced.
      await page.waitForFunction((prevY) => !document.querySelector('.q-opt.is-chosen') && document.querySelector('.play-stage > .card'), y, { timeout: 8000 }).catch(() => {});
      await page.waitForTimeout(1400);
      transitions++;
      const after = await audit('next-after-' + seen, true);
      if (transitions === 1) await page.screenshot({ path: 'shots/m-03-after-transition.png' });
      const residue = await page.evaluate(() => {
        const opts = [...document.querySelectorAll('.q-opt')];
        const line = getComputedStyle(document.documentElement).getPropertyValue('--line').trim();
        return opts.filter(o => { const b = getComputedStyle(o).borderTopColor; return o.matches(':hover') && !o.disabled; }).length;
      });
      if (residue) note('next-after-' + seen + ': ' + residue + ' option(s) on the new card carry a hover highlight from the last tap');
    } else if (await page.locator('.q-tile').count()) {
      const cur = await page.evaluate(() => window.__quiz.current);
      const units = cur.wordTiles ? cur.answer.split(/\s+/) : cur.answer.split('');
      for (const u of units) { const t = page.locator('.q-tile', { hasText: new RegExp('^' + u.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$') }).first(); if (await t.count()) { await t.tap(); await page.waitForTimeout(60); } }
      await page.waitForTimeout(1400);
      await audit('next-after-tiles-' + seen, true);
    } else if (await page.locator('.q-countable').count()) {
      for (let t = 0; t < 25; t++) { const todo = page.locator('.q-countable:not(.is-counted)'); if (!(await todo.count())) break; await todo.first().tap(); await page.waitForTimeout(40); }
      if (await page.locator('.q-options .q-opt:not([disabled])').count()) await tap('.q-options .q-opt:not([disabled])');
      await page.waitForTimeout(1400);
      await audit('next-after-count-' + seen, true);
    } else { await page.waitForTimeout(300); }
  }
  if (transitions < 3) note('only ' + transitions + ' question transitions were exercised');

  // The sound sheet must not push the game off screen.
  await tap('.play-top .icon-btn[aria-label="Sound and music"]');
  await page.waitForTimeout(200);
  await audit('sound-sheet-open');
  await page.screenshot({ path: 'shots/m-04-sound.png' });
  await tap('.play-top .icon-btn[aria-label="Sound and music"]');

  await tap('.play-top .icon-btn[aria-label="End this game"]');
  await page.waitForSelector('.card-result', { timeout: 8000 });
  await page.waitForTimeout(600);
  await audit('results');
  await page.screenshot({ path: 'shots/m-05-results.png' });
} catch (e) {
  note('harness: ' + e.message);
} finally {
  await browser.close(); server.kill();
}
console.log(problems.length ? '\n' + problems.length + ' problem(s) on a phone' : '\nmobile ok');
process.exitCode = problems.length ? 1 : 0;
