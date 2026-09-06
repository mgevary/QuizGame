import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
const server = spawn('node', ['scripts/serve.mjs'], { stdio: 'ignore' });
await new Promise(r => setTimeout(r, 700));
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 430, height: 860 }, deviceScaleFactor: 2 });
const shot = (n) => p.screenshot({ path: `shots/${n}.png` });
try {
  await p.goto('http://localhost:8321/', { waitUntil: 'networkidle' });
  await p.waitForSelector('.field');
  await p.fill('input[type=text]', 'Ana'); await p.fill('input[type=number]', '6');
  await shot('01-new-player');
  await p.click('text=Start playing'); await p.waitForSelector('.hero-name');
  await shot('02-home');
  await p.click('text=Modules'); await p.waitForSelector('.mod-row'); await shot('03-modules');
  await p.click('.icon-btn >> nth=0'); await p.click('text=Settings'); await p.waitForSelector('.toggle-row'); await shot('04-settings');
  await p.click('.icon-btn >> nth=0'); await p.click('text=Play'); await p.waitForSelector('.card-q', { timeout: 10000 });
  await p.waitForTimeout(500); await shot('05-question');
  // Force a wrong answer to capture the teach loop
  for (let i = 0; i < 30; i++) {
    if (await p.locator('.card-teach .teach-head').count()) { await shot('06-feedback'); await p.locator('.card-teach button.btn').first().click(); await p.waitForTimeout(300); await shot('07-teach'); break; }
    if (await p.locator('.q-opt:not([disabled])').count()) {
      const n = await p.locator('.q-opt:not([disabled])').count();
      await p.locator('.q-opt:not([disabled])').nth(Math.min(1, n - 1)).click();
    } else if (await p.locator('.q-countable').count()) {
      const n = await p.locator('.q-countable').count();
      for (let t = 0; t < n; t++) await p.locator('.q-countable').nth(t).click();
      if (await p.locator('.q-options .q-opt').count()) await p.locator('.q-options .q-opt').last().click();
    } else if (await p.locator('.q-tile').count()) { await p.locator('.q-tile').first().click(); }
    await p.waitForTimeout(500);
  }
  if (await p.locator('.card-teach button.btn').count()) { await p.locator('.card-teach button.btn').first().click(); await p.waitForTimeout(400); await shot('08-generate'); }
  console.log('shots written to shots/');
} catch (e) { console.error(e.message); process.exitCode = 1; }
finally { await b.close(); server.kill(); }
