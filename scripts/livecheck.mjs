/**
 * livecheck.mjs — drive the DEPLOYED site, not a local server. Catches the
 * class of failure that only shows up under a subpath or a real CDN: a
 * missing file, an absolute path, a stale service worker.
 */
import { chromium } from 'playwright';
import { LAUNCH, quietPage } from './testenv.mjs';

const URL = process.argv[2] || 'https://mgevary.github.io/QuizGame/';
const errors = [];
const browser = await chromium.launch(LAUNCH);
try {
  const page = await quietPage(browser, { viewport: { width: 420, height: 900 } });
  const expected = (m) => /lan\/info/.test((m.location() && m.location().url) || '') || /lan\/info/.test(m.text());
  page.on('console', m => { if (m.type() === 'error' && !expected(m)) errors.push(m.text() + ' @ ' + ((m.location() && m.location().url) || '?')); });
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('requestfailed', r => { if (!/lan\/info/.test(r.url())) errors.push('failed: ' + r.url()); });

  await page.goto(URL, { waitUntil: 'networkidle' });
  await page.waitForSelector('.field', { timeout: 15000 });
  await page.fill('input[type=text]', 'Live');
  await page.fill('input[type=number]', '5');
  await page.click('text=Start playing');
  await page.waitForSelector('.lobby-hi', { timeout: 8000 });
  if (!(await page.locator('.mode-card').count())) throw new Error('the lobby offers no games');

  await page.click('text=Play on my own');
  await page.waitForSelector('.card-q', { timeout: 15000 });

  const logged = () => page.evaluate(() => {
    const u = Object.values(window.__quiz.log.state().users)[0];
    return u ? u.totals.answered : 0;
  });
  for (let i = 0; i < 140 && (await logged()) < 4; i++) {
    if (await page.locator('.card-boost').count()) {
      await page.locator('.boost-card').first().click();
      await page.waitForTimeout(150);
      continue;
    }
    if (await page.locator('.card-handover').count()) { await page.click('text=I’m ready'); }
    else if (await page.locator('.card-teach button.btn').count()) await page.locator('.card-teach button.btn').first().click();
    else if (await page.locator('.q-opt:not([disabled])').count()) await page.locator('.q-opt:not([disabled])').first().click();
    else if (await page.locator('.q-tile').count()) {
      const cur = await page.evaluate(() => window.__quiz.current);
      const units = cur.wordTiles ? String(cur.answer).split(/\s+/) : String(cur.answer).split('');
      for (const u of units) {
        const t = page.locator('.q-tile', { hasText: new RegExp('^' + u.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$') }).first();
        if (await t.count()) { await t.click(); await page.waitForTimeout(50); }
      }
    } else if (await page.locator('.q-trace-canvas').count()) {
      const box = await page.locator('.q-trace-canvas').boundingBox();
      await page.mouse.move(box.x + box.width * 0.3, box.y + box.height * 0.8);
      await page.mouse.down();
      for (let s2 = 0; s2 <= 8; s2++) await page.mouse.move(box.x + box.width * (0.3 + s2 * 0.04), box.y + box.height * (0.8 - s2 * 0.07));
      await page.mouse.up();
      await page.click('text=Done').catch(() => {});
    } else if (await page.locator('.q-countable').count()) {
      const n = await page.locator('.q-countable').count();
      for (let t = 0; t < n; t++) await page.locator('.q-countable').nth(t).click();
      if (await page.locator('.q-options .q-opt').count()) await page.locator('.q-options .q-opt').first().click();
    }
    await page.waitForTimeout(550);
  }
  const answered = await logged();
  if (answered < 4) throw new Error('deployed site answered only ' + answered + ' questions');
  if (errors.length) throw new Error('errors on the live site:\n  ' + errors.join('\n  '));
  console.log('live ok — ' + URL + ' booted, made a profile and answered ' + answered + ' questions');
} catch (e) {
  console.error('LIVE CHECK FAILED: ' + e.message);
  if (errors.length) console.error('  ' + errors.join('\n  '));
  process.exitCode = 1;
} finally { await browser.close(); }
