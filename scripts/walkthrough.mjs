/**
 * walkthrough.mjs — every screen and moment, captured as a player would meet
 * them, for a four-year-old and a nine-year-old. Used to look at the game
 * honestly rather than remember it.
 */
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { LAUNCH, quietPage } from './testenv.mjs';

const server = spawn('node', ['scripts/serve.mjs'], { stdio: 'ignore' });
await new Promise(r => setTimeout(r, 700));
const b = await chromium.launch(LAUNCH);
const shots = [];

async function run(tag, name, age, viewport) {
  const p = await quietPage(b, { viewport: viewport || { width: 430, height: 900 }, deviceScaleFactor: 2 });
  const shot = async (n) => { const f = `shots/w-${tag}-${n}.png`; await p.screenshot({ path: f }); shots.push(f); };
  try {
    await p.goto('http://localhost:8321/', { waitUntil: 'networkidle' });
    await p.waitForSelector('.field');
    await p.fill('input[type=text]', name); await p.fill('input[type=number]', String(age));
    await p.click('text=Start playing'); await p.waitForSelector('.lobby-hi');
    await shot('01-lobby');
    await p.locator('.btn:has-text("Play on my own")').click();
    await p.waitForSelector('.card-countdown, .card-q', { timeout: 10000 });
    await p.waitForTimeout(200); await shot('02-countdown');
    await p.waitForSelector('.card-q', { timeout: 10000 });
    await p.waitForTimeout(400); await shot('03-question');

    // Answer correctly once to see the reveal + celebration.
    const answerRight = async () => {
      const cur = await p.evaluate(() => window.__quiz.current);
      if (await p.locator('.q-opt:not([disabled])').count()) {
        const opts = p.locator('.q-opt:not([disabled])');
        const n = await opts.count();
        for (let i = 0; i < n; i++) {
          const t = (await opts.nth(i).textContent()).trim();
          if (t === cur.answer || t.startsWith(cur.answer)) { await opts.nth(i).click(); return true; }
        }
        await opts.first().click(); return true;
      }
      if (await p.locator('.q-countable').count()) {
        for (let t = 0; t < 25; t++) { const todo = p.locator('.q-countable:not(.is-counted)'); if (!(await todo.count())) break; await todo.first().click({ timeout: 2000 }).catch(() => {}); await p.waitForTimeout(60); }
        const c = p.locator('.q-options .q-opt:not([disabled])');
        const n = await c.count();
        for (let i = 0; i < n; i++) { if ((await c.nth(i).textContent()).trim() === cur.answer) { await c.nth(i).click(); return true; } }
        return true;
      }
      if (await p.locator('.q-tile').count()) {
        const units = cur.wordTiles ? cur.answer.split(/\s+/) : cur.answer.split('');
        for (const u of units) { const t = p.locator('.q-tile', { hasText: new RegExp('^' + u.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$') }).first(); if (await t.count()) { await t.click(); await p.waitForTimeout(60); } }
        return true;
      }
      if (await p.locator('.q-trace-canvas').count()) {
        const box = await p.locator('.q-trace-canvas').boundingBox();
        await p.mouse.move(box.x + box.width * 0.2, box.y + box.height * 0.85); await p.mouse.down();
        for (let s = 0; s <= 10; s++) await p.mouse.move(box.x + box.width * (0.2 + s * 0.03), box.y + box.height * (0.85 - s * 0.075));
        await p.mouse.up(); await p.click('text=Done'); return true;
      }
      return false;
    };
    await answerRight();
    await p.waitForTimeout(450); await shot('04-reveal-right');
    await p.waitForTimeout(900);

    // Now a wrong answer, to walk the pit.
    for (let i = 0; i < 6; i++) {
      await p.waitForSelector('.card-q', { timeout: 8000 }).catch(() => {});
      if (await p.locator('.q-opt:not([disabled])').count()) {
        const cur = await p.evaluate(() => window.__quiz.current);
        const opts = p.locator('.q-opt:not([disabled])');
        const n = await opts.count();
        let clicked = false;
        for (let k = 0; k < n; k++) { const t = (await opts.nth(k).textContent()).trim(); if (t !== cur.answer && !t.startsWith(cur.answer)) { await opts.nth(k).click(); clicked = true; break; } }
        if (!clicked) await opts.first().click();
        await p.waitForTimeout(450); await shot('05-reveal-wrong');
        break;
      }
      await answerRight(); await p.waitForTimeout(1200);
    }
    await p.waitForSelector('.card-teach', { timeout: 8000 }).catch(() => {});
    await p.waitForTimeout(300); await shot('06-feedback');
    await p.locator('.card-teach button.btn').first().click().catch(() => {});
    await p.waitForTimeout(350); await shot('07-teach');
    await p.locator('.card-teach button.btn').first().click().catch(() => {});
    await p.waitForTimeout(450); await shot('08-generate');
    await answerRight();
    await p.waitForTimeout(700);
    if (await p.locator('.card-prove').count()) { await shot('09-prove'); await answerRight(); await p.waitForTimeout(800); }

    // Play on until a boost shows.
    for (let i = 0; i < 40; i++) {
      if (await p.locator('.card-boost').count()) { await shot('10-boost'); await p.locator('.boost-card').first().click(); await p.waitForTimeout(600); await shot('11-after-boost'); break; }
      if (await p.locator('.card-teach button.btn').count()) { await p.locator('.card-teach button.btn').first().click(); await p.waitForTimeout(250); continue; }
      if (await p.locator('.card-q').count()) { await answerRight(); await p.waitForTimeout(1300); continue; }
      await p.waitForTimeout(200);
    }
    // Quit to results.
    await p.locator('.play-top .icon-btn').first().click();
    await p.waitForSelector('.card-result', { timeout: 8000 });
    await p.waitForTimeout(1800); await shot('12-results');
    await p.locator('.btn:has-text("Done")').click();
    await p.waitForSelector('.lobby-hi');
    await shot('13-lobby-after');
  } catch (e) { console.error(tag, 'walkthrough error:', e.message); }
  await p.context().close();
}

await run('kid', 'Mia', 4);
await run('big', 'Sam', 9);
await b.close(); server.kill();
console.log(shots.join('\n'));
