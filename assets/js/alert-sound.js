/* ============================================================================
 * alert-sound.js — the alert tone + the "already alerted" ledger
 *
 * ONE audio graph for the whole site, so the Replay Feed can chime for a
 * manager challenge, an official-scorer pending ruling, an official scoring
 * change or a run-at-risk review without ever stacking two tones on top of
 * each other.
 *
 * The tone is a ~3 s rain-drop shower: a handful of soft sine droplets with a
 * fast attack and a long exponential tail, a band-limited noise "hiss" that
 * sounds like rain on a window, and a warm two-note chime blooming underneath.
 * Everything is synthesized with WebAudio oscillators — there is no audio file
 * to download, decode or cache, which keeps the alert path free of network
 * latency and keeps the repository free of binary assets.  Because every drop
 * decays to a true zero and the whole shower is band-limited to ~300 Hz-3 kHz
 * at a low peak level, it stays pleasant when it has to be heard all day.
 *
 * Each tracked event gets a *motif* — the same pleasant shower with a different
 * droplet pattern and chime interval — so you can tell by ear whether the sound
 * was a review, a pending ruling, a scoring change or a run at risk:
 *
 *   review   🚨  three-note fall        (the reference "raindrop" chime)
 *   pending  📝  two rising droplets
 *   scoring  ✏️  single low bloom
 *   risk     ⚠️  urgent rising pair
 *   test     ▶️  the full demo shower (also played by the Test alert button)
 *
 * The ledger is the second half of this file.  Alerts are keyed by event id and
 * persisted per date in localStorage, so a refresh — or a second tab — never
 * replays a sound for something that already rang.  It is deliberately
 * separate from the feed log, so clearing or replacing the log can never cause
 * (or suppress) an alert.
 * ==========================================================================*/
