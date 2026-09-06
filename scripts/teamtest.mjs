/**
 * teamtest.mjs — drive a real two-player pass-and-play game in a browser.
 *
 * The thing this proves that no unit test can: two children of different ages
 * really do get questions from their own pools at their own level, the rope
 * really does move when either of them answers, and the handover between them
 * actually works with a finger.
 */
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';

const server = spawn('node', ['scripts/serve.mjs'], { stdio: 'ignore' });
await new Promise(r => setTimeout(r, 700));
const errors = [];
let browser;

try {
  browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 430, height: 900 } });
  // The room-server probe 404s on a static host, which is how the app learns
  // there is no server. It is the expected answer, not a fault.
  // The room-server probe 404s on a static host, which is how the app learns
  // there is no server. It is the expected answer, not a fault.
  const expected = (m) => /lan\/info/.test((m.location() && m.location().url) || '') || /lan\/info/.test(m.text());
  page.on('console', m => { if (m.type() === 'error' && !expected(m)) errors.push('console: ' + m.text() + ' @ ' + ((m.location() && m.location().url) || '?')); });
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  await page.goto('http://localhost:8321/', { waitUntil: 'networkidle' });

  const makePlayer = async (name, age) => {
    await page.waitForSelector('.field', { timeout: 8000 });
    await page.fill('input[type=text]', name);
    await page.fill('input[type=number]', String(age));
    await page.click('text=Start playing');
  };

  // A nine-year-old and a four-year-old — the exact mixed-age case.
  await makePlayer('Sam', 9);
  await page.waitForSelector('.lobby-hi');
  await page.click('text=Team tug');
  await page.waitForSelector('.pick-card');
  await page.click('text=+ Add another player');
  await makePlayer('Ana', 4);
  await page.waitForSelector('.pick-card', { timeout: 8000 });

  const cards = page.locator('.pick-card');
  const n = await cards.count();
  if (n < 2) throw new Error('the new player did not come back to setup: ' + n + ' cards');
  for (let i = 0; i < n; i++) {
    if (!/is-on/.test(await cards.nth(i).getAttribute('class'))) await cards.nth(i).click();
  }
  await page.click('.btn-go:not([disabled])');

  // The handover names whoever is up, and the rope exists.
  await page.waitForSelector('.card-handover', { timeout: 12000 });
  if (!(await page.locator('.rope').count())) throw new Error('team tug has no rope');
  const firstTurn = await page.textContent('.handover-name');

  const seen = new Set();
  const ropeWidths = new Set();
  const logged = () => page.evaluate(() => {
    const s = window.__quiz.log.state();
    return Object.values(s.users).reduce((a, u) => a + u.totals.answered, 0);
  });

  for (let i = 0; i < 220 && (await logged()) < 12; i++) {
    if (await page.locator('.card-handover').count()) {
      seen.add((await page.textContent('.handover-name')).trim());
      await page.click('text=I’m ready');
      await page.waitForTimeout(120);
      continue;
    }
    if (await page.locator('.card-teach button.btn').count()) {
      await page.locator('.card-teach button.btn').first().click();
      await page.waitForTimeout(120);
      continue;
    }
    if (await page.locator('.q-opt:not([disabled])').count()) {
      const opts = page.locator('.q-opt:not([disabled])');
      const c = await opts.count();
      await opts.nth(i % 3 === 0 ? Math.min(1, c - 1) : 0).click();
    } else if (await page.locator('.q-tile').count()) {
      const cur = await page.evaluate(() => window.__quiz.current);
      const units = cur.wordTiles ? String(cur.answer).split(/\s+/) : String(cur.answer).split('');
      for (const u of units) {
        const t = page.locator('.q-tile', { hasText: new RegExp('^' + u.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$') }).first();
        if (await t.count()) { await t.click(); await page.waitForTimeout(45); }
      }
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
    } else if (await page.locator('.q-trace-canvas').count()) {
      const box = await page.locator('.q-trace-canvas').boundingBox();
      await page.mouse.move(box.x + box.width * 0.3, box.y + box.height * 0.8);
      await page.mouse.down();
      for (let s2 = 0; s2 <= 8; s2++) await page.mouse.move(box.x + box.width * (0.3 + s2 * 0.04), box.y + box.height * (0.8 - s2 * 0.07));
      await page.mouse.up();
      await page.click('text=Done');
    } else if (await page.locator('.card-result').count()) {
      break;
    } else { await page.waitForTimeout(200); continue; }

    const w = await page.locator('.rope-side.is-a').getAttribute('style').catch(() => null);
    if (w) ropeWidths.add(w);
    await page.waitForTimeout(620);
  }

  const answered = await logged();
  if (answered < 12) throw new Error('only ' + answered + ' questions answered across both players');
  if (seen.size < 2) throw new Error('the turn never passed — only saw: ' + [...seen].join(', '));
  if (ropeWidths.size < 2) throw new Error('the rope never moved');

  // Each player must have their own pool at their own level.
  const perUser = await page.evaluate(() => {
    const s = window.__quiz.log.state();
    return Object.entries(s.users).map(([id, u]) => ({
      band: u.band, answered: u.totals.answered,
      skills: Object.keys(u.skills).filter(k => k.indexOf('.') > 0).slice(0, 40)
    }));
  });
  const active = perUser.filter(u => u.answered > 0);
  if (active.length < 2) throw new Error('only one player actually answered anything');
  const bands = active.map(u => u.band).sort();
  if (bands[0] === bands[1]) throw new Error('both players ended up in the same band: ' + bands);

  if (errors.length) throw new Error('console errors:\n  ' + errors.join('\n  '));
  console.log('team ok — ' + answered + ' answered across ' + active.length + ' players (' +
    bands.join(' + ') + '), turn passed between ' + [...seen].join(' and ') + ', rope moved ' + ropeWidths.size + ' times');
} catch (e) {
  console.error('TEAM TEST FAILED: ' + e.message);
  if (errors.length) console.error('  ' + errors.slice(0, 6).join('\n  '));
  process.exitCode = 1;
} finally {
  if (browser) await browser.close();
  server.kill();
}
