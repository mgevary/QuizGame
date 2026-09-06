/**
 * offlinecheck.mjs — load online, wait for the service worker to precache,
 * cut the network, and assert the game still boots and plays.
 *
 * This is the gate that catches an asset list drifting away from the tree. A
 * missing file there is invisible until a child opens the app on a train.
 */
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { LAUNCH, silenceSpeech } from './testenv.mjs';

const server = spawn('node', ['scripts/serve.mjs'], { stdio: 'ignore' });
await new Promise(r => setTimeout(r, 700));
const browser = await chromium.launch(LAUNCH);
const errors = [];
try {
  const context = await browser.newContext({ viewport: { width: 420, height: 900 } });
  await silenceSpeech(context);
  const page = await context.newPage();
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));

  await page.goto('http://localhost:8321/', { waitUntil: 'networkidle' });
  await page.waitForSelector('.field', { timeout: 10000 });

  // Give the worker time to finish installing and filling its cache.
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null, { timeout: 15000 })
    .catch(() => {});
  await page.waitForTimeout(2500);

  const cached = await page.evaluate(async () => {
    const names = await caches.keys();
    let total = 0;
    for (const n of names) total += (await (await caches.open(n)).keys()).length;
    return { names, total };
  });
  if (cached.total < 30) throw new Error('only ' + cached.total + ' assets cached: ' + cached.names.join(','));

  // Cut the network entirely and reload from cache alone.
  await context.setOffline(true);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.field, .lobby-hi, .profile-card', { timeout: 15000 });

  await page.fill('input[type=text]', 'Off');
  await page.fill('input[type=number]', '5');
  await page.click('text=Start playing');
  await page.waitForSelector('.lobby-hi', { timeout: 8000 });
  await page.click('text=Play on my own');
  await page.waitForSelector('.card-q', { timeout: 15000 });

  const answered = await page.evaluate(() => !!window.__quiz.current);
  if (!answered) throw new Error('no question rendered offline');
  if (errors.length) throw new Error('errors offline:\n  ' + errors.join('\n  '));

  console.log('offline ok — ' + cached.total + ' assets cached, booted and asked a question with the network cut');
} catch (e) {
  console.error('OFFLINE CHECK FAILED: ' + e.message);
  if (errors.length) console.error('  ' + errors.join('\n  '));
  process.exitCode = 1;
} finally {
  await browser.close();
  server.kill();
}
