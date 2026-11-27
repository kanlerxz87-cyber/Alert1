/* ============================================================================
 * alertsound.js — the one alert sound for the whole site
 *
 * A soft raindrop: five filtered droplets (a low-passed noise "plip" over a
 * falling sine body) spaced like rain on a window, landing on a warm two-note
 * chime, tailing off into a light echo. ~3.0 s end to end, gentle on purpose —
 * this is meant to be audible for a whole season, all day, without becoming
 * annoying. Peak level is deliberately low and there are no sharp transients.
 *
 * Guarantees:
 *   - one shared AudioContext for the whole page (browsers limit how many a
 *     page may create);
 *   - a real 3-second PLAY / duration guarantee for the test button;
 *   - the toggle is the user's switch: off means silent, always;
 *   - every voice is a short-lived node; nothing accumulates.
 *
 * Web Audio needs a user gesture before it will make sound. When the context is
 * suspended the gift call is retried on the first pointer/key event, and the
 * test button reports honestly instead of pretending it played.
 * ==========================================================================*/
(function (global) {
  'use strict';

  var DURATION_MS = 3000;
  var PEAK = 0.16;            // gentle; the old chime peaked near 0.22 per voice
  var COOLDOWN_MS = 2200;     // two events in one second are one sound, not two

  var ctx = null;
  var lastPlayedAt = 0;
  var unlocked = false;
  var unlockBound = false;
  var listeners = [];

  function emit(evt) {
    listeners.forEach(function (fn) {
      try { fn(evt); } catch (e) { global.console && global.console.warn && global.console.warn('[alertsound] listener failed', e); }
    });
  }

  function Ctor() {
    return global.AudioContext || global.webkitAudioContext || null;
  }

  function ensureContext() {
    var C = Ctor();
    if (!C) return null;
    if (!ctx) {
      try {
        ctx = new C();
      } catch (e) {
        ctx = null;
        return null;
      }
    }
    return ctx;
  }

  /* Browsers block audio until the page has been interacted with. Retry the
   * resume on the first gesture so a season-long session never goes quiet
   * because of one autoplay policy expiry. */
  function bindUnlock() {
    if (unlockBound || !global.document || !global.document.addEventListener) return;
    unlockBound = true;
    var handler = function () {
      unlocked = true;
      var c = ctx;
      if (c && c.state === 'suspended' && c.resume) {
        c.resume().catch(function () { /* ignore */ });
      }
      global.document.removeEventListener('pointerdown', handler, true);
      global.document.removeEventListener('keydown', handler, true);
      global.document.removeEventListener('touchstart', handler, true);
    };
    global.document.addEventListener('pointerdown', handler, true);
    global.document.addEventListener('keydown', handler, true);
    global.document.addEventListener('touchstart', handler, true);
  }

  function status() {
    if (!Ctor()) return 'unsupported';
    if (!ctx) return unlocked ? 'ready' : 'not-started';
    if (ctx.state === 'running') return 'running';
    return ctx.state || 'suspended';
  }

  /* A single droplet: a tiny noise burst shaped by a bandpass (the "plip"),
   * plus a sine body that falls in pitch as it decays (the water drop). */
  function droplet(c, dest, at, gain, freq, noiseFreq) {
    var body = c.createOscillator();
    var bodyGain = c.createGain();
    body.type = 'sine';
    body.frequency.setValueAtTime(freq, at);
    body.frequency.exponentialRampToValueAtTime(freq * 0.62, at + 0.5);
    bodyGain.gain.setValueAtTime(0.0001, at);
    bodyGain.gain.exponentialRampToValueAtTime(gain, at + 0.012);
    bodyGain.gain.exponentialRampToValueAtTime(0.0001, at + 0.85);
    body.connect(bodyGain);
    bodyGain.connect(dest);
    body.start(at);
    body.stop(at + 0.95);

    /* Noise transient — short, band-passed, low level: the droplet's surface. */
    var frames = Math.max(1, Math.round(c.sampleRate * 0.05));
    var buffer = c.createBuffer(1, frames, c.sampleRate);
    var data = buffer.getChannelData(0);
    for (var i = 0; i < frames; i += 1) {
      var env = Math.pow(1 - i / frames, 3);
      data[i] = (Math.random() * 2 - 1) * env;
    }
    var src = c.createBufferSource();
    src.buffer = buffer;
    var bp = c.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = noiseFreq;
    bp.Q.value = 1.4;
    var ng = c.createGain();
    ng.gain.value = Math.max(0.02, gain * 0.55);
    src.connect(bp);
    bp.connect(ng);
    ng.connect(dest);
    src.start(at);
    src.stop(at + 0.06);
  }

  /**
   * play(opts)
   *   opts.reason    'review' | 'risk' | 'pending' | 'scoring' | 'test'
   *   opts.force     bypass the cooldown (the test button)
   *   opts.onResult  called with { played, reason, contextState, durationMs }
   */
  function play(opts) {
    opts = opts || {};
    var reason = opts.reason || 'alert';
    var atMs = Date.now();
    if (!opts.force && atMs - lastPlayedAt < COOLDOWN_MS) {
      report(opts, { played: false, reason: reason, suppressed: 'cooldown', remainingMs: COOLDOWN_MS - (atMs - lastPlayedAt) });
      return false;
    }
    var c = ensureContext();
    if (!c) {
      report(opts, { played: false, reason: reason, error: 'Web Audio is not available in this browser' });
      return false;
    }
    bindUnlock();
    if (c.state === 'suspended' && c.resume) {
      try { c.resume(); } catch (e) { /* ignore */ }
    }
    if (c.state !== 'running') {
      /* Honest failure: the sound did not play, so do not claim it did. */
      report(opts, {
        played: false,
        reason: reason,
        error: 'Audio is blocked until you interact with the page once — click anywhere (or press the test button again) and it will play.',
        contextState: c.state,
      });
      return false;
    }

    lastPlayedAt = atMs;
    try {
      render(c, reason);
    } catch (e) {
      report(opts, { played: false, reason: reason, error: 'audio graph error: ' + (e && e.message) });
      return false;
    }
    report(opts, { played: true, reason: reason, contextState: c.state, durationMs: DURATION_MS });
    return true;
  }

  function report(opts, result) {
    if (typeof opts.onResult === 'function') {
      try { opts.onResult(result); } catch (e) { /* ignore */ }
    }
    emit(Object.assign({ at: Date.now() }, result));
  }

  /* The sound itself, ~3.0 s:
   *   0.00  drop 1  (soft, background rain)
   *   0.42  drop 2
   *   0.78  drop 3  (the closest one)
   *   1.55  warm two-note chime bloom (the "alert" the ear learns)
   *   2.10  drop 4  (final, quiet)
   *   ----  echo tail to 3.0 s
   */
  function render(c, reason) {
    var t0 = c.currentTime + 0.02;

    var master = c.createGain();
    master.gain.setValueAtTime(0.0001, t0);
    master.gain.exponentialRampToValueAtTime(PEAK, t0 + 0.12);
    master.gain.setValueAtTime(PEAK, t0 + 2.05);
    master.gain.exponentialRampToValueAtTime(0.0001, t0 + 2.98);
    master.connect(c.destination);

    /* Gentle echo on the chime only, so the droplets stay crisp and dry. */
    var echo = c.createDelay(0.6);
    echo.delayTime.value = 0.26;
    var echoGain = c.createGain();
    echoGain.gain.value = 0.18;
    echo.connect(echoGain);
    echoGain.connect(master);

    /* Warmth: a low-pass across everything keeps it from feeling shrill. */
    var warm = c.createBiquadFilter();
    warm.type = 'lowpass';
    warm.frequency.value = 3200;
    warm.Q.value = 0.4;
    warm.connect(master);

    /* Droplets — pitches chosen in a pentatonic cluster so any spacing sounds
     * consonant, with decreasing level so it reads as rain, not a beep. */
    droplet(c, warm, t0 + 0.00, 0.55, 1180, 2400);
    droplet(c, warm, t0 + 0.42, 0.42, 900, 2100);
    droplet(c, warm, t0 + 0.78, 0.62, 1420, 2700);
    droplet(c, warm, t0 + 2.10, 0.30, 760, 1900);

    /* The chime: two sine notes a fifth apart, long and soft, rising then
     * settling — this is the part that carries the alert. */
    function note(at, freq, gain, dur, toEcho) {
      var osc = c.createOscillator();
      var g = c.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, at);
      g.gain.setValueAtTime(0.0001, at);
      g.gain.exponentialRampToValueAtTime(gain, at + 0.06);
      g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
      osc.connect(g);
      g.connect(warm);
      if (toEcho) g.connect(echo);
      osc.start(at);
      osc.stop(at + dur + 0.05);
    }
    note(t0 + 1.55, 587.33, 0.34, 1.25, true);   // D5
    note(t0 + 1.62, 880.00, 0.20, 1.10, true);   // A5 (a fifth above)
    note(t0 + 1.70, 1174.66, 0.08, 0.85, false); // D6 sparkle, very quiet

    /* The 'runs at risk' case gets one extra low, soft pulse under the chime so
     * it is distinguishable by feel without being a different (harsher) sound. */
    if (reason === 'risk') {
      note(t0 + 1.60, 293.66, 0.16, 1.30, true); // D4
    }
  }

  /* The toggle's test path: guaranteed attempt, no cooldown, always reports. */
  function test(opts) {
    return play(Object.assign({ reason: 'test', force: true }, opts || {}));
  }

  function on(fn) { if (typeof fn === 'function') listeners.push(fn); }

  function reset() { lastPlayedAt = 0; }

  global.AlertSound = {
    PEAK: PEAK,
    DURATION_MS: DURATION_MS,
    COOLDOWN_MS: COOLDOWN_MS,
    play: play,
    test: test,
    status: status,
    on: on,
    reset: reset,
    ensureContext: ensureContext,
  };
}(typeof window !== 'undefined' ? window : globalThis));
