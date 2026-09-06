import { chromium } from 'playwright';
import { LAUNCH, quietPage } from './testenv.mjs';
import { spawn } from 'node:child_process';
const server = spawn('node', ['scripts/serve.mjs'], { stdio: 'ignore' });
await new Promise(r => setTimeout(r, 700));
const b = await chromium.launch(LAUNCH);
const p = await quietPage(b, { viewport: { width: 430, height: 860 }, deviceScaleFactor: 2 });
const shot = (n) => p.screenshot({ path: `shots/${n}.png` });
try {
  await p.goto('http://localhost:8321/', { waitUntil: 'networkidle' });
  await p.waitForSelector('.field');
  await p.fill('input[type=text]', 'Ana'); await p.fill('input[type=number]', '6');
  await shot('01-new-player');
  await p.click('text=Start playing'); await p.waitForSelector('.lobby-hi');
  await shot('02-lobby');
  await p.click('text=Modules'); await p.waitForSelector('.mod-row'); await shot('03-modules');
  await p.click('.icon-btn >> nth=0'); await p.waitForSelector('.lobby-hi');

  // A second player, then a team game — the case the whole app is for.
  await p.click('text=Team tug'); await p.waitForSelector('.pick-card');
  await p.click('text=+ Add another player');
  await p.waitForSelector('.field'); await p.fill('input[type=text]', 'Sam'); await p.fill('input[type=number]', '9');
  await p.click('.racer-opt:nth-child(4)'); await p.click('text=Start playing');
  await p.waitForSelector('.pick-card', { timeout: 8000 });
  const cards = p.locator('.pick-card');
  for (let i = 0; i < await cards.count(); i++) {
    if (!/is-on/.test(await cards.nth(i).getAttribute('class'))) await cards.nth(i).click();
  }
  await shot('04-setup');
  await p.click('.btn-go:not([disabled])');
  await p.waitForSelector('.card-handover', { timeout: 12000 });
  await p.waitForTimeout(400); await shot('05-handover');
  await p.click('text=I’m ready');
  await p.waitForSelector('.card-q', { timeout: 10000 });
  await p.waitForTimeout(500); await shot('05-question');
  // Force a wrong answer to capture the teach loop
  for (let i = 0; i < 30; i++) {
    if (await p.locator('.card-checkpoint').count()) { await shot('09-checkpoint'); await p.click('text=Keep going'); await p.waitForTimeout(200); continue; }
    if (await p.locator('.card-handover').count()) { await p.click('text=I’m ready'); await p.waitForTimeout(200); continue; }
    if (await p.locator('.card-teach .teach-head').count()) { await shot('06-feedback'); await p.locator('.card-teach button.btn').first().click(); await p.waitForTimeout(300); await shot('07-teach'); break; }
    if (await p.locator('.q-opt:not([disabled])').count()) {
      const n = await p.locator('.q-opt:not([disabled])').count();
      await p.locator('.q-opt:not([disabled])').nth(Math.min(1, n - 1)).click();
    } else if (await p.locator('.q-countable').count()) {
      for (let t = 0; t < 25; t++) {
        const todo = p.locator('.q-countable:not(.is-counted)');
        if (!(await todo.count())) break;
        await todo.first().click({ timeout: 3000 }).catch(() => {});
        await p.waitForTimeout(40);
      }
      if (await p.locator('.q-options .q-opt:not([disabled])').count()) await p.locator('.q-options .q-opt:not([disabled])').last().click().catch(() => {});
    } else if (await p.locator('.q-tile').count()) { await p.locator('.q-tile').first().click(); }
    await p.waitForTimeout(500);
  }
  if (await p.locator('.card-teach button.btn').count()) { await p.locator('.card-teach button.btn').first().click(); await p.waitForTimeout(400); await shot('08-generate'); }
  console.log('shots written to shots/');
} catch (e) { console.error(e.message); process.exitCode = 1; }
finally { await b.close(); server.kill(); }
