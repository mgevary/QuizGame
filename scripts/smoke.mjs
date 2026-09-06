/**
 * smoke.mjs — drive the real UI in a real browser: make a player, play a
 * session, get things deliberately wrong, and assert the remediation loop
 * actually runs and the events land in the log.
 *
 * Any console error or page error fails the run. A crash mid-race is
 * unrecoverable trust damage, so this gate is deliberately unforgiving.
 */
import { chromium } from 'playwright';
import { LAUNCH, quietPage } from './testenv.mjs';
import { spawn } from 'node:child_process';

const PORT = 8321;
const base = `http://localhost:${PORT}/`;
const server = spawn('node', ['scripts/serve.mjs'], { stdio: 'ignore' });
await new Promise(r => setTimeout(r, 700));

const errors = [];
let browser;
try {
  browser = await chromium.launch(LAUNCH);
  const page = await quietPage(browser, { viewport: { width: 420, height: 900 } });
  // The room-server probe 404s on a static host, which is how the app learns
  // there is no server. It is the expected answer, not a fault.
  // The room-server probe 404s on a static host, which is how the app learns
  // there is no server. It is the expected answer, not a fault.
  const expected = (m) => /lan\/info/.test((m.location() && m.location().url) || '') || /lan\/info/.test(m.text());
  page.on('console', m => { if (m.type() === 'error' && !expected(m)) errors.push('console: ' + m.text() + ' @ ' + ((m.location() && m.location().url) || '?')); });
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));

  await page.goto(base, { waitUntil: 'networkidle' });

  // New player
  await page.waitForSelector('.field', { timeout: 8000 });
  await page.fill('input[type=text]', 'Smoke');
  await page.fill('input[type=number]', '7');
  await page.click('.racer-opt:nth-child(2)');
  await page.click('text=Start playing');
  await page.waitForSelector('.lobby-hi', { timeout: 5000 });
  const hi = await page.textContent('.lobby-hi');
  if (!/Smoke/.test(hi)) throw new Error('profile not created: ' + hi);

  // The front door must offer a game, not a menu.
  if (!(await page.locator('.mode-card').count())) throw new Error('no game modes on the lobby');
  if (!(await page.locator('.game-list, .field-note').count())) throw new Error('lobby does not report nearby games');

  // Module chooser must list real modules and toggle
  await page.click('text=Modules');
  await page.waitForSelector('.mod-row');
  const mods = await page.locator('.mod-row').count();
  if (mods < 3) throw new Error('expected several modules, saw ' + mods);
  await page.locator('.mod-toggle').first().click();
  const offNow = await page.locator('.mod-row').first().getAttribute('class');
  if (!/is-off/.test(offNow)) throw new Error('module toggle did not switch off');
  await page.locator('.mod-toggle').first().click();
  await page.click('.icon-btn >> nth=0');

  // Play solo, deliberately picking wrong to exercise the teach loop
  await page.click('text=Play on my own');
  await page.waitForSelector('.card-q', { timeout: 10000 });

  // Drive off the LOG, not off click count: one question can cost half a
  // dozen interactions once the teach loop runs, and that is the point.
  const logged = () => page.evaluate(() => {
    const u = Object.values(window.__quiz.log.state().users)[0];
    return u ? u.totals.answered : 0;
  });
  let sawTeach = 0, sawGenerate = 0, sawProve = 0, asked = 0, sawBoost = false;
  for (let i = 0; i < 160 && (await logged()) < 10; i++) {
    if (await page.locator('.card-result').count()) break;

    if (await page.locator('.card-boost').count()) {
      sawBoost = true;
      await page.locator('.boost-card').first().click();
      await page.waitForTimeout(150);
      continue;
    }
    if (await page.locator('.card-teach .teach-head').count()) {
      sawTeach++;
      await page.locator('.card-teach button.btn').first().click();
      await page.waitForTimeout(120);
      continue;
    }
    if (await page.locator('.card-teach .teach-kind').count()) {
      await page.locator('.card-teach button.btn').first().click();
      await page.waitForTimeout(120);
      continue;
    }
    if (await page.locator('.card-generate').count()) sawGenerate++;
    if (await page.locator('.card-prove').count()) sawProve++;

    // Answer whatever kind of item is on screen.
    if (await page.locator('.q-opt:not([disabled])').count()) {
      // Alternate: wrong first (to force teaching), then right.
      const opts = page.locator('.q-opt:not([disabled])');
      const n = await opts.count();
      await opts.nth(asked % 2 === 0 ? Math.min(1, n - 1) : 0).click();
      asked++;
    } else if (await page.locator('.q-tile').count()) {
      // Build the answer for real, in order. Clicking tiles at random would
      // only ever exercise the failure path.
      const cur = await page.evaluate(() => window.__quiz.current);
      const units = cur.wordTiles ? String(cur.answer).split(/\s+/) : String(cur.answer).split('');
      for (const u of units) {
        const tile = page.locator('.q-tile', { hasText: new RegExp('^' + u.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$') }).first();
        if (!(await tile.count())) break;
        await tile.click();
        await page.waitForTimeout(50);
      }
      asked++;
    } else if (await page.locator('.q-countable').count()) {
      for (let t = 0; t < 25; t++) {
        const todo = page.locator('.q-countable:not(.is-counted)');
        if (!(await todo.count())) break;
        await todo.first().click({ timeout: 3000 }).catch(() => {});
        await page.waitForTimeout(40);
      }
      if (await page.locator('.q-options .q-opt:not([disabled])').count()) {
        await page.locator('.q-options .q-opt:not([disabled])').first().click().catch(() => {});
      }
      asked++;
    } else if (await page.locator('.q-trace-canvas').count()) {
      const box = await page.locator('.q-trace-canvas').boundingBox();
      await page.mouse.move(box.x + box.width * 0.2, box.y + box.height * 0.85);
      await page.mouse.down();
      for (let s = 0; s <= 10; s++) await page.mouse.move(box.x + box.width * (0.2 + s * 0.03), box.y + box.height * (0.85 - s * 0.075));
      await page.mouse.up();
      await page.click('text=Done');
      asked++;
    } else {
      await page.waitForTimeout(250);
      continue;
    }
    await page.waitForTimeout(560);
  }

  const answeredNow = await logged();
  if (answeredNow < 10) throw new Error('only answered ' + answeredNow + ' questions in 160 interactions');
  if (sawTeach === 0) throw new Error('never saw a teach card — the remediation loop did not run');
  if (sawGenerate === 0) throw new Error('never saw a generate step — a child was let off producing the answer');

  // Events actually landed
  const summary = await page.evaluate(() => {
    const s = window.__quiz.log.state();
    const u = Object.values(s.users)[0];
    return { answered: u.totals.answered, steps: u.totals.steps, items: Object.keys(u.items).length, events: window.__quiz.log.all().length };
  });
  if (summary.answered < 10) throw new Error('log recorded only ' + summary.answered + ' answers');
  if (summary.events < 10) throw new Error('log has ' + summary.events + ' events');

  // Reload: state must survive, rebuilt from the log
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForSelector('.lobby-hi, .profile-card', { timeout: 8000 });
  const after = await page.evaluate(() => {
    const s = window.__quiz.log.state();
    const u = Object.values(s.users)[0];
    return u.totals.answered;
  });
  if (after !== summary.answered) throw new Error('state did not survive reload: ' + after + ' vs ' + summary.answered);

  if (errors.length) throw new Error('console errors:\n  ' + errors.join('\n  '));

  if (!sawBoost) throw new Error('no boost was ever earned — the pacing beat never fired');
  console.log('smoke ok — ' + summary.answered + ' answered, ' + sawTeach + ' teach cards, ' +
    sawGenerate + ' generate steps, ' + sawProve + ' prove-its, ' +
    summary.items + ' items tracked, ' + summary.events + ' events, a boost earned, survived reload');
} catch (e) {
  console.error('SMOKE FAILED: ' + e.message);
  if (errors.length) console.error('  ' + errors.join('\n  '));
  process.exitCode = 1;
} finally {
  if (browser) await browser.close();
  server.kill();
}
