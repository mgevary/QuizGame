/**
 * audio.js — speaking prompts aloud.
 *
 * A recorded file is always preferred. Speech synthesis is NOT a dependable
 * primitive: voice lists load asynchronously, iOS needs a gesture before the
 * first utterance, quality varies wildly, and on some devices no offline
 * voice exists at all — which would quietly break the offline promise for
 * exactly the children who cannot read the fallback.
 *
 * So: file, then TTS, then leave the text visible with a badge asking a
 * grown-up to read it. Never fail silently.
 */

var unlocked = false;
var voices = null;

export function unlock() {
  if (unlocked) return;
  unlocked = true;
  try {
    if (window.speechSynthesis) {
      // Priming with an empty utterance satisfies the iOS gesture rule for
      // the rest of the session. The parent starts the session precisely so
      // a pre-reader never has to.
      var u = new window.SpeechSynthesisUtterance(' ');
      u.volume = 0;
      window.speechSynthesis.speak(u);
      voices = window.speechSynthesis.getVoices();
      window.speechSynthesis.onvoiceschanged = function () { voices = window.speechSynthesis.getVoices(); };
    }
  } catch (e) { /* speech is a bonus, never a requirement */ }
}

export function isUnlocked() { return unlocked; }

export function canSpeak() {
  return !!(window.speechSynthesis && window.SpeechSynthesisUtterance);
}

var audioEl = null;

/**
 * @param {object} prompt {audio, tts, text}
 * @param {object} opts {base, enabled, onUnavailable}
 */
export function speak(prompt, opts) {
  opts = opts || {};
  if (!prompt || opts.enabled === false) return false;
  // Never talk into a room nobody is looking at. A backgrounded tab that
  // starts reading questions aloud is startling and impossible to trace back
  // to this app.
  try { if (document.hidden) return false; } catch (e) { /* no document: fine */ }
  if (prompt.audio && opts.base) {
    if (!audioEl) audioEl = new Audio();
    audioEl.src = opts.base + prompt.audio;
    var p = audioEl.play();
    if (p && p.catch) p.catch(function () { ttsOrGiveUp(prompt, opts); });
    return true;
  }
  return ttsOrGiveUp(prompt, opts);
}

function ttsOrGiveUp(prompt, opts) {
  var text = typeof prompt.tts === 'string' ? prompt.tts : (prompt.tts === true ? prompt.text : null);
  if (!text || !canSpeak()) {
    if (opts.onUnavailable) opts.onUnavailable();
    return false;
  }
  try {
    window.speechSynthesis.cancel();
    var u = new window.SpeechSynthesisUtterance(text);
    u.rate = opts.rate || 0.92;      // a shade slow: these are young listeners
    u.pitch = 1.05;
    if (opts.lang) u.lang = opts.lang;
    window.speechSynthesis.speak(u);
    return true;
  } catch (e) {
    if (opts.onUnavailable) opts.onUnavailable();
    return false;
  }
}

export function stop() {
  try { if (window.speechSynthesis) window.speechSynthesis.cancel(); } catch (e) {}
  try { if (audioEl) audioEl.pause(); } catch (e) {}
}
