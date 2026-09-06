/**
 * testenv.mjs — shared browser setup for every Playwright script.
 *
 * The important part is silenceSpeech(). Headless Chromium on macOS routes
 * speechSynthesis to the system voice, so a test run reads questions aloud
 * through the developer's speakers — with no visible window to trace it back
 * to. It is baffling and it happens on every run.
 *
 * The tests do not exercise speech, so the API is stubbed before any app code
 * executes. Nothing in the suite may make the machine talk.
 */

export const LAUNCH = { args: ['--mute-audio'] };

/** Stub speechSynthesis before any page script runs. */
export async function silenceSpeech(context) {
  await context.addInitScript(() => {
    const noop = () => {};
    const stub = {
      speak: noop, cancel: noop, pause: noop, resume: noop,
      getVoices: () => [], speaking: false, pending: false, paused: false,
      addEventListener: noop, removeEventListener: noop, onvoiceschanged: null
    };
    try {
      Object.defineProperty(window, 'speechSynthesis', { value: stub, configurable: true });
    } catch (e) { /* already locked down: fine */ }
    try {
      window.SpeechSynthesisUtterance = function () { return {}; };
    } catch (e) { /* ditto */ }
  });
}

/** A page that cannot talk. */
export async function quietPage(browser, opts) {
  const context = await browser.newContext(opts);
  await silenceSpeech(context);
  return context.newPage();
}