(function (global) {
  'use strict';

  var LEDGER_PREFIX = 'mlbp.alerts.';
  var LEDGER_INDEX = 'mlbp.alerts.index';
  var KEEP_DATES = 7;
  var MAX_IDS_PER_DATE = 4000;
  var COOLDOWN_MS = 900;   /* one tone at a time, but never a long queue */

  var audioCtx = null;
  var lastPlayAt = 0;
  var ledgers = Object.create(null);   /* date -> { ids: {}, order: [] } */
  var listeners = [];

  /* ------------------------------------------------------------------ motifs
   * A motif is a droplet list ({at, freq, dur, gain}) relative to the start of
   * the shower, plus the warm chime interval (in semitone steps) that blooms
   * underneath it.  Frequencies stay inside the comfortable mid band. */
  var MOTIFS = {
    review: {
      label: 'Review / challenge',
      drops: [
        { at: 0.00, freq: 1180, dur: 0.20, gain: 0.50 },
        { at: 0.18, freq: 880, dur: 0.26, gain: 0.55 },
        { at: 0.42, freq: 1320, dur: 0.34, gain: 0.45 },
        { at: 0.70, freq: 660, dur: 0.85, gain: 0.50 },
        { at: 0.78, freq: 990, dur: 0.85, gain: 0.42 },
        { at: 1.35, freq: 1180, dur: 0.55, gain: 0.30 },
        { at: 1.90, freq: 784, dur: 0.95, gain: 0.26 },
      ],
      chime: [0, 7],          /* root + fifth — warm, open, no bite */
    },
    pending: {
      label: 'Official-scorer ruling pending',
      drops: [
        { at: 0.00, freq: 740, dur: 0.24, gain: 0.45 },
        { at: 0.30, freq: 988, dur: 0.30, gain: 0.50 },
        { at: 0.62, freq: 740, dur: 0.70, gain: 0.42 },
        { at: 1.10, freq: 1174, dur: 0.45, gain: 0.28 },
        { at: 1.70, freq: 880, dur: 0.9, gain: 0.24 },
      ],
      chime: [0, 5],          /* root + fourth — unresolved, "pending" */
    },
    scoring: {
      label: 'Official scoring change',
      drops: [
        { at: 0.00, freq: 523, dur: 0.30, gain: 0.45 },
        { at: 0.36, freq: 659, dur: 0.34, gain: 0.40 },
        { at: 0.86, freq: 523, dur: 1.0, gain: 0.34 },
        { at: 1.55, freq: 880, dur: 0.7, gain: 0.22 },
      ],
      chime: [0, 3],          /* minor third — settled, "logged" */
    },
    risk: {
      label: 'Runs at risk',
      drops: [
        { at: 0.00, freq: 1320, dur: 0.22, gain: 0.55 },
        { at: 0.22, freq: 1480, dur: 0.26, gain: 0.45 },
        { at: 0.55, freq: 1320, dur: 0.30, gain: 0.50 },
        { at: 0.92, freq: 990, dur: 0.70, gain: 0.40 },
        { at: 1.60, freq: 1320, dur: 0.80, gain: 0.30 },
      ],
      chime: [0, 8],          /* minor sixth — a little more urgent */
    },
    test: {
      label: 'Test alert',
      drops: [
        { at: 0.00, freq: 1046, dur: 0.20, gain: 0.45 },
        { at: 0.22, freq: 880, dur: 0.24, gain: 0.45 },
        { at: 0.50, freq: 698, dur: 0.30, gain: 0.45 },
        { at: 0.82, freq: 1046, dur: 0.40, gain: 0.40 },
        { at: 1.20, freq: 1318, dur: 0.45, gain: 0.34 },
        { at: 1.70, freq: 880, dur: 0.70, gain: 0.30 },
        { at: 2.20, freq: 1046, dur: 0.75, gain: 0.24 },
      ],
      chime: [0, 4, 7],       /* major triad — the full demo shower */
    },
  };

  /* ------------------------------------------------------------------ audio */

  function contextClass() {
    return global.AudioContext || global.webkitAudioContext || null;
  }

  function audioAvailable() {
    return !!contextClass();
  }

  /* Lazily create (and, when a browser suspended it, resume) the shared
   * context.  Browsers only allow this after a user gesture; the pages call
   * unlock() from their first click/keypress, and every alert path tolerates a
   * still-suspended context by simply returning false. */
  function unlock() {
    var Ctx = contextClass();
    if (!Ctx) return false;
    if (!audioCtx) {
      try { audioCtx = new Ctx(); } catch (e) { audioCtx = null; return false; }
    }
    try {
      if (audioCtx.state === 'suspended' && audioCtx.resume) {
        var resumed = audioCtx.resume();
        if (resumed && resumed.catch) resumed.catch(function () { /* stays suspended */ });
      }
    } catch (e) { /* ignore */ }
    return true;
  }

  function bothDrops(at, freq, dur, gain, master) {
    var osc = audioCtx.createOscillator();
    var env = audioCtx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, at);
    /* a drop falling: a gentle downward glide, never a swoop */
    osc.frequency.exponentialRampToValueAtTime(Math.max(60, freq * 0.92), at + dur);
    env.gain.setValueAtTime(0.0001, at);
    env.gain.exponentialRampToValueAtTime(gain, at + 0.02);
    env.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    osc.connect(env);
    env.connect(master);
    osc.start(at);
    osc.stop(at + dur + 0.05);
  }

  /* Soft rain hiss: white noise through a gentle band-pass, breathing in and
   * out so it reads as rain rather than static. */
  function rainHiss(t0, length, master) {
    var samples = Math.max(1, Math.floor(audioCtx.sampleRate * length));
    var buffer;
    try { buffer = audioCtx.createBuffer(1, samples, audioCtx.sampleRate); } catch (e) { return; }
    var data = buffer.getChannelData(0);
    for (var i = 0; i < samples; i += 1) {
      /* deterministic-ish noise: fine for a texture, and cheap */
      data[i] = (Math.random() * 2 - 1) * 0.6;
    }
    var src = audioCtx.createBufferSource();
    src.buffer = buffer;
    var band = audioCtx.createBiquadFilter();
    band.type = 'bandpass';
    band.frequency.setValueAtTime(1800, t0);
    band.frequency.linearRampToValueAtTime(2600, t0 + length * 0.6);
    band.Q.value = 0.7;
    var env = audioCtx.createGain();
    env.gain.setValueAtTime(0.0001, t0);
    env.gain.linearRampToValueAtTime(0.05, t0 + 0.25);
    env.gain.linearRampToValueAtTime(0.035, t0 + length * 0.7);
    env.gain.exponentialRampToValueAtTime(0.0001, t0 + length);
    src.connect(band);
    band.connect(env);
    env.connect(master);
    src.start(t0);
    src.stop(t0 + length + 0.05);
  }

  function playMotif(motif, opts) {
    if (!motif) return false;
    if (!unlock() || !audioCtx) return false;
    try {
      var t0 = audioCtx.currentTime + 0.02;

      /* master: the whole shower fades out over ~3s, so nothing ever rings on
       * past the alert and two alerts can never overlap into clipping. */
      var master = audioCtx.createGain();
      master.gain.setValueAtTime(0.0001, t0);
      master.gain.exponentialRampToValueAtTime(opts && opts.volume ? opts.volume : 0.30, t0 + 0.08);
      master.gain.exponentialRampToValueAtTime(0.0001, t0 + 3.0);
      master.connect(audioCtx.destination);

      /* a short room echo makes the droplets feel like they land somewhere */
      var echo = audioCtx.createDelay(0.5);
      echo.delayTime.value = 0.23;
      var echoGain = audioCtx.createGain();
      echoGain.gain.value = 0.26;
      master.connect(echo);
      echo.connect(echoGain);
      echoGain.connect(audioCtx.destination);

      if (!opts || opts.hiss !== false) rainHiss(t0, 2.6, master);

      motif.drops.forEach(function (d) {
        bothDrops(t0 + d.at, d.freq, d.dur, d.gain, master);
      });

      /* the warm chime underneath: root then the motif's intervals, each a
       * fifth above the drop pattern's register so it blends rather than
       * competes */
      (motif.chime || []).forEach(function (semi, index) {
        var base = 392;                                  /* G4 */
        var freq = base * Math.pow(2, semi / 12);
        bothDrops(t0 + 0.55 + index * 0.16, freq, 1.6, 0.30 - index * 0.05, master);
      });

      if (opts && opts.onDone) {
        setTimeout(opts.onDone, 3100);
      }
      return true;
    } catch (e) {
      return false;
    }
  }

  /**
   * play(kind, opts)
   *   kind  'review' | 'pending' | 'scoring' | 'risk' | 'test'
   *   opts  { force, volume, hiss, onDone }
   * Returns true when a tone was actually started.  Unless `force` is set, a
   * second call inside COOLDOWN_MS is dropped: an alert system that fires for
   * six games at once must still be pleasant to listen to.
   */
  function play(kind, opts) {
    opts = opts || {};
    var motif = MOTIFS[kind] || MOTIFS.review;
    var now = Date.now();
    if (!opts.force && now - lastPlayAt < COOLDOWN_MS) return false;
    var started = playMotif(motif, opts);
    if (started) {
      lastPlayAt = now;
      emit({ type: 'play', kind: kind in MOTIFS ? kind : 'review', at: now });
    }
    return started;
  }

  /* "Test the alert" — always plays, ignores the cooldown, and reports what
   * happened so the page can tell the user (audio blocked / no WebAudio). */
  function test() {
    if (!audioAvailable()) {
      emit({ type: 'test-result', ok: false, reason: 'no-webaudio' });
      return { ok: false, reason: 'no-webaudio' };
    }
    var ok = play('test', { force: true, volume: 0.34 });
    if (!ok) {
      emit({ type: 'test-result', ok: false, reason: 'blocked' });
      return { ok: false, reason: 'blocked' };
    }
    emit({ type: 'test-result', ok: true });
    return { ok: true };
  }

  function preview(kind) {
    return play(kind || 'review', { force: true, volume: 0.30 });
  }

  /* ----------------------------------------------------------------- ledger
   * Note: the key is the *event* id (gamePk:atBatIndex:playIndex:code), so a
   * review that is still under review and later resolved is a single alert,
   * not two.  "Runs at risk" uses the same event id with a ':risk' suffix so
   * the same review can legitimately ring twice (once when it opens, once when
   * a scoring movement makes a run removable). */

  function readIndex() {
    try {
      var raw = global.localStorage.getItem(LEDGER_INDEX);
      var parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch (e) { return []; }
  }

  function writeIndex(dates) {
    var sorted = dates.slice().sort();
    while (sorted.length > KEEP_DATES) {
      var drop = sorted.shift();
      try { global.localStorage.removeItem(LEDGER_PREFIX + drop); } catch (e) { /* ignore */ }
      delete ledgers[drop];
    }
    try { global.localStorage.setItem(LEDGER_INDEX, JSON.stringify(sorted)); } catch (e) { /* ignore */ }
  }

  function ledgerFor(date) {
    if (ledgers[date]) return ledgers[date];
    var ledger = { ids: Object.create(null), order: [] };
    try {
      var raw = global.localStorage.getItem(LEDGER_PREFIX + date);
      if (raw) {
        var parsed = JSON.parse(raw);
        if (parsed && Array.isArray(parsed.order) && parsed.ids && typeof parsed.ids === 'object') {
          ledger = { ids: parsed.ids, order: parsed.order.slice() };
        }
      }
    } catch (e) { /* a corrupt ledger must never break the page */ }
    ledgers[date] = ledger;
    return ledger;
  }

  function writeLedger(date, ledger) {
    try {
      global.localStorage.setItem(LEDGER_PREFIX + date, JSON.stringify(ledger));
      var index = readIndex();
      if (index.indexOf(date) === -1) {
        index.push(date);
        writeIndex(index);
      }
    } catch (e) { /* quota / private mode: alerts still work in-memory */ }
  }

  /** Has this alert already rung for this date? */
  function has(date, id) {
    if (!date || !id) return false;
    return ledgerFor(date).ids[id] === 1;
  }

  /**
   * Mark an alert as rung.  Returns true when this call is the one that claims
   * it — so `if (AlertSound.claim(date, id)) play(...)` rings exactly once even
   * if two scans race.
   */
  function claim(date, id) {
    if (!date || !id) return false;
    var ledger = ledgerFor(date);
    if (ledger.ids[id] === 1) return false;
    ledger.ids[id] = 1;
    ledger.order.push(id);
    if (ledger.order.length > MAX_IDS_PER_DATE) {
      var evicted = ledger.order.shift();
      delete ledger.ids[evicted];
    }
    writeLedger(date, ledger);
    return true;
  }

  function count(date) {
    return ledgerFor(date).order.length;
  }

  function forget(date) {
    if (!date) return;
    ledgers[date] = { ids: Object.create(null), order: [] };
    try { global.localStorage.removeItem(LEDGER_PREFIX + date); } catch (e) { /* ignore */ }
  }

  /* --------------------------------------------------------------- observer */

  function onEvent(fn) {
    if (typeof fn === 'function') listeners.push(fn);
  }

  function emit(payload) {
    listeners.forEach(function (fn) {
      try { fn(payload); } catch (e) { /* a listener must never break audio */ }
    });
  }

  global.AlertSound = {
    MOTIFS: MOTIFS,
    COOLDOWN_MS: COOLDOWN_MS,
    audioAvailable: audioAvailable,
    unlock: unlock,
    play: play,
    preview: preview,
    test: test,
    has: has,
    claim: claim,
    count: count,
    forget: forget,
    onEvent: onEvent,
    state: function () {
      return {
        contextState: audioCtx ? audioCtx.state : 'none',
        lastPlayAt: lastPlayAt,
      };
    },
  };
}(window));
