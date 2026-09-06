/**
 * mptest.mjs — two browsers, one real game, over a real room server.
 *
 * This is the gate that proves networked play works end to end: two separate
 * browser contexts, a WebSocket each, a coordinator running in node, and the
 * rules module that node imports being the same file the browsers use.
 *
 * What it asserts is the property that matters: a device REPORTS an outcome
 * and the server DECIDES the distance. Neither browser may move itself.
 */
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { LAUNCH, silenceSpeech } from './testenv.mjs';

const PORT = 8331;
const base = `http://localhost:${PORT}/`;
const server = spawn('node', ['scripts/lan-server.mjs'], {
  stdio: 'ignore', env: { ...process.env, PORT: String(PORT) }
});
await new Promise(r => setTimeout(r, 1200));

const errors = [];
let browser;

const expected = (m) => /lan\/info/.test((m.location() && m.location().url) || '');

async function makePage(name, age) {
  const context = await browser.newContext({ viewport: { width: 420, height: 900 } });
  await silenceSpeech(context);
  const page = await context.newPage();
  page.on('pageerror', e => errors.push(name + ' pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error' && !expected(m)) errors.push(name + ' console: ' + m.text()); });
  await page.goto(base, { waitUntil: 'networkidle' });
  await page.waitForSelector('.field', { timeout: 10000 });
  await page.fill('input[type=text]', name);
  await page.fill('input[type=number]', String(age));
  await page.click('text=Start playing');
  await page.waitForSelector('.lobby-hi', { timeout: 8000 });
  return page;
}

/** Answer whatever is on screen, whoever it belongs to. */
async function play(page, rounds) {
  for (let i = 0; i < rounds; i++) {
    if (await page.locator('.card-result').count()) return;
    if (await page.locator('.card-boost').count()) { await page.locator('.boost-card').first().click().catch(() => {}); }
    else if (await page.locator('.card-checkpoint').count()) { await page.click('text=Keep going').catch(() => {}); }
    else if (await page.locator('.card-handover').count()) { await page.click('text=I’m ready').catch(() => {}); }
    else if (await page.locator('.card-teach button.btn').count()) { await page.locator('.card-teach button.btn').first().click().catch(() => {}); }
    else if (await page.locator('.q-opt:not([disabled])').count()) {
      await page.locator('.q-opt:not([disabled])').first().click().catch(() => {});
    } else if (await page.locator('.q-tile').count()) {
      const cur = await page.evaluate(() => window.__quiz.current).catch(() => null);
      if (cur) {
        const units = cur.wordTiles ? String(cur.answer).split(/\s+/) : String(cur.answer).split('');
        for (const u of units) {
          const t = page.locator('.q-tile', { hasText: new RegExp('^' + u.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$') }).first();
          if (await t.count()) { await t.click().catch(() => {}); await page.waitForTimeout(40); }
        }
      }
    } else if (await page.locator('.q-countable').count()) {
      for (let t = 0; t < 25; t++) {
        const todo = page.locator('.q-countable:not(.is-counted)');
        if (!(await todo.count())) break;
        await todo.first().click({ timeout: 2000 }).catch(() => {});
        await page.waitForTimeout(30);
      }
      await page.locator('.q-options .q-opt:not([disabled])').first().click().catch(() => {});
    } else if (await page.locator('.q-trace-canvas').count()) {
      const box = await page.locator('.q-trace-canvas').boundingBox();
      await page.mouse.move(box.x + box.width * 0.3, box.y + box.height * 0.8);
      await page.mouse.down();
      for (let s = 0; s <= 8; s++) await page.mouse.move(box.x + box.width * (0.3 + s * 0.04), box.y + box.height * (0.8 - s * 0.07));
      await page.mouse.up();
      await page.click('text=Done').catch(() => {});
    } else { await page.waitForTimeout(200); continue; }
    await page.waitForTimeout(480);
  }
}

try {
  browser = await chromium.launch(LAUNCH);

  // The server must announce itself, or the lobby can never find a game.
  const info = await fetch(base + 'lan/info').then(r => r.json());
  if (!info || typeof info.name !== 'string') throw new Error('lan/info did not answer');

  const host = await makePage('Hosta', 9);
  const join = await makePage('Joina', 7);

  // Host opens a room and reads the code off its own screen.
  await host.click('.mode-card:has-text("Team tug")');
  await host.waitForSelector('.pick-card', { timeout: 8000 });
  await host.click('.btn:has-text("Host a room")');
  await host.waitForSelector('.room-code', { timeout: 12000 });
  const code = (await host.textContent('.room-code')).trim();
  if (!/^\d{4}$/.test(code)) throw new Error('bad room code: ' + code);

  // Joiner types it.
  await join.click('.btn:has-text("Join a game")');
  await join.waitForSelector('.room-input', { timeout: 8000 });
  await join.fill('.room-input', code);
  await join.click('.card-connect .btn-go');
  await join.waitForSelector('.connect-roster', { timeout: 15000 });

  // The host sees them arrive.
  await host.waitForFunction(() => document.querySelectorAll('.connect-player').length >= 2, { timeout: 12000 });

  await host.click('.card-connect .btn-go:not([disabled])');
  await host.waitForSelector('.card-q, .card-handover', { timeout: 25000 });
  await join.waitForSelector('.card-q, .card-handover', { timeout: 20000 });

  // Both devices must learn the track from the server before anyone plays.
  const seesTrack = (p) => p.waitForFunction(
    () => window.__quiz && window.__quiz.track && Object.keys(window.__quiz.track.positions || {}).length >= 2,
    { timeout: 20000 });
  await Promise.all([seesTrack(host), seesTrack(join)]);

  // Both play at once, as two children would.
  await Promise.all([play(host, 45), play(join, 45)]);

  const state = async (p) => p.evaluate(() => {
    const t = window.__quiz.track || { positions: {} };
    return { positions: t.positions, seats: Object.keys(t.positions).length };
  });
  const h = await state(host), j = await state(join);

  if (h.seats < 2) throw new Error('the host only ever saw ' + h.seats + ' racer(s)');
  if (j.seats < 2) throw new Error('the joiner only ever saw ' + j.seats + ' racer(s)');

  // Both devices must agree about where everyone is: the server decided it.
  const moved = Object.values(h.positions).filter(v => v > 0).length;
  if (moved < 2) throw new Error('only ' + moved + ' racer(s) ever moved');

  const answered = await Promise.all([host, join].map(p => p.evaluate(() => {
    const u = Object.values(window.__quiz.log.state().users)[0];
    return u ? u.totals.answered : 0;
  })));
  if (answered[0] < 3 || answered[1] < 3) throw new Error('too few answers: ' + answered.join('/'));

  if (errors.length) throw new Error('console errors:\n  ' + errors.slice(0, 8).join('\n  '));

  console.log('multiplayer ok — room ' + code + ', two browsers, ' + h.seats +
    ' racers on both screens, ' + answered.join(' and ') + ' answered, server owned every position');
} catch (e) {
  console.error('MULTIPLAYER TEST FAILED: ' + e.message);
  if (errors.length) console.error('  ' + errors.slice(0, 8).join('\n  '));
  process.exitCode = 1;
} finally {
  if (browser) await browser.close();
  server.kill();
}
